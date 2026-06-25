const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    // Company Information
    companyName: { type: String, default: 'EuProximaX' },
    companyAddress: { type: String, default: '' },
    companyPhone: { type: String, default: '' },
    companyEmail: { type: String, default: '' },
    companyWebsite: { type: String, default: '' },
    companyGST: { type: String, default: '' },
    companyLogo: { type: String, default: '' }, // URL to logo image

    // Bank & Payment Details
    bankName: { type: String, default: '' },
    accountHolder: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    upiId: { type: String, default: '' },
    enableRazorpay: { type: Boolean, default: true },

    // Terms & Conditions
    paymentTerms: { type: String, default: 'Payment due within 30 days of invoice date' },
    additionalTerms: { type: String, default: '' },

    // Brand Colors (extracted from logo)
    primaryColor: { type: String, default: '#1a365d' },
    secondaryColor: { type: String, default: '#2d5a8c' },
    accentColor: { type: String, default: '#3b82f6' },

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: 'settings' }
);

module.exports = mongoose.model('Settings', settingsSchema);
