const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');

// Owner + accounts (ACL gating is enforced on the frontend via REPORT permission).
router.get('/revenue', reportsController.revenue);
router.get('/cases', reportsController.cases);
router.get('/profit', reportsController.profit);
router.get('/vendors', reportsController.vendors);
router.get('/renewals', reportsController.renewals);

module.exports = router;
