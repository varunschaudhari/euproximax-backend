const mongoose = require('mongoose');

const consultationBookingSchema = new mongoose.Schema(
    {
        slotId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ConsultationSlot',
            required: true,
            index: true
        },
        userName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        userEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
            index: true
        },
        userPhone: {
            type: String,
            required: true,
            trim: true,
            maxlength: 20
        },
        message: {
            type: String,
            trim: true,
            maxlength: 1000
        },
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'cancelled', 'completed'],
            default: 'pending',
            index: true
        },
        meetingLink: {
            type: String,
            trim: true,
            maxlength: 500
        },
        cancelledAt: {
            type: Date,
            default: null
        },
        cancelledBy: {
            type: String,
            enum: ['user', 'admin'],
            default: null
        },
        confirmedAt: {
            type: Date,
            default: null
        },
        confirmedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },
    {
        timestamps: true
    }
);

consultationBookingSchema.index({ userEmail: 1, createdAt: -1 });

module.exports = mongoose.model('ConsultationBooking', consultationBookingSchema);

