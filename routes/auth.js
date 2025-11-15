const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const authenticateToken = require('../middleware/auth');
const handleValidationErrors = require('../middleware/validate');

// Validation rules for registration
const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

// Validation rules for login
const loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// POST /api/auth/register - Register new user
router.post(
  '/register',
  registerValidation,
  handleValidationErrors,
  authController.register
);

// POST /api/auth/login - Login user
router.post(
  '/login',
  loginValidation,
  handleValidationErrors,
  authController.login
);

// GET /api/auth/me - Get logged-in user (protected route)
router.get(
  '/me',
  authenticateToken,
  authController.getMe
);

module.exports = router;

