/**
 * Next-action engine — given a case status (and track), returns the single next
 * step and which role owns it. Powers the worklist columns on the Cases list,
 * the case page, and role dashboards. `owner` is a role: client | pm | attorney
 * | accounts | owner | system.
 */
const NEXT_ACTION = {
  INTAKE_RECEIVED: { label: 'Review intake & confirm track', owner: 'pm' },
  INTAKE_UNDER_REVIEW: { label: 'Feasibility pre-screen — go / no-go', owner: 'attorney' },
  NEEDS_REFINEMENT: { label: 'Refine the idea with the client', owner: 'pm' },
  QUALIFIED: { label: 'Raise the prior-art search invoice', owner: 'accounts' },
  PRIOR_ART_INVOICE_SENT: { label: 'Awaiting client payment', owner: 'client' },
  PRIOR_ART_PAYMENT_RECEIVED: { label: 'Brief the prior-art vendor', owner: 'pm' },
  PRIOR_ART_VENDOR_BRIEFED: { label: 'Vendor briefed — start work', owner: 'pm' },
  PRIOR_ART_IN_PROGRESS: { label: 'Awaiting vendor report', owner: 'pm' },
  PRIOR_ART_DELIVERED: { label: 'Confirm novelty — go / no-go', owner: 'attorney' },
  PRIOR_ART_CONFIRMED: {
    A: { label: 'Raise the prototype invoice', owner: 'accounts' },
    B: { label: 'Send the NDA', owner: 'pm' }
  },
  PROTOTYPE_INVOICE_SENT: { label: 'Awaiting prototype payment', owner: 'client' },
  PROTOTYPE_PAYMENT_RECEIVED: { label: 'Brief the prototype vendor', owner: 'pm' },
  PROTOTYPE_VENDOR_BRIEFED: { label: 'Track the prototype build', owner: 'pm' },
  PROTOTYPE_IN_PROGRESS: { label: 'Track the prototype build', owner: 'pm' },
  PROTOTYPE_DELIVERED: { label: 'Arrange demo & collect sign-off', owner: 'pm' },
  PROTOTYPE_CLIENT_SIGNOFF: { label: 'Send the NDA', owner: 'pm' },
  NDA_SENT: { label: 'Awaiting client NDA signature', owner: 'client' },
  NDA_SIGNED: { label: 'Send the disclosure form', owner: 'pm' },
  DISCLOSURE_SENT: { label: 'Awaiting client disclosure', owner: 'client' },
  DISCLOSURE_RECEIVED: { label: 'Review the disclosure', owner: 'attorney' },
  DISCLOSURE_UNDER_REVIEW: { label: 'Review / raise clarifications', owner: 'attorney' },
  CLARIFICATION_REQUESTED: { label: 'Awaiting client clarification', owner: 'client' },
  CLARIFICATION_RECEIVED: { label: 'Re-review the disclosure', owner: 'attorney' },
  DISCLOSURE_APPROVED: { label: 'Decide the filing strategy', owner: 'attorney' },
  STRATEGY_DISCUSSION: { label: 'Lock the filing strategy', owner: 'attorney' },
  STRATEGY_LOCKED: { label: 'Prepare the quotation', owner: 'pm' },
  QUOTE_DRAFTED: { label: 'Approve the quote internally', owner: 'owner' },
  QUOTE_APPROVED_INTERNAL: { label: 'Send the quote to the client', owner: 'pm' },
  QUOTE_SENT: { label: 'Awaiting client quote approval', owner: 'client' },
  CLIENT_APPROVED_QUOTE: { label: 'Raise the drafting invoice', owner: 'accounts' },
  DRAFTING_INVOICE_SENT: { label: 'Awaiting drafting payment', owner: 'client' },
  DRAFTING_PAYMENT_RECEIVED: { label: 'Begin drafting', owner: 'attorney' },
  DRAFTING_IN_PROGRESS: { label: 'Draft the specification', owner: 'attorney' },
  INTERNAL_REVIEW: { label: 'Internal legal review', owner: 'attorney' },
  DRAFT_SENT_TO_CLIENT: { label: 'Awaiting client draft review', owner: 'client' },
  CLIENT_FEEDBACK_RECEIVED: { label: 'Incorporate revisions', owner: 'attorney' },
  REVISIONS_IN_PROGRESS: { label: 'Revise & resend the draft', owner: 'attorney' },
  DRAFT_APPROVED_BY_CLIENT: { label: 'Raise the filing invoice', owner: 'accounts' },
  FILING_INVOICE_SENT: { label: 'Awaiting filing payment', owner: 'client' },
  FILING_PAYMENT_RECEIVED: { label: 'Complete the filing checklist', owner: 'pm' },
  FILING_CHECKLIST_IN_PROGRESS: { label: 'Complete the filing checklist', owner: 'pm' },
  FILING_CHECKLIST_COMPLETE: { label: 'Prepare government forms', owner: 'attorney' },
  FILING_IN_PROGRESS: { label: 'Submit to the patent office', owner: 'attorney' },
  FILED: { label: 'Record acknowledgement & app number', owner: 'attorney' },
  FILING_ACKNOWLEDGED: { label: 'Monitor for publication', owner: 'attorney' },
  AWAITING_PUBLICATION: { label: 'Awaiting publication', owner: 'system' },
  PUBLISHED: { label: 'File request for examination (RFE)', owner: 'attorney' },
  RFE_PENDING: { label: 'File request for examination (RFE)', owner: 'attorney' },
  RFE_FILED: { label: 'Awaiting examination', owner: 'system' },
  EXAMINATION_IN_PROGRESS: { label: 'Awaiting FER / decision', owner: 'system' },
  FER_RECEIVED: { label: 'Respond to the FER', owner: 'attorney' },
  OBJECTION_RESPONSE_IN_PROGRESS: { label: 'Draft the objection response', owner: 'attorney' },
  OBJECTION_RESPONSE_FILED: { label: 'Awaiting outcome', owner: 'system' },
  HEARING_SCHEDULED: { label: 'Prepare for the hearing', owner: 'attorney' },
  HEARING_COMPLETED: { label: 'Awaiting decision', owner: 'system' },
  FURTHER_ACTION_REQUIRED: { label: 'Address the further action', owner: 'attorney' },
  GRANTED: { label: 'Upload the grant certificate', owner: 'pm' },
  CERTIFICATE_RECEIVED: { label: 'Mark the patent active', owner: 'pm' },
  PATENT_ACTIVE: { label: 'Renewals scheduled — monitor', owner: 'system' },
  RENEWAL_INVOICE_SENT: { label: 'Awaiting renewal payment', owner: 'client' },
  RENEWAL_PAYMENT_RECEIVED: { label: 'File the renewal', owner: 'attorney' },
  RENEWAL_FILED: { label: 'Record renewal confirmation', owner: 'system' },
  RENEWAL_CONFIRMED: { label: 'Next renewal scheduled', owner: 'system' }
};

/** @returns {{label:string, owner:string}|null} */
const getNextAction = (status, track) => {
  const entry = NEXT_ACTION[status];
  if (!entry) return null;
  if (entry.A || entry.B) return entry[track] || entry.B || null;
  return entry;
};

module.exports = { getNextAction };
