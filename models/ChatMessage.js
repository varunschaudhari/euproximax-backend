const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ChatConversation',
            required: true,
            index: true
        },
        role: {
            type: String,
            enum: ['user', 'assistant', 'system'],
            required: true
        },
        content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 10000
        },
        // For AI responses, store the model used
        model: {
            type: String,
            trim: true
        },
        // Token usage for AI responses
        tokenUsage: {
            promptTokens: {
                type: Number,
                default: 0
            },
            completionTokens: {
                type: Number,
                default: 0
            },
            totalTokens: {
                type: Number,
                default: 0
            }
        },
        // Attached files
        files: [{
            filename: {
                type: String,
                trim: true
            },
            originalName: {
                type: String,
                trim: true
            },
            path: {
                type: String,
                trim: true
            },
            size: {
                type: Number
            },
            mimeType: {
                type: String,
                trim: true
            }
        }],
        // Message metadata
        metadata: {
            type: Object,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

// Index for efficient querying
chatMessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);

