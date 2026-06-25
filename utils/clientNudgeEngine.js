/**
 * Client-nudge engine. Chases clients who are holding up the pipeline — a case
 * sitting in an "awaiting client" status with no response. Escalating reminders
 * at 3 / 7 / 14 days, de-duplicated per status-entry so it never spams. Runs in
 * the same daily sweep as deadlines/payments. (Invoice-sent statuses are handled
 * by the payment overdue sweep, so they're excluded here.)
 */
const Case = require('../models/Case');
const logger = require('./logger');
const { notifyClientPendingAction } = require('./notify');

const DAY_MS = 24 * 60 * 60 * 1000;
const THRESHOLDS = [3, 7, 14];

// Statuses where the case waits on the client, with the action phrasing.
const PENDING_ACTION = {
  NDA_SENT: 'sign the confidentiality agreement (NDA)',
  DISCLOSURE_SENT: 'complete your invention disclosure',
  CLARIFICATION_REQUESTED: 'respond to our clarification questions',
  QUOTE_SENT: 'review and approve the quotation',
  DRAFT_SENT_TO_CLIENT: 'review the patent draft',
  PROTOTYPE_DELIVERED: 'review and sign off on the prototype'
};

const statusEnteredAt = (caseDoc) => {
  const h = caseDoc.statusHistory || [];
  return h.length ? new Date(h[h.length - 1].changedAt) : new Date(caseDoc.updatedAt);
};

const runClientNudgeSweep = async () => {
  const summary = { checked: 0, nudged: 0 };
  const cases = await Case.find({
    status: { $in: Object.keys(PENDING_ACTION) },
    isClosed: { $ne: true },
    isOnHold: { $ne: true }
  });

  for (const caseDoc of cases) {
    summary.checked += 1;
    const enteredAt = statusEnteredAt(caseDoc);
    const daysWaiting = Math.floor((Date.now() - enteredAt.getTime()) / DAY_MS);

    // Reset the per-status-entry tracker when the case (re)entered this status.
    if (String(caseDoc.clientNudgeStatusAt) !== String(enteredAt)) {
      caseDoc.clientNudgeStatusAt = enteredAt;
      caseDoc.clientNudgeDays = [];
    }

    const due = THRESHOLDS.filter((t) => daysWaiting >= t && !caseDoc.clientNudgeDays.includes(t));
    if (due.length) {
      caseDoc.clientNudgeDays.push(...due);
      await caseDoc.save();
      await notifyClientPendingAction(caseDoc, daysWaiting, PENDING_ACTION[caseDoc.status]);
      summary.nudged += 1;
    } else if (!caseDoc.clientNudgeStatusAt || caseDoc.isModified()) {
      await caseDoc.save();
    }
  }

  logger.info(`Client nudge sweep: checked ${summary.checked}, nudged ${summary.nudged}`);
  return summary;
};

module.exports = { runClientNudgeSweep, PENDING_ACTION };
