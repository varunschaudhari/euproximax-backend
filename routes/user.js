const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

// GET /api/user/me - Get logged-in user (protected route)
// Note: JWT middleware is applied globally in routes/index.js
router.get(
  '/me',
  userController.getMe
);

module.exports = router;

