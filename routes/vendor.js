const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const vendorController = require('../controllers/vendor.controller');
const handleValidationErrors = require('../middleware/validate');
const requirePermission = require('../middleware/requirePermission');

const createVendorValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  body('type').optional().isIn(['prior_art', 'prototype', 'both']).withMessage('Invalid type'),
  body('email').optional().isEmail().withMessage('Invalid email'),
  body('phone').optional().trim().isLength({ max: 30 }),
  body('specialisation').optional().trim().isLength({ max: 120 }),
  body('isEmpanelled').optional().isBoolean(),
  body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('notes').optional().trim().isLength({ max: 1000 })
];

const engageValidation = [
  body('caseId').isMongoId().withMessage('Valid case ID is required'),
  body('vendorId').isMongoId().withMessage('Valid vendor ID is required'),
  body('type').isIn(['prior_art', 'prototype']).withMessage('Type must be prior_art or prototype'),
  body('vendorQuoteAmount').optional().isFloat({ min: 0 }),
  body('clientChargedAmount').optional().isFloat({ min: 0 }),
  body('clientPaymentId').optional().isMongoId().withMessage('Invalid client payment ID'),
  body('expectedDelivery').optional().isISO8601().withMessage('Invalid date'),
  body('briefingNotes').optional().trim().isLength({ max: 2000 })
];

const idParam = [param('id').isMongoId().withMessage('Invalid ID')];

// Specific routes first so they aren't captured by /:id.
router.post('/engage', requirePermission('VENDOR', 'CREATE'), engageValidation, handleValidationErrors, vendorController.engageVendor);
router.get('/engagements/:caseId', requirePermission('VENDOR', 'READ'), param('caseId').isMongoId(), handleValidationErrors, vendorController.listEngagementsByCase);
router.patch('/engagements/:id/deliver', requirePermission('VENDOR', 'UPDATE'), idParam, handleValidationErrors, vendorController.markDelivered);
router.patch('/engagements/:id/approve', requirePermission('VENDOR', 'UPDATE'), idParam, handleValidationErrors, vendorController.approveEngagement);
router.post('/engagements/:id/payment', requirePermission('VENDOR', 'UPDATE'), idParam, handleValidationErrors, vendorController.raiseVendorPayment);
router.patch('/engagements/:id/paid', requirePermission('VENDOR', 'UPDATE'), idParam, handleValidationErrors, vendorController.markVendorPaid);

router.get('/', requirePermission('VENDOR', 'READ'), vendorController.listVendors);
router.post('/', requirePermission('VENDOR', 'CREATE'), createVendorValidation, handleValidationErrors, vendorController.createVendor);
router.get('/:id', requirePermission('VENDOR', 'READ'), idParam, handleValidationErrors, vendorController.getVendorById);
router.patch('/:id', requirePermission('VENDOR', 'UPDATE'), idParam, handleValidationErrors, vendorController.updateVendor);

module.exports = router;
