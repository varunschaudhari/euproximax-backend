const express = require('express');
const { body, param, query } = require('express-validator');
const blogController = require('../controllers/blog.controller');
const handleValidationErrors = require('../middleware/validate');
const blogUpload = require('../middleware/blogUpload');

const router = express.Router();

const tagsValidator = (value) => {
    if (Array.isArray(value)) {
        const allStrings = value.every((tag) => typeof tag === 'string');
        if (!allStrings) {
            throw new Error('Tags must be strings');
        }
        return true;
    }

    if (typeof value === 'string') {
        return true;
    }

    throw new Error('Tags must be an array or comma separated string');
};

const authorValidator = (value) => {
    if (typeof value === 'string') {
        if (!value.trim()) {
            throw new Error('Author name cannot be empty');
        }
        return true;
    }

    if (typeof value === 'object' && value !== null) {
        if (!value.name || typeof value.name !== 'string' || !value.name.trim()) {
            throw new Error('Author name is required');
        }
        return true;
    }

    throw new Error('Author must be a string or an object');
};

router.get(
    '/',
    [
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
        query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
        query('category').optional().isLength({ max: 80 }).withMessage('Category is too long'),
        query('search').optional().isLength({ max: 200 }).withMessage('Search term is too long'),
        query('tag').optional().isLength({ max: 40 }).withMessage('Tag is too long'),
        query('featured').optional().isIn(['true', 'false']).withMessage('Featured filter is invalid').toBoolean(),
    ],
    handleValidationErrors,
    blogController.listBlogs
);

router.get(
    '/admin',
    [
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('category').optional().isLength({ max: 80 }).withMessage('Category is too long'),
        query('search').optional().isLength({ max: 200 }).withMessage('Search term is too long'),
        query('status').optional().isString().withMessage('Status filter must be a string'),
        query('submissionStatus').optional().isString().withMessage('Submission status filter must be a string'),
        query('onlySubmissions').optional().isIn(['true', 'false']).withMessage('onlySubmissions must be boolean'),
    ],
    handleValidationErrors,
    blogController.listBlogsAdmin
);

router.get(
    '/admin/:id',
    [param('id').isMongoId().withMessage('Valid blog ID is required')],
    handleValidationErrors,
    blogController.getBlogAdminById
);

router.get(
    '/:slugOrId',
    [param('slugOrId').trim().isLength({ min: 1 }).withMessage('Slug or ID is required')],
    handleValidationErrors,
    blogController.getBlogBySlug
);

router.post(
    '/',
    [
        body('title').trim().isLength({ min: 5, max: 180 }).withMessage('Title must be between 5 and 180 characters'),
        body('excerpt').trim().isLength({ min: 20, max: 500 }).withMessage('Excerpt must be 20-500 characters'),
        body('content').trim().isLength({ min: 100 }).withMessage('Content must be at least 100 characters'),
        body('category').trim().isLength({ min: 2, max: 80 }).withMessage('Category must be between 2 and 80 characters'),
        body('coverImage').optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage('Cover image path is too long'),
        body('tags').optional().custom(tagsValidator),
        body('author').optional().custom(authorValidator),
        body('readTimeMinutes').optional().isInt({ min: 1, max: 60 }).withMessage('Read time must be between 1 and 60 minutes').toInt(),
        body('status').optional().isIn(['Draft', 'Published']).withMessage('Invalid status'),
        body('isFeatured').optional().isBoolean().withMessage('isFeatured must be boolean').toBoolean(),
    ],
    handleValidationErrors,
    blogController.createBlog
);

router.post(
    '/upload/hero',
    blogUpload.single('heroImage'),
    blogController.uploadHeroImage
);

router.post(
    '/submissions',
    [
        body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Name must be between 2 and 120 characters'),
        body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
        body('title').trim().isLength({ min: 5, max: 180 }).withMessage('Title must be between 5 and 180 characters'),
        body('summary').trim().isLength({ min: 50, max: 4000 }).withMessage('Summary must be 50-4000 characters'),
        body('reference').optional({ checkFalsy: true }).isURL().withMessage('Reference must be a valid URL'),
        body('category').optional({ checkFalsy: true }).trim().isLength({ max: 80 }).withMessage('Category is too long'),
    ],
    handleValidationErrors,
    blogController.submitBlogProposal
);

router.put(
    '/:id',
    [
        param('id').isMongoId().withMessage('Valid blog ID is required'),
        body('title').optional().trim().isLength({ min: 5, max: 180 }).withMessage('Title must be between 5 and 180 characters'),
        body('excerpt').optional().trim().isLength({ min: 20, max: 500 }).withMessage('Excerpt must be 20-500 characters'),
        body('content').optional().trim().isLength({ min: 100 }).withMessage('Content must be at least 100 characters'),
        body('category').optional().trim().isLength({ min: 2, max: 80 }).withMessage('Category must be between 2 and 80 characters'),
        body('coverImage').optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage('Cover image path is too long'),
        body('tags').optional().custom(tagsValidator),
        body('author').optional().custom(authorValidator),
        body('readTimeMinutes').optional().isInt({ min: 1, max: 60 }).withMessage('Read time must be between 1 and 60 minutes').toInt(),
        body('status').optional().isIn(['Draft', 'Published']).withMessage('Invalid status'),
        body('isFeatured').optional().isBoolean().withMessage('isFeatured must be boolean').toBoolean(),
        body('slug').optional().trim().isLength({ min: 3, max: 200 }).withMessage('Slug must be between 3 and 200 characters'),
    ],
    handleValidationErrors,
    blogController.updateBlog
);

router.delete(
    '/:id',
    [param('id').isMongoId().withMessage('Valid blog ID is required')],
    handleValidationErrors,
    blogController.deleteBlog
);

module.exports = router;


