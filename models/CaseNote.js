const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * CaseNote — an internal staff comment on a case. Never shown to clients
 * (the client portal does not read this collection). Forms the collaboration
 * thread on a case and feeds the unified activity timeline.
 */
const CaseNoteSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: 'Case', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

CaseNoteSchema.index({ caseId: 1, createdAt: -1 });

module.exports = mongoose.models.CaseNote || mongoose.model('CaseNote', CaseNoteSchema);
