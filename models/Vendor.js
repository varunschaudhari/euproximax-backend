const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Vendor — outsourced provider for prior-art search and/or prototype work.
 */
const VendorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['prior_art', 'prototype', 'both'] },
    contactName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    specialisation: { type: String, trim: true }, // e.g. "mechanical", "electronics", "pharma"
    isEmpanelled: { type: Boolean, default: false }, // fixed vs new
    rating: { type: Number, min: 1, max: 5 },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

module.exports = mongoose.models.Vendor || mongoose.model('Vendor', VendorSchema);
