/**
 * Case workflow engine — the single place a status transition is applied.
 *
 * Used by both the manual status endpoint (case.controller.updateStatus, which
 * adds role + gate checks first) and event-driven auto-advances (e.g. a payment
 * being confirmed). Keeps side-effects (statutory deadlines, document locking,
 * client notification) consistent no matter what triggered the change.
 */
const Document = require('../models/Document');
const Notification = require('../models/Notification');
const { isValidTransition, getPhaseForStatus, TERMINAL_STATUSES } = require('./crmStateMachine');
const { createFilingDeadlines, createFerResponseDeadline, createRenewalSchedule } = require('./deadlineEngine');
const { notifyCaseStatusChange } = require('./notify');
const logger = require('./logger');

// Documents locked read-only when a case reaches these statuses (spec §15).
const DOC_LOCK_MAP = {
  DRAFT_APPROVED_BY_CLIENT: ['draft_v1', 'draft_final'],
  FILING_ACKNOWLEDGED: ['filing_receipt', 'application_copy'],
  PATENT_ACTIVE: ['grant_certificate']
};

/** Run the side-effects that follow a status change (best-effort, never throws). */
const runStatusSideEffects = async (caseDoc, newStatus, userId) => {
  try {
    if (newStatus === 'FILING_ACKNOWLEDGED') await createFilingDeadlines(caseDoc, userId);
    else if (newStatus === 'FER_RECEIVED') await createFerResponseDeadline(caseDoc, userId);
    else if (newStatus === 'PATENT_ACTIVE') await createRenewalSchedule(caseDoc, userId);
  } catch (err) {
    logger.error('Deadline side-effect failed', { error: err.message });
  }

  if (DOC_LOCK_MAP[newStatus]) {
    try {
      await Document.updateMany(
        { caseId: caseDoc._id, type: { $in: DOC_LOCK_MAP[newStatus] } },
        { $set: { isLockedReadOnly: true } }
      );
    } catch (err) {
      logger.error('Document auto-lock failed', { error: err.message });
    }
  }

  // Scope-change alert when drafting revisions exceed the agreed count (spec §5).
  if (newStatus === 'CLIENT_FEEDBACK_RECEIVED' && caseDoc.scopeChangeFlagged) {
    try {
      await Notification.create({
        caseId: caseDoc._id,
        recipientType: 'internal',
        channel: 'in_app',
        trigger: 'scope_change',
        subject: `Scope change — ${caseDoc.caseNumber} exceeded agreed revisions`,
        body: `Revision ${caseDoc.revisionCount} of an agreed ${caseDoc.agreedRevisions}. Raise a supplementary invoice before proceeding.`,
        status: 'sent',
        sentAt: new Date()
      });
    } catch (err) {
      logger.error('Scope-change alert failed', { error: err.message });
    }
  }

  // Client status-change notification (best-effort, non-blocking).
  notifyCaseStatusChange(caseDoc).catch(() => {});
};

/**
 * Apply a transition to a case document (mutates + saves) and run side-effects.
 * Validates the sequence/track only — callers enforce role/business gates.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
const applyTransition = async (caseDoc, newStatus, { userId, note } = {}) => {
  if (!isValidTransition(caseDoc.status, newStatus, caseDoc.track)) {
    return { ok: false, error: `Invalid transition from ${caseDoc.status} to ${newStatus}` };
  }

  caseDoc.status = newStatus;
  caseDoc.phase = getPhaseForStatus(newStatus) || caseDoc.phase;
  caseDoc.statusHistory.push({
    status: newStatus,
    changedBy: userId || undefined,
    changedAt: new Date(),
    note: note || ''
  });

  if (TERMINAL_STATUSES.includes(newStatus)) {
    caseDoc.isClosed = true;
    caseDoc.closeReason = caseDoc.closeReason || `Reached terminal status ${newStatus}`;
  }

  // Count drafting revisions; flag a scope change once past the agreed count.
  if (newStatus === 'CLIENT_FEEDBACK_RECEIVED') {
    caseDoc.revisionCount = (caseDoc.revisionCount || 0) + 1;
    if (caseDoc.revisionCount > (caseDoc.agreedRevisions || 0)) {
      caseDoc.scopeChangeFlagged = true;
    }
  }

  await caseDoc.save();
  await runStatusSideEffects(caseDoc, newStatus, userId);
  return { ok: true };
};

module.exports = { applyTransition, runStatusSideEffects };
