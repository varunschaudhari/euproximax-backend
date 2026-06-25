const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const requirePermission = require('../middleware/requirePermission');

// Public read
router.get('/', settingsController.getSettings);

// Admin update
router.patch('/', requirePermission('SETTINGS', 'UPDATE'), settingsController.updateSettings);

module.exports = router;
