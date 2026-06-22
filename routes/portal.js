const express = require('express');
const router = express.Router();
const { param, body } = require('express-validator');
const portalController = require('../controllers/portal.controller');
const handleValidationErrors = require('../middleware/validate');

const caseIdParam = [param('id').isMongoId().withMessage('Invalid case ID')];

router.get('/me', portalController.getMe);
router.get('/cases/:id', caseIdParam, handleValidationErrors, portalController.getCase);
router.post(
  '/cases/:id/action',
  [...caseIdParam, body('action').isString().notEmpty(), body('note').optional().isLength({ max: 1000 })],
  handleValidationErrors,
  portalController.caseAction
);
router.get('/cases/:id/timeline', caseIdParam, handleValidationErrors, portalController.getTimeline);
router.get('/cases/:id/documents', caseIdParam, handleValidationErrors, portalController.getDocuments);
router.get('/cases/:id/documents/:docId/download', [...caseIdParam, param('docId').isMongoId()], handleValidationErrors, portalController.downloadDocument);
router.get('/cases/:id/quote', caseIdParam, handleValidationErrors, portalController.getQuote);
router.get('/cases/:id/payments', caseIdParam, handleValidationErrors, portalController.getPayments);
router.post('/payments/:id/pay', param('id').isMongoId(), handleValidationErrors, portalController.payInvoice);
router.post(
  '/cases/:id/feedback',
  [...caseIdParam, body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 2000 })],
  handleValidationErrors,
  portalController.submitFeedback
);

module.exports = router;
