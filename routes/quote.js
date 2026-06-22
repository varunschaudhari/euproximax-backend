const express = require('express');
const router = express.Router();
const { param, body } = require('express-validator');
const quoteController = require('../controllers/quote.controller');
const handleValidationErrors = require('../middleware/validate');
const requirePermission = require('../middleware/requirePermission');

const caseIdParam = [param('caseId').isMongoId().withMessage('Invalid case ID')];

const saveValidation = [
  ...caseIdParam,
  body('title').optional().trim().isLength({ max: 200 }),
  body('lineItems').optional().isArray(),
  body('lineItems.*.description').optional().trim().isLength({ max: 500 }),
  body('lineItems.*.quantity').optional().isFloat({ min: 0 }),
  body('lineItems.*.unitPrice').optional().isFloat({ min: 0 }),
  body('gstPercent').optional().isFloat({ min: 0, max: 100 }),
  body('currency').optional().isIn(['INR', 'USD', 'EUR']),
  body('notes').optional().trim().isLength({ max: 2000 }),
  body('validUntil').optional({ nullable: true, checkFalsy: true }).isISO8601()
];

router.get('/case/:caseId', requirePermission('CASE', 'READ'), caseIdParam, handleValidationErrors, quoteController.getByCase);
router.put('/case/:caseId', requirePermission('CASE', 'UPDATE'), saveValidation, handleValidationErrors, quoteController.saveQuote);
router.patch('/case/:caseId/approve', requirePermission('CASE', 'UPDATE'), caseIdParam, handleValidationErrors, quoteController.approveInternal);
router.patch('/case/:caseId/send', requirePermission('CASE', 'UPDATE'), caseIdParam, handleValidationErrors, quoteController.sendToClient);

module.exports = router;
