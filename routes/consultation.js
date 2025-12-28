const express = require('express');
const { body, param, query } = require('express-validator');
const consultationController = require('../controllers/consultation.controller');
const handleValidationErrors = require('../middleware/validate');

const router = express.Router();

// ==================== PUBLIC ROUTES ====================

// Get available slots
router.get(
  '/slots',
  [
    query('date').optional().isISO8601().withMessage('Date must be in ISO8601 format'),
    query('startDate').optional().isISO8601().withMessage('Start date must be in ISO8601 format'),
    query('endDate').optional().isISO8601().withMessage('End date must be in ISO8601 format'),
  ],
  handleValidationErrors,
  consultationController.getAvailableSlots
);

// Book a consultation
router.post(
  '/book',
  [
    body('slotId').isMongoId().withMessage('Valid slot ID is required'),
    body('userName').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('userEmail').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('userPhone').trim().isLength({ min: 5, max: 20 }).withMessage('Phone must be between 5 and 20 characters'),
    body('message').optional().trim().isLength({ max: 1000 }).withMessage('Message must not exceed 1000 characters'),
  ],
  handleValidationErrors,
  consultationController.bookConsultation
);

// Get booking details
router.get(
  '/bookings/:bookingId',
  [
    param('bookingId').isMongoId().withMessage('Valid booking ID is required'),
  ],
  handleValidationErrors,
  consultationController.getBookingDetails
);

// Cancel booking
router.post(
  '/bookings/:bookingId/cancel',
  [
    param('bookingId').isMongoId().withMessage('Valid booking ID is required'),
    body('userEmail').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  ],
  handleValidationErrors,
  consultationController.cancelBooking
);

// ==================== ADMIN ROUTES ====================

// Admin: List all slots
router.get(
  '/admin/slots',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['available', 'booked', 'cancelled', 'completed']).withMessage('Invalid status'),
    query('isAvailable').optional().isIn(['true', 'false']).withMessage('isAvailable must be true or false'),
    query('startDate').optional().isISO8601().withMessage('Start date must be in ISO8601 format'),
    query('endDate').optional().isISO8601().withMessage('End date must be in ISO8601 format'),
  ],
  handleValidationErrors,
  consultationController.adminListSlots
);

// Admin: Get a single slot
router.get(
  '/admin/slots/:slotId',
  [
    param('slotId').isMongoId().withMessage('Valid slot ID is required'),
  ],
  handleValidationErrors,
  consultationController.adminGetSlot
);

// Admin: Create a slot
router.post(
  '/admin/slots',
  [
    body('date').isISO8601().withMessage('Valid date is required'),
    body('startTime').matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
    body('duration').optional().isInt({ min: 15, max: 480 }).withMessage('Duration must be between 15 and 480 minutes'),
    body('maxBookings').optional().isInt({ min: 1 }).withMessage('Max bookings must be at least 1'),
    body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
    body('status').optional().isIn(['available', 'booked', 'cancelled', 'completed']).withMessage('Invalid status'),
  ],
  handleValidationErrors,
  consultationController.adminCreateSlot
);

// Admin: Update a slot
router.put(
  '/admin/slots/:slotId',
  [
    param('slotId').isMongoId().withMessage('Valid slot ID is required'),
    body('date').optional().isISO8601().withMessage('Valid date is required'),
    body('startTime').optional().matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
    body('duration').optional().isInt({ min: 15, max: 480 }).withMessage('Duration must be between 15 and 480 minutes'),
    body('maxBookings').optional().isInt({ min: 1 }).withMessage('Max bookings must be at least 1'),
    body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
    body('status').optional().isIn(['available', 'booked', 'cancelled', 'completed']).withMessage('Invalid status'),
    body('isAvailable').optional().isBoolean().withMessage('isAvailable must be boolean'),
  ],
  handleValidationErrors,
  consultationController.adminUpdateSlot
);

// Admin: Delete a slot
router.delete(
  '/admin/slots/:slotId',
  [
    param('slotId').isMongoId().withMessage('Valid slot ID is required'),
  ],
  handleValidationErrors,
  consultationController.adminDeleteSlot
);

// Admin: Create multiple slots for a single date
router.post(
  '/admin/slots/multiple',
  [
    body('date').isISO8601().withMessage('Valid date is required'),
    body('slots').isArray({ min: 1 }).withMessage('Slots array with at least one slot is required'),
    body('slots.*.startTime').matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
    body('slots.*.duration').optional().isInt({ min: 15, max: 480 }).withMessage('Duration must be between 15 and 480 minutes'),
    body('slots.*.maxBookings').optional().isInt({ min: 1 }).withMessage('Max bookings must be at least 1'),
    body('slots.*.notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
    body('slots.*.status').optional().isIn(['available', 'booked', 'cancelled', 'completed']).withMessage('Invalid status'),
  ],
  handleValidationErrors,
  consultationController.adminCreateMultipleSlots
);

// Admin: Create bulk slots
router.post(
  '/admin/slots/bulk',
  [
    body('startDate').isISO8601().withMessage('Valid start date is required'),
    body('endDate').isISO8601().withMessage('Valid end date is required'),
    body('startTime').matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
    body('endTime').matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format'),
    body('interval').isInt({ min: 15, max: 480 }).withMessage('Interval must be between 15 and 480 minutes'),
    body('duration').optional().isInt({ min: 15, max: 480 }).withMessage('Duration must be between 15 and 480 minutes'),
    body('maxBookings').optional().isInt({ min: 1 }).withMessage('Max bookings must be at least 1'),
    body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
  ],
  handleValidationErrors,
  consultationController.adminCreateBulkSlots
);

// Admin: List all bookings
router.get(
  '/admin/bookings',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['pending', 'confirmed', 'cancelled', 'completed']).withMessage('Invalid status'),
    query('slotId').optional().isMongoId().withMessage('Valid slot ID is required'),
    query('userEmail').optional().trim().isEmail().withMessage('Valid email is required'),
    query('startDate').optional().isISO8601().withMessage('Start date must be in ISO8601 format'),
    query('endDate').optional().isISO8601().withMessage('End date must be in ISO8601 format'),
  ],
  handleValidationErrors,
  consultationController.adminListBookings
);

// Admin: Get booking details
router.get(
  '/admin/bookings/:bookingId',
  [
    param('bookingId').isMongoId().withMessage('Valid booking ID is required'),
  ],
  handleValidationErrors,
  consultationController.adminGetBooking
);

// Admin: Update booking
router.put(
  '/admin/bookings/:bookingId',
  [
    param('bookingId').isMongoId().withMessage('Valid booking ID is required'),
    body('status').optional().isIn(['pending', 'confirmed', 'cancelled', 'completed']).withMessage('Invalid status'),
    body('meetingLink').optional().trim().isURL().withMessage('Meeting link must be a valid URL'),
    body('message').optional().trim().isLength({ max: 1000 }).withMessage('Message must not exceed 1000 characters'),
  ],
  handleValidationErrors,
  consultationController.adminUpdateBooking
);

module.exports = router;

