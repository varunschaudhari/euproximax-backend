const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const userController = require('../controllers/user.controller');
const handleValidationErrors = require('../middleware/validate');

const createUserValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  body('mobile')
    .trim()
    .notEmpty()
    .withMessage('Mobile number is required')
    .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .withMessage('Please provide a valid mobile number'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('designation')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Designation cannot exceed 100 characters'),
  body('remarks')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Remarks cannot exceed 500 characters'),
  body('roles')
    .optional({ nullable: true })
    .isArray({ min: 1 })
    .withMessage('Roles must be an array of role IDs'),
  body('roles.*')
    .optional()
    .isMongoId()
    .withMessage('Each role must be a valid ID')
];

const listUserValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive number'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search term too long')
];

// GET /api/user/me - Get logged-in user (protected route)
router.get(
  '/me',
  userController.getMe
);

router.get(
  '/:id',
  userController.getUserById
);

const updateUserValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  body('mobile')
    .optional()
    .trim()
    .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .withMessage('Please provide a valid mobile number'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('designation')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Designation cannot exceed 100 characters'),
  body('remarks')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Remarks cannot exceed 500 characters'),
  body('roles')
    .optional({ nullable: true })
    .isArray()
    .withMessage('Roles must be an array of role IDs'),
  body('roles.*')
    .optional()
    .isMongoId()
    .withMessage('Each role must be a valid ID')
];

// GET /api/user - Get paginated users
router.get(
  '/',
  listUserValidation,
  handleValidationErrors,
  userController.getUsers
);

// PUT /api/user/:id - Update user
router.put(
  '/:id',
  updateUserValidation,
  handleValidationErrors,
  userController.updateUser
);

// POST /api/user - Create user via admin
router.post(
  '/',
  createUserValidation,
  handleValidationErrors,
  userController.createUser
);

// DELETE /api/user/:id - Soft delete user
router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid user ID')],
  handleValidationErrors,
  userController.deleteUser
);

module.exports = router;

