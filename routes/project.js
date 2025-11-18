const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const projectController = require('../controllers/project.controller');
const handleValidationErrors = require('../middleware/validate');

const createProjectValidation = [
    body('enquiryId').isMongoId().withMessage('Valid enquiry ID is required'),
    body('projectName').optional().trim().isLength({ max: 200 }).withMessage('Project name is too long'),
    body('quoteAmount').optional().isNumeric().withMessage('Quote amount must be a number'),
    body('quoteDescription').optional().trim().isLength({ max: 2000 }).withMessage('Quote description is too long'),
    body('services').optional().isArray().withMessage('Services must be an array'),
    body('notes').optional().trim().isLength({ max: 2000 }).withMessage('Notes are too long')
];

const updateProjectValidation = [
    body('projectName').optional().trim().isLength({ max: 200 }).withMessage('Project name is too long'),
    body('status').optional().isIn(['Draft Quote', 'Internal Approval', 'Quote Sent', 'Client Approval', 'Payment', 'Onboarding', 'Completed', 'Cancelled']).withMessage('Invalid status'),
    body('currentStage').optional().isIn(['Draft Quote', 'Internal Approval', 'Quote Sent', 'Client Approval', 'Payment', 'Onboarding']).withMessage('Invalid stage'),
    body('quote.amount').optional().isNumeric().withMessage('Quote amount must be a number'),
    body('quote.description').optional().trim().isLength({ max: 2000 }).withMessage('Quote description is too long'),
    body('payment.amount').optional().isNumeric().withMessage('Payment amount must be a number'),
    body('payment.status').optional().isIn(['Pending', 'Partial', 'Completed', 'Refunded']).withMessage('Invalid payment status'),
    body('onboarding.notes').optional().trim().isLength({ max: 1000 }).withMessage('Onboarding notes are too long'),
    body('notes').optional().trim().isLength({ max: 2000 }).withMessage('Notes are too long')
];

router.post('/', createProjectValidation, handleValidationErrors, projectController.createProject);
router.get('/', projectController.listProjects);
router.get('/:id', projectController.getProjectById);
router.put('/:id', updateProjectValidation, handleValidationErrors, projectController.updateProject);
router.delete('/:id', projectController.deleteProject);

module.exports = router;

