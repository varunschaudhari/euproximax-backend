const mongoose = require('mongoose');

const authorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    title: { type: String, trim: true, maxlength: 160 },
    avatar: { type: String, trim: true },
  },
  { _id: false }
);

const blogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, lowercase: true, unique: true, index: true },
    excerpt: { type: String, required: true, trim: true, maxlength: 500 },
    content: { type: String, required: true, trim: true },
    coverImage: { type: String, trim: true, maxlength: 500 },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    tags: [{ type: String, trim: true, maxlength: 40 }],
    author: {
      type: authorSchema,
      required: true,
      default: () => ({ name: 'EuProximaX Team' }),
    },
    readTimeMinutes: { type: Number, default: 5, min: 1, max: 60 },
    status: { type: String, enum: ['Draft', 'Published'], default: 'Draft', index: true },
    isFeatured: { type: Boolean, default: false },
    publishedAt: { type: Date },
    heroImageAlt: { type: String, trim: true, maxlength: 160 },
    seoTitle: { type: String, trim: true, maxlength: 180 },
    seoDescription: { type: String, trim: true, maxlength: 320 },
    seoKeywords: [{ type: String, trim: true, maxlength: 40 }],
    submittedByName: { type: String, trim: true, maxlength: 120 },
    submittedByEmail: { type: String, trim: true, lowercase: true, maxlength: 160 },
    submissionReference: { type: String, trim: true, maxlength: 500 },
    submissionStatus: {
      type: String,
      enum: ['Submitted', 'In Review', 'Approved', 'Rejected'],
      default: 'Submitted',
    },
    meta: {
      views: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

blogPostSchema.index({ category: 1, status: 1, publishedAt: -1 });
blogPostSchema.index({ tags: 1, status: 1 });

module.exports = mongoose.model('BlogPost', blogPostSchema);


