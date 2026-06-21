const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * VendorEngagement — links a Vendor to a Case for one piece of work.
 * Tracks margin and the vendor-payment gate (vendor payment blocked until the
 * linked client Payment is confirmed `paid`).
 */
const VendorEngagementSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: 'Case', required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true },
    type: { type: String, enum: ['prior_art', 'prototype'] },

    briefedAt: { type: Date },
    briefingNotes: { type: String },
    expectedDelivery: { type: Date },

    status: {
      type: String,
      enum: ['briefed', 'in_progress', 'delivered', 'approved', 'rejected'],
      default: 'briefed'
    },

    vendorQuoteAmount: { type: Number },
    clientChargedAmount: { type: Number },
    margin: { type: Number }, // clientChargedAmount - vendorQuoteAmount

    // Vendor payment
    vendorPaymentStatus: {
      type: String,
      enum: ['pending', 'approved', 'paid'],
      default: 'pending'
    },
    vendorPaymentApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    vendorPaymentApprovedAt: { type: Date },
    vendorPaidAt: { type: Date },
    vendorPaymentRef: { type: String },

    // Gate: vendor payment blocked until this client payment is confirmed
    clientPaymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },

    deliveredAt: { type: Date },
    deliveryNotes: { type: String },
    clientSignoffAt: { type: Date },

    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

VendorEngagementSchema.index({ caseId: 1 });

module.exports =
  mongoose.models.VendorEngagement || mongoose.model('VendorEngagement', VendorEngagementSchema);
