const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const deadlineController = require('../controllers/deadline.controller');
const handleValidationErrors = require('../middleware/validate');
const requirePermission = require('../middleware/requirePermission');

const createValidation = [
  body('caseId').isMongoId().withMessage('Valid case ID is required'),
  body('type').isIn(['rfe_filing', 'fer_response', 'hearing', 'renewal', 'payment_due', 'custom']).withMessage('Invalid type'),
  body('label').trim().notEmpty().withMessage('Label is required').isLength({ max: 200 }),
  body('statutoryDeadline').isISO8601().withMessage('Valid statutory deadline is required'),
  body('internalDeadline').optional().isISO8601().withMessage('Invalid internal deadline'),
  body('ownerId').optional().isMongoId().withMessage('Invalid owner ID')
];

const idParam = [param('id').isMongoId().withMessage('Invalid deadline ID')];

router.get('/upcoming', requirePermission('DEADLINE', 'READ'), deadlineController.listUpcoming);
router.get('/overdue', requirePermission('DEADLINE', 'READ'), deadlineController.listOverdue);
router.get('/case/:caseId', requirePermission('DEADLINE', 'READ'), param('caseId').isMongoId(), handleValidationErrors, deadlineController.listByCase);
router.post('/', requirePermission('DEADLINE', 'CREATE'), createValidation, handleValidationErrors, deadlineController.createDeadline);
router.patch('/:id/complete', requirePermission('DEADLINE', 'UPDATE'), idParam, handleValidationErrors, deadlineController.completeDeadline);

module.exports = router;
