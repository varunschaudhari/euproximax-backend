const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Quote — the Phase 4 quotation for a case (spec §5 Phase 4). One quote per case
 * (editable while draft). Its lifecycle is coupled to the case state machine:
 * draft → QUOTE_DRAFTED, internal approval → QUOTE_APPROVED_INTERNAL,
 * send → QUOTE_SENT, client accept/reject → CLIENT_APPROVED_QUOTE / QUOTE_REJECTED.
 */
const LineItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 0 },
    unitPrice: { type: Number, default: 0, min: 0 },
    amount: { type: Number, default: 0 } // quantity * unitPrice (computed)
  },
  { _id: false }
);

const QuoteSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: 'Case', required: true, unique: true },
    title: { type: String, trim: true },
    lineItems: { type: [LineItemSchema], default: [] },

    currency: { type: String, default: 'INR' },
    subtotal: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 18 },
    gstAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    notes: { type: String, trim: true },
    validUntil: { type: Date },

    status: {
      type: String,
      enum: ['draft', 'approved_internal', 'sent', 'accepted', 'rejected'],
      default: 'draft'
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    internalApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    internalApprovedAt: { type: Date },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
    sentAt: { type: Date },

    clientDecisionAt: { type: Date },
    clientDecisionNote: { type: String, trim: true }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

/** Recompute line and roll-up totals from the current line items + gstPercent. */
QuoteSchema.methods.recomputeTotals = function recomputeTotals() {
  let subtotal = 0;
  this.lineItems = (this.lineItems || []).map((li) => {
    const amount = Math.round((li.quantity || 0) * (li.unitPrice || 0) * 100) / 100;
    subtotal += amount;
    return { description: li.description, quantity: li.quantity || 0, unitPrice: li.unitPrice || 0, amount };
  });
  this.subtotal = Math.round(subtotal * 100) / 100;
  this.gstAmount = Math.round(subtotal * ((this.gstPercent || 0) / 100) * 100) / 100;
  this.total = Math.round((this.subtotal + this.gstAmount) * 100) / 100;
};

module.exports = mongoose.models.Quote || mongoose.model('Quote', QuoteSchema);
