const express = require('express');
const { body, param, query } = require('express-validator');
const partnerController = require('../controllers/partner.controller');
const handleValidationErrors = require('../middleware/validate');
const partnerUpload = require('../middleware/partnerUpload');

const router = express.Router();

const normalizeList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.split(',').map((v) => v.trim()).filter(Boolean);
};

// Public routes
router.get(
  '/',
  [
    query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('Limit must be between 1 and 200'),
  ],
  handleValidationErrors,
  partnerController.publicListPartners
);

// Admin routes (must be before /:slug to avoid route conflicts)
router.get(
  '/admin',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('location').optional().isLength({ max: 100 }).withMessage('Location is too long'),
    query('search').optional().isLength({ max: 200 }).withMessage('Search term is too long'),
    query('status').optional().custom((value) => {
      const statuses = normalizeList(value);
      const allowed = ['Active', 'Inactive'];
      if (statuses.some((s) => !allowed.includes(s))) {
        throw new Error('Invalid status value');
      }
      return true;
    }),
  ],
  handleValidationErrors,
  partnerController.adminListPartners
);

router.get(
  '/admin/:id',
  [param('id').isMongoId().withMessage('Valid partner ID is required')],
  handleValidationErrors,
  partnerController.adminGetPartner
);

// Public route for getting partner by slug (must be after /admin routes)
router.get(
  '/:slug',
  [
    param('slug').trim().isLength({ min: 1, max: 200 }).withMessage('Valid slug is required'),
  ],
  handleValidationErrors,
  partnerController.publicGetPartnerBySlug
);

router.post(
  '/',
  [
    body('name').trim().isLength({ min: 2, max: 200 }).withMessage('Name must be between 2 and 200 characters'),
    body('location').trim().isLength({ min: 2, max: 100 }).withMessage('Location must be between 2 and 100 characters'),
    body('role').trim().isLength({ min: 5, max: 300 }).withMessage('Role must be between 5 and 300 characters'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email must be a valid email address'),
    body('phone').optional({ checkFalsy: true }).isLength({ max: 20 }).withMessage('Phone must be at most 20 characters'),
    body('bio').optional({ checkFalsy: true }).isLength({ max: 5000 }).withMessage('Bio must be at most 5000 characters'),
    body('expertise').optional(),
    body('image').optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage('Image path is too long'),
    body('status').optional().isIn(['Active', 'Inactive']).withMessage('Invalid status'),
    body('order').optional().isInt({ min: 0 }).withMessage('Order must be a non-negative integer'),
    body('slug').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Slug must be between 1 and 200 characters'),
  ],
  handleValidationErrors,
  partnerController.createPartner
);

router.post(
  '/upload/image',
  (req, res, next) => {
    partnerUpload.single('image')(req, res, (err) => {
      if (err) {
        // Handle multer errors
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size too large. Maximum size is 10MB per file.',
          });
        }
        if (err.message && err.message.includes('File type')) {
          return res.status(400).json({
            success: false,
            message: err.message,
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload error',
        });
      }
      next();
    });
  },
  partnerController.uploadImage
);

router.put(
  '/:id',
  [
    param('id').isMongoId().withMessage('Valid partner ID is required'),
    body('name').optional().trim().isLength({ min: 2, max: 200 }).withMessage('Name must be between 2 and 200 characters'),
    body('location').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Location must be between 2 and 100 characters'),
    body('role').optional().trim().isLength({ min: 5, max: 300 }).withMessage('Role must be between 5 and 300 characters'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email must be a valid email address'),
    body('phone').optional({ checkFalsy: true }).isLength({ max: 20 }).withMessage('Phone must be at most 20 characters'),
    body('bio').optional({ checkFalsy: true }).isLength({ max: 5000 }).withMessage('Bio must be at most 5000 characters'),
    body('expertise').optional(),
    body('image').optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage('Image path is too long'),
    body('status').optional().isIn(['Active', 'Inactive']).withMessage('Invalid status'),
    body('order').optional().isInt({ min: 0 }).withMessage('Order must be a non-negative integer'),
    body('slug').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Slug must be between 1 and 200 characters'),
  ],
  handleValidationErrors,
  partnerController.updatePartner
);

router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Valid partner ID is required')],
  handleValidationErrors,
  partnerController.deletePartner
);

module.exports = router;

