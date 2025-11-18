const express = require('express');
const router = express.Router();
const multer = require('multer');
const { body } = require('express-validator');
const contactController = require('../controllers/contact.controller');
const handleValidationErrors = require('../middleware/validate');
const upload = require('../middleware/upload');
const { AppError } = require('../middleware/errorHandler');

const contactValidation = [
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name is required'),
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('phone').optional().trim().isLength({ max: 20 }).withMessage('Phone is too long'),
    body('subject').trim().isLength({ min: 3, max: 200 }).withMessage('Subject must be between 3 and 200 characters'),
    body('message').trim().isLength({ min: 10, max: 2000 }).withMessage('Message should be at least 10 characters')
];

const updateValidation = [
    body('status').optional().isIn(['New', 'In-Progress', 'Closed']).withMessage('Invalid status provided'),
    body('assignedTo').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid project manager id')
];

// File upload error handler
const handleFileUpload = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return next(new AppError('File size exceeds 10MB limit', 400));
                }
                return next(new AppError('File upload error: ' + err.message, 400));
            }
            return next(new AppError(err.message || 'File upload failed', 400));
        }
        next();
    });
};

router.post('/', handleFileUpload, contactValidation, handleValidationErrors, contactController.createContact);
router.get('/', contactController.listContacts);
router.get('/:id', contactController.getContactById);
router.put('/:id', updateValidation, handleValidationErrors, contactController.updateContact);

module.exports = router;


