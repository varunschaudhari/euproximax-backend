const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Deadline — a statutory or internal due date for a case (RFE, FER response,
 * hearing, renewal, payment). The deadline engine (cron) escalates reminders.
 */
const DeadlineSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: 'Case', required: true },
    type: {
      type: String,
      enum: ['rfe_filing', 'fer_response', 'hearing', 'renewal', 'payment_due', 'custom']
    },
    label: { type: String, required: true },

    statutoryDeadline: { type: Date, required: true }, // hard government deadline
    internalDeadline: { type: Date }, // internal buffer deadline (e.g. T-15 days)

    ownerId: { type: Schema.Types.ObjectId, ref: 'User' }, // single owner

    status: {
      type: String,
      enum: ['active', 'completed', 'missed', 'extended'],
      default: 'active'
    },

    completedAt: { type: Date },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    reminders: [
      {
        daysBeforeDeadline: Number,
        sentAt: Date,
        sentTo: [{ type: Schema.Types.ObjectId, ref: 'User' }]
      }
    ],

    escalationLevel: { type: Number, default: 0 }, // 0=normal, 1=senior, 2=admin

    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

DeadlineSchema.index({ caseId: 1 });
DeadlineSchema.index({ status: 1, statutoryDeadline: 1 });

module.exports = mongoose.models.Deadline || mongoose.model('Deadline', DeadlineSchema);
