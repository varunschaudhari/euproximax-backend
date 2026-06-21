const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const clientController = require('../controllers/crmClient.controller');
const handleValidationErrors = require('../middleware/validate');

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

router.get('/', clientController.listClients);
router.post('/', createValidation, handleValidationErrors, clientController.createClient);
router.get('/:id', idParam, handleValidationErrors, clientController.getClientById);
router.patch('/:id', updateValidation, handleValidationErrors, clientController.updateClient);
router.get('/:id/cases', idParam, handleValidationErrors, clientController.getClientCases);
router.post('/:id/portal-access', idParam, handleValidationErrors, clientController.grantPortalAccess);

module.exports = router;
