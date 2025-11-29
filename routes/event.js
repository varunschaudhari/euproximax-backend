const express = require('express');
const { body, param, query } = require('express-validator');
const eventController = require('../controllers/event.controller');
const handleValidationErrors = require('../middleware/validate');
const eventUpload = require('../middleware/eventUpload');

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
    query('category').optional().isLength({ max: 80 }).withMessage('Category is too long'),
    query('featured').optional().isIn(['true', 'false']).withMessage('Featured filter is invalid').toBoolean(),
    query('status').optional().isIn(['upcoming', 'past']).withMessage('Status filter must be upcoming or past'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],
  handleValidationErrors,
  eventController.publicListEvents
);

// Admin routes
router.get(
  '/admin',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('category').optional().isLength({ max: 80 }).withMessage('Category is too long'),
    query('search').optional().isLength({ max: 200 }).withMessage('Search term is too long'),
    query('status').optional().custom((value) => {
      const statuses = normalizeList(value);
      const allowed = ['Draft', 'Published', 'Cancelled', 'Completed'];
      if (statuses.some((s) => !allowed.includes(s))) {
        throw new Error('Invalid status value');
      }
      return true;
    }),
  ],
  handleValidationErrors,
  eventController.adminListEvents
);

router.get(
  '/admin/:id',
  [param('id').isMongoId().withMessage('Valid event ID is required')],
  handleValidationErrors,
  eventController.adminGetEvent
);

router.post(
  '/',
  [
    body('title').trim().isLength({ min: 5, max: 180 }).withMessage('Title must be between 5 and 180 characters'),
    body('description').trim().isLength({ min: 20, max: 2000 }).withMessage('Description must be 20-2000 characters'),
    body('category').trim().isLength({ min: 2, max: 80 }).withMessage('Category must be between 2 and 80 characters'),
    body('venue').trim().isLength({ min: 2, max: 200 }).withMessage('Venue must be between 2 and 200 characters'),
    body('startDate').isISO8601().withMessage('Valid start date is required'),
    body('endDate').isISO8601().withMessage('Valid end date is required'),
    body('registrationLink').optional({ checkFalsy: true }).isURL().withMessage('Registration link must be a valid URL'),
    body('maxAttendees').optional().isInt({ min: 0 }).withMessage('Max attendees must be a non-negative integer'),
    body('outcomes').optional(),
    body('heroImage').optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage('Hero image path is too long'),
    body('heroImageAlt').optional({ checkFalsy: true }).isLength({ max: 160 }).withMessage('Hero image alt is too long'),
    body('status').optional().isIn(['Draft', 'Published', 'Cancelled', 'Completed']).withMessage('Invalid status'),
    body('isFeatured').optional().isBoolean().withMessage('isFeatured must be boolean').toBoolean(),
    body('slug').optional().trim().isLength({ min: 3, max: 200 }).withMessage('Slug must be between 3 and 200 characters'),
    body('seoTitle').optional({ checkFalsy: true }).isLength({ max: 180 }).withMessage('SEO title is too long'),
    body('seoDescription').optional({ checkFalsy: true }).isLength({ max: 320 }).withMessage('SEO description is too long'),
    body('seoKeywords').optional(),
    body('utmSource').optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage('UTM source is too long'),
    body('utmMedium').optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage('UTM medium is too long'),
    body('utmCampaign').optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage('UTM campaign is too long'),
  ],
  handleValidationErrors,
  eventController.createEvent
);

router.post(
  '/upload/hero',
  eventUpload.single('heroImage'),
  eventController.uploadHeroImage
);

router.post(
  '/upload/gallery',
  (req, res, next) => {
    eventUpload.array('galleryImages', 20)(req, res, (err) => {
      if (err) {
        // Handle multer errors
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size too large. Maximum size is 10MB per file.',
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Maximum is 20 files.',
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
  eventController.uploadGalleryImages
);

router.put(
  '/:id',
  [
    param('id').isMongoId().withMessage('Valid event ID is required'),
    body('title').optional().trim().isLength({ min: 5, max: 180 }).withMessage('Title must be between 5 and 180 characters'),
    body('description').optional().trim().isLength({ min: 20, max: 2000 }).withMessage('Description must be 20-2000 characters'),
    body('category').optional().trim().isLength({ min: 2, max: 80 }).withMessage('Category must be between 2 and 80 characters'),
    body('venue').optional().trim().isLength({ min: 2, max: 200 }).withMessage('Venue must be between 2 and 200 characters'),
    body('startDate').optional().isISO8601().withMessage('Valid start date is required'),
    body('endDate').optional().isISO8601().withMessage('Valid end date is required'),
    body('registrationLink').optional({ checkFalsy: true }).isURL().withMessage('Registration link must be a valid URL'),
    body('maxAttendees').optional().isInt({ min: 0 }).withMessage('Max attendees must be a non-negative integer'),
    body('outcomes').optional(),
    body('heroImage').optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage('Hero image path is too long'),
    body('heroImageAlt').optional({ checkFalsy: true }).isLength({ max: 160 }).withMessage('Hero image alt is too long'),
    body('status').optional().isIn(['Draft', 'Published', 'Cancelled', 'Completed']).withMessage('Invalid status'),
    body('isFeatured').optional().isBoolean().withMessage('isFeatured must be boolean').toBoolean(),
    body('slug').optional().trim().isLength({ min: 3, max: 200 }).withMessage('Slug must be between 3 and 200 characters'),
    body('seoTitle').optional({ checkFalsy: true }).isLength({ max: 180 }).withMessage('SEO title is too long'),
    body('seoDescription').optional({ checkFalsy: true }).isLength({ max: 320 }).withMessage('SEO description is too long'),
    body('seoKeywords').optional(),
    body('utmSource').optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage('UTM source is too long'),
    body('utmMedium').optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage('UTM medium is too long'),
    body('utmCampaign').optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage('UTM campaign is too long'),
  ],
  handleValidationErrors,
  eventController.updateEvent
);

router.put(
  '/:id/images',
  [
    param('id').isMongoId().withMessage('Valid event ID is required'),
    body('images').isArray().withMessage('Images must be an array'),
    body('images.*.url').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 500 }).withMessage('Image URL must be between 1 and 500 characters'),
    body('images.*.alt').optional({ checkFalsy: true }).trim().isLength({ max: 160 }).withMessage('Image alt is too long'),
    body('images.*.caption').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Image caption is too long'),
    body('images.*.order').optional().isInt({ min: 0 }).withMessage('Image order must be a non-negative integer'),
  ],
  handleValidationErrors,
  eventController.updateEventImages
);

router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Valid event ID is required')],
  handleValidationErrors,
  eventController.deleteEvent
);

module.exports = router;

