const mongoose = require('mongoose');

const chatConversationSchema = new mongoose.Schema(
    {
        sessionId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        userName: {
            type: String,
            trim: true,
            maxlength: 100
        },
        userEmail: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 255
        },
        userMobile: {
            type: String,
            trim: true,
            maxlength: 20
        },
        userPassword: {
            type: String,
            trim: true
        },
        // Main idea being discussed
        mainIdea: {
            type: String,
            trim: true,
            maxlength: 2000
        },
        // Novelty analysis results
        noveltyAnalysis: {
            score: {
                type: Number,
                min: 0,
                max: 100,
                default: null
            },
            confidence: {
                type: Number,
                min: 0,
                max: 100,
                default: null
            },
            aiAnalysis: {
                type: String,
                trim: true,
                maxlength: 5000
            },
            similarIdeas: [{
                conversationId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'ChatConversation'
                },
                similarityScore: {
                    type: Number,
                    min: 0,
                    max: 100
                },
                matchedText: {
                    type: String,
                    trim: true
                }
            }],
            analyzedAt: {
                type: Date,
                default: null
            }
        },
        // Conversation metadata
        status: {
            type: String,
            enum: ['active', 'completed', 'abandoned'],
            default: 'active'
        },
        messageCount: {
            type: Number,
            default: 0
        },
        lastMessageAt: {
            type: Date,
            default: Date.now
        },
        // User metadata
        meta: {
            userAgent: String,
            ip: String,
            referrer: String
        }
    },
    {
        timestamps: true
    }
);

// Index for search and analytics
chatConversationSchema.index({ createdAt: -1 });
chatConversationSchema.index({ status: 1 });
chatConversationSchema.index({ 'noveltyAnalysis.score': -1 });
chatConversationSchema.index({ userEmail: 1 });

module.exports = mongoose.model('ChatConversation', chatConversationSchema);

