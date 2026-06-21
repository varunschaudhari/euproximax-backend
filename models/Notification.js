const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Notification — a logged email / WhatsApp / in-app message, plus its delivery
 * status. Every case status change creates one (see notification system, spec §11).
 */
const NotificationSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: 'Case' },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User' },
    recipientType: { type: String, enum: ['client', 'internal'] },

    channel: { type: String, enum: ['email', 'whatsapp', 'in_app'] },

    trigger: { type: String }, // e.g. 'status_change', 'payment_due', 'deadline_reminder'
    subject: { type: String },
    body: { type: String },

    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    sentAt: { type: Date },
    errorMessage: { type: String },

    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

NotificationSchema.index({ caseId: 1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
