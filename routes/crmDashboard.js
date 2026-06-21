const express = require('express');
const router = express.Router();
const crmDashboardController = require('../controllers/crmDashboard.controller');

router.get('/', crmDashboardController.getDashboard);

module.exports = router;
