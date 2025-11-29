const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
    {
        projectName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },
        enquiryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ContactMessage',
            required: true
        },
        clientName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        clientEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        clientPhone: {
            type: String,
            trim: true
        },
        projectManager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        projectManagerName: {
            type: String,
            trim: true
        },
        status: {
            type: String,
            enum: ['Draft Quote', 'Internal Approval', 'Quote Sent', 'Client Approval', 'Payment', 'Onboarding', 'Drafting', 'Filing', 'Grant', 'Close', 'Completed', 'Cancelled'],
            default: 'Draft Quote'
        },
        currentStage: {
            type: String,
            enum: ['Draft Quote', 'Internal Approval', 'Quote Sent', 'Client Approval', 'Payment', 'Onboarding', 'Drafting', 'Filing', 'Grant', 'Close'],
            default: 'Draft Quote'
        },
        // Quote details
        quote: {
            invoiceNumber: {
                type: String,
                trim: true,
                maxlength: 100
            },
            clientName: {
                type: String,
                trim: true,
                maxlength: 100
            },
            title: {
                type: String,
                trim: true,
                maxlength: 200
            },
            serviceType: {
                type: String,
                trim: true,
                maxlength: 100
            },
            lineItems: [{
                description: {
                    type: String,
                    trim: true,
                    maxlength: 500
                },
                quantity: {
                    type: Number,
                    default: 0,
                    min: 0
                },
                unitPrice: {
                    type: Number,
                    default: 0,
                    min: 0
                },
                currency: {
                    type: String,
                    default: 'INR',
                    enum: ['INR', 'USD', 'EUR']
                },
                finalCost: {
                    type: Number,
                    default: 0,
                    min: 0
                }
            }],
            amount: {
                type: Number,
                default: null
            },
            currency: {
                type: String,
                default: 'INR',
                enum: ['INR', 'USD', 'EUR']
            },
            description: {
                type: String,
                trim: true,
                maxlength: 2000
            },
            draftDate: {
                type: Date,
                default: null
            },
            draftBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            assignedApprover: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            assignedApproverName: {
                type: String,
                trim: true
            },
            assignedApproverAt: {
                type: Date,
                default: null
            },
            internalApprovalDate: {
                type: Date,
                default: null
            },
            internalApprovedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            sentDate: {
                type: Date,
                default: null
            },
            sentBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            clientApprovalDate: {
                type: Date,
                default: null
            },
            clientApproved: {
                type: Boolean,
                default: false
            }
        },
        // Payment details
        payment: {
            amount: {
                type: Number,
                default: null
            },
            currency: {
                type: String,
                default: 'INR'
            },
            status: {
                type: String,
                enum: ['Pending', 'Partial', 'Completed', 'Refunded'],
                default: 'Pending'
            },
            paymentDate: {
                type: Date,
                default: null
            },
            paymentMethod: {
                type: String,
                trim: true
            },
            transactionId: {
                type: String,
                trim: true
            },
            notes: {
                type: String,
                trim: true,
                maxlength: 500
            }
        },
        // Onboarding details
        onboarding: {
            startDate: {
                type: Date,
                default: null
            },
            completedDate: {
                type: Date,
                default: null
            },
            onboardingBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            notes: {
                type: String,
                trim: true,
                maxlength: 1000
            }
        },
        // Drafting details
        drafting: {
            startDate: {
                type: Date,
                default: null
            },
            completedDate: {
                type: Date,
                default: null
            },
            draftedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            notes: {
                type: String,
                trim: true,
                maxlength: 1000
            }
        },
        // Filing details
        filing: {
            filingDate: {
                type: Date,
                default: null
            },
            applicationNumber: {
                type: String,
                trim: true,
                maxlength: 100
            },
            filedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            notes: {
                type: String,
                trim: true,
                maxlength: 1000
            }
        },
        // Grant details
        grant: {
            grantDate: {
                type: Date,
                default: null
            },
            grantNumber: {
                type: String,
                trim: true,
                maxlength: 100
            },
            grantedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            notes: {
                type: String,
                trim: true,
                maxlength: 1000
            }
        },
        // Close details
        close: {
            closedDate: {
                type: Date,
                default: null
            },
            closedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            remarks: {
                type: String,
                trim: true,
                maxlength: 1000
            }
        },
        // Additional project details
        services: [{
            type: String,
            trim: true
        }],
        notes: {
            type: String,
            trim: true,
            maxlength: 2000
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
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

// Index for efficient queries
projectSchema.index({ enquiryId: 1 });
projectSchema.index({ projectManager: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Project', projectSchema);

