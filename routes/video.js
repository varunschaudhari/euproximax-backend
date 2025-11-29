const express = require('express');
const { body, param, query } = require('express-validator');
const videoController = require('../controllers/video.controller');
const handleValidationErrors = require('../middleware/validate');
const videoUpload = require('../middleware/videoUpload');
const blogUpload = require('../middleware/blogUpload');

const router = express.Router();

const tagsValidator = (value) => {
  if (!value) return true;
  if (Array.isArray(value)) {
    const allStrings = value.every((tag) => typeof tag === 'string');
    if (!allStrings) {
      throw new Error('Tags must be strings');
    }
    return true;
  }
  if (typeof value === 'string') return true;
  throw new Error('Tags must be an array or comma separated string');
};

router.get(
  '/',
  [
    query('category').optional().isLength({ max: 80 }).withMessage('Category is too long'),
    query('featured').optional().isIn(['true', 'false']).withMessage('Featured must be boolean'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],
  handleValidationErrors,
  videoController.publicListVideos
);

router.get(
  '/admin',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('category').optional().isLength({ max: 80 }).withMessage('Category is too long'),
    query('search').optional().isLength({ max: 200 }).withMessage('Search term is too long'),
    query('status').optional().isString().withMessage('Status must be a string'),
  ],
  handleValidationErrors,
  videoController.adminListVideos
);

router.get(
  '/admin/:id',
  [param('id').isMongoId().withMessage('Valid video ID is required')],
  handleValidationErrors,
  videoController.adminGetVideo
);

const videoBodyValidators = [
  body('title').trim().isLength({ min: 3, max: 180 }).withMessage('Title must be between 3 and 180 characters'),
  body('description').trim().isLength({ min: 20, max: 2000 }).withMessage('Description must be 20-2000 characters'),
  body('category').optional({ checkFalsy: true }).isLength({ max: 80 }).withMessage('Category is too long'),
  body('videoUrl').trim().isLength({ min: 5, max: 500 }).withMessage('Video URL is required'),
  body('thumbnailUrl').optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage('Thumbnail URL is too long'),
  body('heroImageAlt').optional({ checkFalsy: true }).isLength({ max: 160 }).withMessage('Alt text is too long'),
  body('tags').optional().custom(tagsValidator),
  body('durationSeconds').optional().isInt({ min: 0 }).withMessage('Duration must be a positive number'),
  body('status').optional().isIn(['Draft', 'Published']).withMessage('Invalid status'),
  body('isFeatured').optional().isBoolean().withMessage('isFeatured must be boolean').toBoolean(),
  body('seoTitle').optional({ checkFalsy: true }).isLength({ max: 180 }).withMessage('SEO title is too long'),
  body('seoDescription').optional({ checkFalsy: true }).isLength({ max: 320 }).withMessage('SEO description is too long'),
  body('seoKeywords').optional().custom(tagsValidator),
];

router.post('/', videoBodyValidators, handleValidationErrors, videoController.adminCreateVideo);

router.put(
  '/:id',
  [param('id').isMongoId().withMessage('Valid video ID is required'), ...videoBodyValidators],
  handleValidationErrors,
  videoController.adminUpdateVideo
);

router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Valid video ID is required')],
  handleValidationErrors,
  videoController.adminDeleteVideo
);

router.post('/upload/video', videoUpload.single('video'), videoController.uploadVideoFile);
router.post('/upload/thumbnail', blogUpload.single('thumbnail'), videoController.uploadThumbnail);

module.exports = router;


