const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');

const router = express.Router();

// Get dashboard statistics
router.get('/stats', dashboardController.getDashboardStats);

module.exports = router;

