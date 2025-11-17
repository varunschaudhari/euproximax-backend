const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        phone: {
            type: String,
            trim: true
        },
        subject: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000
        },
        file: {
            type: String,
            trim: true
        },
        fileName: {
            type: String,
            trim: true,
            maxlength: 255
        },
        status: {
            type: String,
            enum: ['New', 'In-Progress', 'Closed'],
            default: 'New'
        },
        meta: {
            type: Object,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model('ContactMessage', contactMessageSchema);

