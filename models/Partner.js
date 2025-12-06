const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 200 },
        slug: { type: String, required: true, lowercase: true, unique: true, index: true },
        location: { type: String, required: true, trim: true, maxlength: 100 },
        role: { type: String, required: true, trim: true, maxlength: 300 },
        email: { 
            type: String, 
            trim: true, 
            lowercase: true,
            maxlength: 200,
            validate: {
                validator: function(v) {
                    if (!v) return true; // Optional field
                    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
                },
                message: 'Please enter a valid email address'
            }
        },
        phone: { type: String, trim: true, maxlength: 20 },
        bio: { type: String, trim: true, maxlength: 5000 },
        expertise: [{ type: String, trim: true, maxlength: 100 }],
        image: { type: String, trim: true, maxlength: 500 },
        status: {
            type: String,
            enum: ['Active', 'Inactive'],
            default: 'Active',
            index: true,
        },
        order: { type: Number, default: 0, min: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

partnerSchema.index({ status: 1, order: 1 });
partnerSchema.index({ location: 1 });

module.exports = mongoose.model('Partner', partnerSchema);

