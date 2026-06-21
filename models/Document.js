const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Document — a file attached to a case.
 *
 * Storage: per the "mixed integrations" decision, files are stored locally via
 * multer for now (see /uploads). `s3Key` / `s3Url` are kept for a future S3
 * migration; `storagePath` / `url` hold the current local reference.
 */
const DocumentSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: 'Case', required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    type: {
      type: String,
      enum: [
        'intake_form', 'nda', 'prior_art_report', 'invention_disclosure',
        'prototype_photos', 'prototype_report', 'quotation', 'draft_v1',
        'draft_final', 'filing_receipt', 'application_copy', 'fer',
        'objection_response', 'grant_certificate', 'renewal_receipt',
        'invoice', 'vendor_brief', 'vendor_delivery', 'other'
      ],
      default: 'other'
    },

    name: { type: String, required: true },

    // Local storage (current)
    storagePath: { type: String },
    url: { type: String },

    // S3 storage (future)
    s3Key: { type: String },
    s3Url: { type: String },

    fileSize: { type: Number },
    mimeType: { type: String },

    version: { type: Number, default: 1 }, // for draft versioning
    isLockedReadOnly: { type: Boolean, default: false },
    isVisibleToClient: { type: Boolean, default: false },

    uploadedAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

DocumentSchema.index({ caseId: 1 });

module.exports = mongoose.models.Document || mongoose.model('Document', DocumentSchema);
