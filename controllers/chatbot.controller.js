const ChatConversation = require('../models/ChatConversation');
const ChatMessage = require('../models/ChatMessage');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { generateChatResponse, analyzeNovelty } = require('../utils/openai');
const { findSimilarIdeas } = require('../utils/noveltyChecker');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a new conversation or get existing one
 */
const createOrGetConversation = async (req, res, next) => {
    try {
        const { sessionId, userName, userEmail, userMobile, userPassword } = req.body;

        let conversation;

        if (sessionId) {
            // Get existing conversation
            conversation = await ChatConversation.findOne({ sessionId });
            if (conversation) {
                return res.status(200).json({
                    success: true,
                    message: 'Conversation retrieved',
                    data: conversation
                });
            }
        }

        // Create new conversation
        const newSessionId = sessionId || uuidv4();
        
        conversation = await ChatConversation.create({
            sessionId: newSessionId,
            userName: userName?.trim(),
            userEmail: userEmail?.trim().toLowerCase(),
            userMobile: userMobile?.trim(),
            userPassword: userPassword?.trim(),
            meta: {
                userAgent: req.headers['user-agent'],
                ip: req.ip,
                referrer: req.headers.referer
            }
        });

        res.status(201).json({
            success: true,
            message: 'Conversation created',
            data: conversation
        });
    } catch (error) {
        logger.error('Create conversation error:', {
            error: error.message,
            stack: error.stack
        });
        next(error instanceof AppError ? error : new AppError('Unable to create conversation', 500));
    }
};

/**
 * Send a message and get AI response
 */
const sendMessage = async (req, res, next) => {
    try {
        // Handle both JSON and FormData requests
        const sessionId = req.body.sessionId;
        const message = req.body.message;
        const shouldAnalyze = req.body.analyzeNovelty === 'true' || req.body.analyzeNovelty === true;
        const userName = req.body.userName;
        const userEmail = req.body.userEmail;
        const userMobile = req.body.userMobile;

        if (!sessionId || !message || !message.trim()) {
            return next(new AppError('Session ID and message are required', 400));
        }

        // Get or create conversation
        let conversation = await ChatConversation.findOne({ sessionId });
        if (!conversation) {
            // Auto-create conversation if it doesn't exist
            conversation = await ChatConversation.create({
                sessionId: sessionId,
                userName: userName?.trim(),
                userEmail: userEmail?.trim().toLowerCase(),
                userMobile: userMobile?.trim(),
                meta: {
                    userAgent: req.headers['user-agent'],
                    ip: req.ip,
                    referrer: req.headers.referer
                }
            });
        } else {
            // Update user info if provided and not already set
            const updates = {};
            if (userName?.trim() && !conversation.userName) {
                updates.userName = userName.trim();
            }
            if (userEmail?.trim() && !conversation.userEmail) {
                updates.userEmail = userEmail.trim().toLowerCase();
            }
            if (userMobile?.trim() && !conversation.userMobile) {
                updates.userMobile = userMobile.trim();
            }
            if (Object.keys(updates).length > 0) {
                Object.assign(conversation, updates);
                await conversation.save();
            }
        }

        // Handle file uploads
        const fileAttachments = [];
        if (req.files && req.files.length > 0) {
            fileAttachments.push(...req.files.map(file => ({
                filename: file.filename,
                originalName: file.originalname,
                path: `/uploads/chatbot/${file.filename}`,
                size: file.size,
                mimeType: file.mimetype
            })));
        }

        // Save user message
        const userMessage = await ChatMessage.create({
            conversationId: conversation._id,
            role: 'user',
            content: message.trim(),
            files: fileAttachments.length > 0 ? fileAttachments : undefined
        });

        // Update main idea if this seems like the main idea (first substantial message)
        if (!conversation.mainIdea && message.trim().length > 20) {
            conversation.mainIdea = message.trim();
            await conversation.save();
        }

        // Get conversation history for context
        const previousMessages = await ChatMessage.find({
            conversationId: conversation._id
        })
        .sort({ createdAt: 1 })
        .limit(20) // Last 20 messages for context
        .lean();

        // Format messages for AI
        const aiMessages = previousMessages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        // Generate AI response
        let aiResponse;
        let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        try {
            const aiResult = await generateChatResponse(aiMessages);
            aiResponse = aiResult.content;
            tokenUsage = aiResult.tokenUsage;
        } catch (aiError) {
            logger.error('AI response generation failed:', {
                error: aiError.message,
                sessionId
            });
            // Fallback response if AI fails
            aiResponse = "I apologize, but I'm having trouble processing your request right now. Could you please rephrase your question?";
        }

        // Save AI response
        const assistantMessage = await ChatMessage.create({
            conversationId: conversation._id,
            role: 'assistant',
            content: aiResponse,
            model: 'gpt-4o-mini',
            tokenUsage
        });

        // Update conversation stats
        conversation.messageCount = await ChatMessage.countDocuments({ conversationId: conversation._id });
        conversation.lastMessageAt = new Date();
        await conversation.save();

        // Analyze novelty if requested and we have a main idea
        let noveltyAnalysis = null;
        if (shouldAnalyze && conversation.mainIdea) {
            try {
                const conversationText = previousMessages
                    .map(m => `${m.role}: ${m.content}`)
                    .join('\n');

                const aiNovelty = await analyzeNovelty(conversation.mainIdea, conversationText);
                const similarIdeas = await findSimilarIdeas(conversation.mainIdea, 5);

                conversation.noveltyAnalysis = {
                    score: aiNovelty.score,
                    confidence: aiNovelty.confidence,
                    aiAnalysis: aiNovelty.aiAnalysis,
                    similarIdeas: similarIdeas,
                    analyzedAt: new Date()
                };
                await conversation.save();

                noveltyAnalysis = conversation.noveltyAnalysis;
            } catch (noveltyError) {
                logger.error('Novelty analysis failed:', {
                    error: noveltyError.message,
                    sessionId
                });
                // Don't fail the request if novelty analysis fails
            }
        }

        res.status(200).json({
            success: true,
            message: 'Message sent successfully',
            data: {
                userMessage: {
                    id: userMessage._id,
                    role: userMessage.role,
                    content: userMessage.content,
                    createdAt: userMessage.createdAt
                },
                assistantMessage: {
                    id: assistantMessage._id,
                    role: assistantMessage.role,
                    content: assistantMessage.content,
                    createdAt: assistantMessage.createdAt
                },
                noveltyAnalysis
            }
        });
    } catch (error) {
        logger.error('Send message error:', {
            error: error.message,
            stack: error.stack
        });
        next(error instanceof AppError ? error : new AppError('Unable to send message', 500));
    }
};

/**
 * Get conversation with messages
 */
const getConversation = async (req, res, next) => {
    try {
        const { sessionId } = req.params;

        const conversation = await ChatConversation.findOne({ sessionId });
        if (!conversation) {
            // Return empty conversation instead of error
            return res.status(200).json({
                success: true,
                message: 'Conversation not found, returning empty',
                data: {
                    conversation: null,
                    messages: []
                }
            });
        }

        const messages = await ChatMessage.find({ conversationId: conversation._id })
            .sort({ createdAt: 1 })
            .lean();

        res.status(200).json({
            success: true,
            message: 'Conversation retrieved',
            data: {
                conversation,
                messages
            }
        });
    } catch (error) {
        logger.error('Get conversation error:', {
            error: error.message,
            stack: error.stack
        });
        next(error instanceof AppError ? error : new AppError('Unable to get conversation', 500));
    }
};

/**
 * List all conversations (Admin)
 */
const listConversations = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const status = req.query.status?.trim();
        const skip = (page - 1) * limit;

        const filter = {};
        if (searchTerm) {
            const regex = new RegExp(searchTerm, 'i');
            filter.$or = [
                { userName: regex },
                { userEmail: regex },
                { mainIdea: regex },
                { sessionId: regex }
            ];
        }
        if (status) {
            filter.status = status;
        }

        const [conversations, total] = await Promise.all([
            ChatConversation.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ChatConversation.countDocuments(filter)
        ]);

        // Get message counts for each conversation
        const conversationsWithCounts = await Promise.all(
            conversations.map(async (conv) => {
                const messageCount = await ChatMessage.countDocuments({ conversationId: conv._id });
                return {
                    ...conv,
                    messageCount
                };
            })
        );

        res.status(200).json({
            success: true,
            message: 'Conversations fetched successfully',
            data: {
                items: conversationsWithCounts,
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        });
    } catch (error) {
        logger.error('List conversations error:', {
            error: error.message,
            stack: error.stack
        });
        next(error);
    }
};

/**
 * Get conversation by ID with full details (Admin)
 */
const getConversationById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const conversation = await ChatConversation.findById(id).lean();
        if (!conversation) {
            return next(new AppError('Conversation not found', 404));
        }

        const messages = await ChatMessage.find({ conversationId: conversation._id })
            .sort({ createdAt: 1 })
            .lean();

        res.status(200).json({
            success: true,
            message: 'Conversation fetched successfully',
            data: {
                ...conversation,
                messages
            }
        });
    } catch (error) {
        logger.error('Get conversation by ID error:', {
            error: error.message,
            stack: error.stack,
            conversationId: req.params.id
        });
        next(error instanceof AppError ? error : new AppError('Unable to fetch conversation', 500));
    }
};

/**
 * Get analytics (Admin)
 */
const getAnalytics = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;

        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) {
                dateFilter.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                dateFilter.createdAt.$lte = new Date(endDate);
            }
        }

        const [
            totalConversations,
            activeConversations,
            completedConversations,
            totalMessages,
            conversationsWithNovelty,
            averageNoveltyScore,
            conversationsByStatus,
            recentConversations
        ] = await Promise.all([
            ChatConversation.countDocuments(dateFilter),
            ChatConversation.countDocuments({ ...dateFilter, status: 'active' }),
            ChatConversation.countDocuments({ ...dateFilter, status: 'completed' }),
            ChatMessage.countDocuments({}),
            ChatConversation.countDocuments({
                ...dateFilter,
                'noveltyAnalysis.score': { $exists: true, $ne: null }
            }),
            ChatConversation.aggregate([
                { $match: { ...dateFilter, 'noveltyAnalysis.score': { $exists: true, $ne: null } } },
                { $group: { _id: null, avgScore: { $avg: '$noveltyAnalysis.score' } } }
            ]),
            ChatConversation.aggregate([
                { $match: dateFilter },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            ChatConversation.find(dateFilter)
                .sort({ createdAt: -1 })
                .limit(10)
                .select('sessionId userName userEmail mainIdea status createdAt messageCount')
                .lean()
        ]);

        const avgScore = averageNoveltyScore.length > 0 ? Math.round(averageNoveltyScore[0].avgScore) : 0;

        // Get novelty score distribution
        const noveltyDistribution = await ChatConversation.aggregate([
            { $match: { ...dateFilter, 'noveltyAnalysis.score': { $exists: true, $ne: null } } },
            {
                $bucket: {
                    groupBy: '$noveltyAnalysis.score',
                    boundaries: [0, 25, 50, 75, 100],
                    default: 'other',
                    output: {
                        count: { $sum: 1 }
                    }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            message: 'Analytics fetched successfully',
            data: {
                overview: {
                    totalConversations,
                    activeConversations,
                    completedConversations,
                    totalMessages,
                    conversationsWithNovelty,
                    averageNoveltyScore: avgScore
                },
                distribution: {
                    byStatus: conversationsByStatus,
                    noveltyScore: noveltyDistribution
                },
                recentConversations
            }
        });
    } catch (error) {
        logger.error('Get analytics error:', {
            error: error.message,
            stack: error.stack
        });
        next(error instanceof AppError ? error : new AppError('Unable to fetch analytics', 500));
    }
};

/**
 * Export conversations (Admin)
 */
const exportConversations = async (req, res, next) => {
    try {
        const { format = 'json', startDate, endDate, status } = req.query;

        const filter = {};
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) {
                filter.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                filter.createdAt.$lte = new Date(endDate);
            }
        }
        if (status) {
            filter.status = status;
        }

        const conversations = await ChatConversation.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        // Get messages for each conversation
        const conversationsWithMessages = await Promise.all(
            conversations.map(async (conv) => {
                const messages = await ChatMessage.find({ conversationId: conv._id })
                    .sort({ createdAt: 1 })
                    .lean();
                return {
                    ...conv,
                    messages
                };
            })
        );

        if (format === 'csv') {
            // Convert to CSV
            const csvRows = [];
            csvRows.push([
                'Session ID',
                'User Name',
                'User Email',
                'Main Idea',
                'Status',
                'Message Count',
                'Novelty Score',
                'Created At',
                'Last Message At'
            ].join(','));

            conversationsWithMessages.forEach(conv => {
                csvRows.push([
                    conv.sessionId || '',
                    conv.userName || '',
                    conv.userEmail || '',
                    `"${(conv.mainIdea || '').replace(/"/g, '""')}"`,
                    conv.status || '',
                    conv.messageCount || 0,
                    conv.noveltyAnalysis?.score || '',
                    conv.createdAt ? new Date(conv.createdAt).toISOString() : '',
                    conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : ''
                ].join(','));
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=chatbot-conversations-${Date.now()}.csv`);
            return res.send(csvRows.join('\n'));
        } else {
            // JSON format
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=chatbot-conversations-${Date.now()}.json`);
            return res.json({
                exportDate: new Date().toISOString(),
                totalConversations: conversationsWithMessages.length,
                conversations: conversationsWithMessages
            });
        }
    } catch (error) {
        logger.error('Export conversations error:', {
            error: error.message,
            stack: error.stack
        });
        next(error instanceof AppError ? error : new AppError('Unable to export conversations', 500));
    }
};

/**
 * Update conversation status (Admin)
 */
const updateConversation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const conversation = await ChatConversation.findById(id);
        if (!conversation) {
            return next(new AppError('Conversation not found', 404));
        }

        if (status) {
            const allowedStatuses = ['active', 'completed', 'abandoned'];
            if (!allowedStatuses.includes(status)) {
                return next(new AppError('Invalid status value', 400));
            }
            conversation.status = status;
        }

        await conversation.save();

        res.status(200).json({
            success: true,
            message: 'Conversation updated successfully',
            data: conversation
        });
    } catch (error) {
        logger.error('Update conversation error:', {
            error: error.message,
            stack: error.stack,
            conversationId: req.params.id
        });
        next(error instanceof AppError ? error : new AppError('Unable to update conversation', 500));
    }
};

module.exports = {
    createOrGetConversation,
    sendMessage,
    getConversation,
    listConversations,
    getConversationById,
    getAnalytics,
    exportConversations,
    updateConversation
};

