const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
const documentController = require('../controllers/document.controller');
const documentUpload = require('../middleware/documentUpload');
const handleValidationErrors = require('../middleware/validate');

const idParam = [param('id').isMongoId().withMessage('Invalid document ID')];

router.post('/upload', documentUpload.single('file'), documentController.uploadDocument);
router.get('/case/:caseId', param('caseId').isMongoId(), handleValidationErrors, documentController.listByCase);
router.get('/:id/download', idParam, handleValidationErrors, documentController.downloadDocument);
router.patch('/:id/visibility', idParam, handleValidationErrors, documentController.toggleVisibility);
router.patch('/:id/lock', idParam, handleValidationErrors, documentController.lockDocument);
router.delete('/:id', idParam, handleValidationErrors, documentController.deleteDocument);

module.exports = router;
