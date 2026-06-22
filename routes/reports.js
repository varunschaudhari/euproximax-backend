const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const requirePermission = require('../middleware/requirePermission');

// Owner + accounts only (enforced server-side + on the frontend via REPORT READ).
router.use(requirePermission('REPORT', 'READ'));
router.get('/revenue', reportsController.revenue);
router.get('/cases', reportsController.cases);
router.get('/profit', reportsController.profit);
router.get('/vendors', reportsController.vendors);
router.get('/renewals', reportsController.renewals);

module.exports = router;
