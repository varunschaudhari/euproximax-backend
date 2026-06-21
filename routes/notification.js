const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
const notificationController = require('../controllers/notification.controller');
const handleValidationErrors = require('../middleware/validate');

router.get('/case/:caseId', param('caseId').isMongoId(), handleValidationErrors, notificationController.listByCase);
router.get('/user/:userId', param('userId').isMongoId(), handleValidationErrors, notificationController.listForUser);
router.post('/test', notificationController.sendTest);

module.exports = router;
