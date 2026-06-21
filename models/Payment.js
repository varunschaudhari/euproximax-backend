const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Payment milestone / invoice. Razorpay fields populated when the client pays
 * online. No vendor payment may be raised before the matching client payment
 * is `paid` (enforced in the vendor engagement controller).
 */
const PaymentSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: 'Case', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },

    type: {
      type: String,
      enum: [
        'prior_art_search',
        'prototype',
        'drafting',
        'filing_govt',
        'filing_professional',
        'examination',
        'objection_response',
        'renewal_govt',
        'renewal_management',
        'pct_national_phase',
        'licensing_consultation',
        'supplementary'
      ],
      required: true
    },

    milestoneLabel: { type: String }, // human-readable e.g. "Drafting Fee"
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    gstPercent: { type: Number, default: 18 },
    gstAmount: { type: Number },
    totalAmount: { type: Number },

    status: {
      type: String,
      enum: ['pending', 'invoice_sent', 'paid', 'overdue', 'waived'],
      default: 'pending'
    },

    // Payment plan
    isPlanPayment: { type: Boolean, default: false },
    planInstalment: { type: Number },

    invoiceNumber: { type: String, unique: true, sparse: true },
    invoiceUrl: { type: String },

    // Razorpay
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    invoicedAt: { type: Date },
    dueDate: { type: Date },
    paidAt: { type: Date },

    // Overdue reminders
    remindersSent: [{ sentAt: Date, type: String }],

    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

PaymentSchema.index({ caseId: 1 });
PaymentSchema.index({ status: 1 });

module.exports = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);
