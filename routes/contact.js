const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const contactController = require('../controllers/contact.controller');
const handleValidationErrors = require('../middleware/validate');

const contactValidation = [
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name is required'),
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('phone').optional().trim().isLength({ max: 20 }).withMessage('Phone is too long'),
    body('subject').trim().isLength({ min: 3, max: 200 }).withMessage('Subject must be between 3 and 200 characters'),
    body('message').trim().isLength({ min: 10, max: 2000 }).withMessage('Message should be at least 10 characters')
];

router.post('/', contactValidation, handleValidationErrors, contactController.createContact);
router.get('/', contactController.listContacts);

module.exports = router;


