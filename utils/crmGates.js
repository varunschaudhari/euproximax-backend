/**
 * Business gates for case status transitions (spec §1, §5, §6, §9).
 *
 * These enforce the "hard gates" the state machine sequence alone can't:
 *  - payment gates: certain stages require a confirmed (paid) client payment;
 *  - filing-data gates: strategy + application details must exist before filing.
 *
 * The state-machine sequence and track branching are validated separately
 * (utils/crmStateMachine.js). Owner override is handled by the caller.
 */
const Payment = require('../models/Payment');

// Target status -> client payment type(s) that must be `paid` first.
const PAYMENT_GATE = {
  PRIOR_ART_PAYMENT_RECEIVED: { types: ['prior_art_search'], label: 'prior art search' },
  PROTOTYPE_PAYMENT_RECEIVED: { types: ['prototype'], label: 'prototype' },
  DRAFTING_PAYMENT_RECEIVED: { types: ['drafting'], label: 'drafting' },
  FILING_PAYMENT_RECEIVED: { types: ['filing_govt', 'filing_professional'], label: 'filing' },
  RENEWAL_PAYMENT_RECEIVED: { types: ['renewal_govt', 'renewal_management'], label: 'renewal' }
};

/**
 * Check business gates for a transition to `newStatus`.
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
const checkStatusGate = async (caseDoc, newStatus) => {
  // 1. Payment gate — a matching client payment must be confirmed paid.
  const gate = PAYMENT_GATE[newStatus];
  if (gate) {
    const paid = await Payment.findOne({
      caseId: caseDoc._id,
      type: { $in: gate.types },
      status: 'paid'
    }).select('_id');
    if (!paid) {
      return {
        ok: false,
        message: `Cannot proceed — record a confirmed (paid) ${gate.label} payment on this case first. Create the milestone and mark it paid, then retry.`
      };
    }
  }

  // 2. Filing strategy required before the filing invoice goes out.
  if (newStatus === 'FILING_INVOICE_SENT') {
    if (!caseDoc.filingType || !(caseDoc.jurisdiction && caseDoc.jurisdiction.length)) {
      return {
        ok: false,
        message: 'Set the filing strategy (filing type + at least one jurisdiction) before raising the filing invoice.'
      };
    }
  }

  // 2b. Filing readiness checklist must be fully complete.
  if (newStatus === 'FILING_CHECKLIST_COMPLETE') {
    const list = caseDoc.filingChecklist || [];
    if (list.length === 0 || list.some((i) => !i.done)) {
      const pending = list.filter((i) => !i.done).length || 'all';
      return {
        ok: false,
        message: `Complete the filing checklist first (${pending} item(s) pending).`
      };
    }
  }

  // 3. Application details required to record the application as filed.
  if (newStatus === 'FILED' || newStatus === 'FILING_ACKNOWLEDGED') {
    const missing = [];
    if (!caseDoc.applicationNumber) missing.push('application number');
    if (!caseDoc.filingDate) missing.push('filing date');
    if (missing.length) {
      return {
        ok: false,
        message: `Record the ${missing.join(' and ')} (Edit details) before marking the application filed — these also drive the statutory deadlines.`
      };
    }
  }

  return { ok: true };
};

// Roles permitted to change case status (spec §3 permission matrix).
const STATUS_CHANGE_ROLES = ['owner', 'super admin', 'admin', 'superuser', 'Higher Management', 'attorney', 'pm'];
// Roles permitted to override a gate (spec §3 — "Override payment gate": owner).
const GATE_OVERRIDE_ROLES = ['owner', 'super admin', 'admin', 'superuser', 'Higher Management'];

module.exports = { PAYMENT_GATE, checkStatusGate, STATUS_CHANGE_ROLES, GATE_OVERRIDE_ROLES };
