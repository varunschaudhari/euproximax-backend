const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const paymentController = require('../controllers/payment.controller');
const handleValidationErrors = require('../middleware/validate');
const requirePermission = require('../middleware/requirePermission');

const PAYMENT_TYPES = [
  'prior_art_search', 'prototype', 'drafting', 'filing_govt', 'filing_professional',
  'examination', 'objection_response', 'renewal_govt', 'renewal_management',
  'pct_national_phase', 'licensing_consultation', 'supplementary'
];

const createValidation = [
  body('caseId').isMongoId().withMessage('Valid case ID is required'),
  body('type').isIn(PAYMENT_TYPES).withMessage('Invalid payment type'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
  body('milestoneLabel').optional().trim().isLength({ max: 120 }).withMessage('Label too long'),
  body('currency').optional().isIn(['INR', 'USD', 'EUR']).withMessage('Invalid currency'),
  body('gstPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Invalid GST percent'),
  body('dueDate').optional().isISO8601().withMessage('Invalid due date'),
  body('planInstalment').optional().isInt({ min: 1 }).withMessage('Invalid instalment')
];

const idParam = [param('id').isMongoId().withMessage('Invalid payment ID')];

// Note: POST /webhook is registered as a PUBLIC route in routes/index.js (no JWT).
router.post('/webhook', paymentController.razorpayWebhook);

// Admin list all payments (must come before /case/:caseId pattern)
router.get('/', requirePermission('PAYMENT', 'READ'), paymentController.listPayments);

router.get('/overdue', requirePermission('PAYMENT', 'READ'), paymentController.listOverdue);
router.get('/case/:caseId', requirePermission('PAYMENT', 'READ'), param('caseId').isMongoId(), handleValidationErrors, paymentController.listByCase);
router.post('/', requirePermission('PAYMENT', 'CREATE'), createValidation, handleValidationErrors, paymentController.createPayment);
router.post('/plan', requirePermission('PAYMENT', 'CREATE'), paymentController.createPlan);
router.patch('/:id/send', requirePermission('PAYMENT', 'UPDATE'), idParam, handleValidationErrors, paymentController.sendInvoice);
router.post('/:id/razorpay', requirePermission('PAYMENT', 'UPDATE'), idParam, handleValidationErrors, paymentController.createRazorpayOrder);
router.patch('/:id/confirm', requirePermission('PAYMENT', 'UPDATE'), idParam, handleValidationErrors, paymentController.confirmPayment);
router.patch('/:id/waive', requirePermission('PAYMENT', 'DELETE'), idParam, handleValidationErrors, paymentController.waivePayment);

module.exports = router;
