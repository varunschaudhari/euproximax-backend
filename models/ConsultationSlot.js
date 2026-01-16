const mongoose = require('mongoose');

const consultationSlotSchema = new mongoose.Schema(
    {
        date: {
            type: Date,
            required: true,
            index: true
        },
        startTime: {
            type: String,
            required: true,
            trim: true,
            match: [/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format']
        },
        endTime: {
            type: String,
            required: true,
            trim: true,
            match: [/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format']
        },
        duration: {
            type: Number,
            default: 30,
            min: 15,
            max: 480 // Max 8 hours
        },
        isAvailable: {
            type: Boolean,
            default: true,
            index: true
        },
        status: {
            type: String,
            enum: ['available', 'booked', 'cancelled', 'completed'],
            default: 'available',
            index: true
        },
        maxBookings: {
            type: Number,
            default: 1,
            min: 1
        },
        notes: {
            type: String,
            trim: true,
            maxlength: 500
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        }
    },
    {
        timestamps: true
    }
);

// Compound index for efficient date and time queries
consultationSlotSchema.index({ date: 1, startTime: 1 });
consultationSlotSchema.index({ status: 1, isAvailable: 1, date: 1 });

// Virtual for booking count (will be populated via aggregation)
consultationSlotSchema.virtual('bookingCount', {
    ref: 'ConsultationBooking',
    localField: '_id',
    foreignField: 'slotId',
    count: true
});

module.exports = mongoose.model('ConsultationSlot', consultationSlotSchema);

