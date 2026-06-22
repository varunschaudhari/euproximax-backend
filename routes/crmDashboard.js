const express = require('express');
const router = express.Router();
const crmDashboardController = require('../controllers/crmDashboard.controller');
const requirePermission = require('../middleware/requirePermission');

router.get('/', requirePermission('CASE', 'READ'), crmDashboardController.getDashboard);

module.exports = router;
