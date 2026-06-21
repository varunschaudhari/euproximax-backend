const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * CRM Client — the patent applicant.
 * `userId` links to a portal login (role: client) and is optional until the
 * portal is enabled. Distinct from the internal `User` (staff) collection.
 */
const ClientSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    whatsapp: { type: String, trim: true },
    address: { type: String, trim: true },
    gstNumber: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

ClientSchema.index({ email: 1 });

module.exports = mongoose.models.Client || mongoose.model('Client', ClientSchema);
