const mongoose = require('mongoose');
const { Schema } = mongoose;
const { ALL_STATUSES, INITIAL_STATUS } = require('../utils/crmStateMachine');

/**
 * Patent Case — the central CRM entity. One case per patent application,
 * driven through the state machine in utils/crmStateMachine.js.
 */
const CaseSchema = new Schema(
  {
    caseNumber: { type: String, unique: true }, // auto-generated e.g. PAT-2026-001
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    // Source enquiry this case was converted from (intake pipeline). Optional —
    // cases can also be created directly.
    enquiryId: { type: Schema.Types.ObjectId, ref: 'ContactMessage' },
    track: { type: String, enum: ['A', 'B'], required: true },
    status: { type: String, enum: ALL_STATUSES, required: true, default: INITIAL_STATUS },
    phase: { type: Number, min: 1, max: 9, default: 1 },

    // Assignments
    assignedPM: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAttorney: { type: Schema.Types.ObjectId, ref: 'User' },

    // Invention details
    inventionTitle: { type: String, trim: true },
    inventionDomain: { type: String, trim: true },
    inventionSummary: { type: String },

    // Filing details (populated at Phase 6)
    filingType: { type: String, enum: ['provisional', 'complete', 'pct'] },
    jurisdiction: [{ type: String, enum: ['india', 'usa', 'pct'] }],
    applicationNumber: { type: String },
    filingDate: { type: Date },
    priorityDate: { type: Date },
    publicationDate: { type: Date },
    grantDate: { type: Date },

    // Patent details (populated at Phase 8)
    patentNumber: { type: String },
    journalIssueNumber: { type: String },
    validUntil: { type: Date }, // 20 years from filing

    // Tracking
    statusHistory: [
      {
        status: String,
        changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        changedAt: { type: Date, default: Date.now },
        note: String
      }
    ],

    // Strategy lock
    strategyLockedAt: { type: Date },
    strategyLockedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // Flags
    isOnHold: { type: Boolean, default: false },
    holdReason: { type: String },
    isClosed: { type: Boolean, default: false },
    closeReason: { type: String }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

CaseSchema.index({ status: 1 });
CaseSchema.index({ assignedPM: 1 });
CaseSchema.index({ assignedAttorney: 1 });
CaseSchema.index({ clientId: 1 });
CaseSchema.index({ enquiryId: 1 });

module.exports = mongoose.models.Case || mongoose.model('Case', CaseSchema);
