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
    body('projectName').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Project name is too long'),
    body('status').optional().isIn(['Draft Quote', 'Internal Approval', 'Quote Sent', 'Client Approval', 'Payment', 'Onboarding', 'Drafting', 'Filing', 'Grant', 'Close', 'Completed', 'Cancelled']).withMessage('Invalid status'),
    body('currentStage').optional().isIn(['Draft Quote', 'Internal Approval', 'Quote Sent', 'Client Approval', 'Payment', 'Onboarding', 'Drafting', 'Filing', 'Grant', 'Close']).withMessage('Invalid stage'),
    body('quote.amount').optional({ nullable: true, checkFalsy: true }).isNumeric().withMessage('Quote amount must be a number'),
    body('quote.description').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('Quote description is too long'),
    body('payment.amount').optional({ nullable: true, checkFalsy: true }).isNumeric().withMessage('Payment amount must be a number'),
    body('payment.status').optional().isIn(['Pending', 'Partial', 'Completed', 'Refunded']).withMessage('Invalid payment status'),
    body('onboarding.notes').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Onboarding notes are too long'),
    body('drafting.notes').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Drafting notes are too long'),
    body('filing.applicationNumber').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Application number is too long'),
    body('filing.notes').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Filing notes are too long'),
    body('grant.grantNumber').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Grant number is too long'),
    body('grant.notes').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Grant notes are too long'),
    body('close.remarks').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Close remarks are too long'),
    body('notes').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('Notes are too long')
];

router.post('/', createProjectValidation, handleValidationErrors, projectController.createProject);
router.get('/', projectController.listProjects);
router.get('/:id', projectController.getProjectById);
router.put('/:id', updateProjectValidation, handleValidationErrors, projectController.updateProject);
router.delete('/:id', projectController.deleteProject);

module.exports = router;

