const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const clientController = require('../controllers/crmClient.controller');
const handleValidationErrors = require('../middleware/validate');
const requirePermission = require('../middleware/requirePermission');

const createValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone is required').isLength({ max: 30 }),
  body('whatsapp').optional().trim().isLength({ max: 30 }),
  body('address').optional().trim().isLength({ max: 500 }),
  body('gstNumber').optional().trim().isLength({ max: 30 })
];

const updateValidation = [
  param('id').isMongoId().withMessage('Invalid client ID'),
  body('name').optional().trim().isLength({ max: 100 }),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('phone').optional().trim().isLength({ max: 30 }),
  body('whatsapp').optional().trim().isLength({ max: 30 }),
  body('address').optional().trim().isLength({ max: 500 }),
  body('gstNumber').optional().trim().isLength({ max: 30 })
];

const idParam = [param('id').isMongoId().withMessage('Invalid client ID')];

router.get('/', requirePermission('CRM_CLIENT', 'READ'), clientController.listClients);
router.post('/', requirePermission('CRM_CLIENT', 'CREATE'), createValidation, handleValidationErrors, clientController.createClient);
router.get('/:id', requirePermission('CRM_CLIENT', 'READ'), idParam, handleValidationErrors, clientController.getClientById);
router.patch('/:id', requirePermission('CRM_CLIENT', 'UPDATE'), updateValidation, handleValidationErrors, clientController.updateClient);
router.get('/:id/cases', requirePermission('CRM_CLIENT', 'READ'), idParam, handleValidationErrors, clientController.getClientCases);
router.post('/:id/portal-access', requirePermission('CRM_CLIENT', 'UPDATE'), idParam, handleValidationErrors, clientController.grantPortalAccess);

module.exports = router;
