const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String, trim: true, maxlength: 80 },
    tags: [{ type: String, trim: true, maxlength: 40 }],
    durationSeconds: { type: Number, min: 0 },
    videoUrl: { type: String, required: true, trim: true, maxlength: 500 },
    thumbnailUrl: { type: String, trim: true, maxlength: 500 },
    heroImageAlt: { type: String, trim: true, maxlength: 160 },
    status: { type: String, enum: ['Draft', 'Published'], default: 'Draft', index: true },
    isFeatured: { type: Boolean, default: false },
    publishedAt: { type: Date },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    seoTitle: { type: String, trim: true, maxlength: 180 },
    seoDescription: { type: String, trim: true, maxlength: 320 },
    seoKeywords: [{ type: String, trim: true, maxlength: 40 }],
  },
  { timestamps: true }
);

videoSchema.index({ status: 1, createdAt: -1 });
videoSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('Video', videoSchema);


