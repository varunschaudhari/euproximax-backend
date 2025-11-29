const mongoose = require('mongoose');

const eventImageSchema = new mongoose.Schema(
    {
        url: { type: String, required: true, trim: true, maxlength: 500 },
        alt: { type: String, trim: true, maxlength: 160 },
        caption: { type: String, trim: true, maxlength: 200 },
        order: { type: Number, default: 0 },
    },
    { _id: true }
);

const eventSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 180 },
        slug: { type: String, required: true, lowercase: true, unique: true, index: true },
        description: { type: String, required: true, trim: true, maxlength: 2000 },
        category: { type: String, required: true, trim: true, maxlength: 80 },
        venue: { type: String, required: true, trim: true, maxlength: 200 },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        registrationLink: { type: String, trim: true, maxlength: 500 },
        maxAttendees: { type: Number, min: 0 },
        outcomes: [{ type: String, trim: true, maxlength: 200 }],
        images: [eventImageSchema],
        heroImage: { type: String, trim: true, maxlength: 500 },
        heroImageAlt: { type: String, trim: true, maxlength: 160 },
        status: {
            type: String,
            enum: ['Draft', 'Published', 'Cancelled', 'Completed'],
            default: 'Draft',
            index: true,
        },
        isFeatured: { type: Boolean, default: false },
        publishedAt: { type: Date },
        seoTitle: { type: String, trim: true, maxlength: 180 },
        seoDescription: { type: String, trim: true, maxlength: 320 },
        seoKeywords: [{ type: String, trim: true, maxlength: 40 }],
        utmSource: { type: String, trim: true, maxlength: 100 },
        utmMedium: { type: String, trim: true, maxlength: 100 },
        utmCampaign: { type: String, trim: true, maxlength: 100 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        meta: {
            views: { type: Number, default: 0 },
            registrations: { type: Number, default: 0 },
        },
    },
    { timestamps: true }
);

eventSchema.index({ category: 1, status: 1, startDate: -1 });
eventSchema.index({ status: 1, publishedAt: -1 });

module.exports = mongoose.model('Event', eventSchema);

