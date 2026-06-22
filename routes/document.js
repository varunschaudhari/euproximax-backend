const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
const documentController = require('../controllers/document.controller');
const documentUpload = require('../middleware/documentUpload');
const handleValidationErrors = require('../middleware/validate');
const requirePermission = require('../middleware/requirePermission');

const idParam = [param('id').isMongoId().withMessage('Invalid document ID')];

router.post('/upload', requirePermission('DOCUMENT', 'CREATE'), documentUpload.single('file'), documentController.uploadDocument);
router.get('/case/:caseId', requirePermission('DOCUMENT', 'READ'), param('caseId').isMongoId(), handleValidationErrors, documentController.listByCase);
router.get('/:id/download', requirePermission('DOCUMENT', 'READ'), idParam, handleValidationErrors, documentController.downloadDocument);
router.patch('/:id/visibility', requirePermission('DOCUMENT', 'UPDATE'), idParam, handleValidationErrors, documentController.toggleVisibility);
router.patch('/:id/lock', requirePermission('DOCUMENT', 'UPDATE'), idParam, handleValidationErrors, documentController.lockDocument);
router.delete('/:id', requirePermission('DOCUMENT', 'DELETE'), idParam, handleValidationErrors, documentController.deleteDocument);

module.exports = router;
