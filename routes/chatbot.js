const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const chatbotController = require('../controllers/chatbot.controller');
const handleValidationErrors = require('../middleware/validate');
const chatbotUpload = require('../middleware/chatbotUpload');

// Public routes (no authentication required)
const createConversationValidation = [
    body('sessionId').optional().trim().isLength({ max: 100 }),
    body('userName').optional().trim().isLength({ max: 100 }),
    body('userEmail').optional().trim().isEmail().normalizeEmail(),
    body('userMobile').optional().trim().isLength({ max: 20 }),
    body('userPassword').optional().trim().isLength({ min: 6, max: 100 })
];

const sendMessageValidation = [
    body('sessionId').custom((value, { req }) => {
        // Handle both JSON and FormData
        const sessionId = req.body.sessionId;
        if (!sessionId || (typeof sessionId === 'string' && !sessionId.trim())) {
            throw new Error('Session ID is required');
        }
        return true;
    }),
    body('message').custom((value, { req }) => {
        // Handle both JSON and FormData
        const message = req.body.message;
        if (!message || (typeof message === 'string' && !message.trim())) {
            throw new Error('Message is required');
        }
        if (typeof message === 'string' && message.length > 10000) {
            throw new Error('Message must be less than 10000 characters');
        }
        return true;
    }),
    body('analyzeNovelty').optional().custom((value) => {
        if (value !== undefined && value !== 'true' && value !== 'false' && value !== true && value !== false) {
            throw new Error('analyzeNovelty must be a boolean');
        }
        return true;
    })
];

// Public routes
router.post('/conversation', createConversationValidation, handleValidationErrors, chatbotController.createOrGetConversation);
router.post('/message', 
    chatbotUpload.array('files', 5), // Handle file uploads (max 5 files)
    sendMessageValidation, 
    handleValidationErrors, 
    chatbotController.sendMessage
);
router.get('/conversation/:sessionId', chatbotController.getConversation);

// Protected admin routes (require authentication - handled by routes/index.js)
router.get('/admin/conversations', chatbotController.listConversations);
router.get('/admin/conversations/:id', chatbotController.getConversationById);
router.get('/admin/analytics', chatbotController.getAnalytics);
router.get('/admin/export', chatbotController.exportConversations);
router.put('/admin/conversations/:id', chatbotController.updateConversation);

module.exports = router;

