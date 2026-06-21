const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const caseController = require('../controllers/case.controller');
const handleValidationErrors = require('../middleware/validate');

const createCaseValidation = [
  body('track').isIn(['A', 'B']).withMessage('Track must be A or B'),
  body('clientId').optional().isMongoId().withMessage('Invalid client ID'),
  body('clientName').optional().trim().isLength({ max: 100 }).withMessage('Client name too long'),
  body('email').optional().isEmail().withMessage('Valid email required'),
  body('phone').optional().trim().isLength({ max: 30 }).withMessage('Invalid phone'),
  body('inventionTitle').optional().trim().isLength({ max: 200 }).withMessage('Title too long'),
  body('inventionDomain').optional().trim().isLength({ max: 100 }).withMessage('Domain too long'),
  body('inventionSummary').optional().trim().isLength({ max: 5000 }).withMessage('Summary too long'),
  body('jurisdiction').optional().isArray().withMessage('Jurisdiction must be an array'),
  body('assignedPM').optional().isMongoId().withMessage('Invalid PM ID'),
  body('assignedAttorney').optional().isMongoId().withMessage('Invalid attorney ID')
];

const fromEnquiryValidation = [
  body('enquiryId').isMongoId().withMessage('Valid enquiry ID is required'),
  body('track').isIn(['A', 'B']).withMessage('Track must be A or B'),
  body('inventionTitle').optional().trim().isLength({ max: 200 }).withMessage('Title too long'),
  body('inventionDomain').optional().trim().isLength({ max: 100 }).withMessage('Domain too long'),
  body('inventionSummary').optional().trim().isLength({ max: 5000 }).withMessage('Summary too long'),
  body('jurisdiction').optional().isArray().withMessage('Jurisdiction must be an array')
];

const idParam = [param('id').isMongoId().withMessage('Invalid case ID')];

const statusValidation = [
  ...idParam,
  body('newStatus').isString().notEmpty().withMessage('newStatus is required'),
  body('note').optional().trim().isLength({ max: 1000 }).withMessage('Note too long')
];

const assignValidation = [
  ...idParam,
  body('assignedPM').optional({ nullable: true }).isMongoId().withMessage('Invalid PM ID'),
  body('assignedAttorney').optional({ nullable: true }).isMongoId().withMessage('Invalid attorney ID')
];

const trackValidation = [...idParam, body('track').isIn(['A', 'B']).withMessage('Track must be A or B')];

const detailsValidation = [
  ...idParam,
  body('inventionTitle').optional().trim().isLength({ max: 200 }),
  body('inventionDomain').optional().trim().isLength({ max: 100 }),
  body('inventionSummary').optional().trim().isLength({ max: 5000 }),
  body('filingType').optional({ nullable: true, checkFalsy: true }).isIn(['provisional', 'complete', 'pct']).withMessage('Invalid filing type'),
  body('jurisdiction').optional().isArray(),
  body('applicationNumber').optional({ nullable: true }).trim().isLength({ max: 100 }),
  body('patentNumber').optional({ nullable: true }).trim().isLength({ max: 100 }),
  body('journalIssueNumber').optional({ nullable: true }).trim().isLength({ max: 100 }),
  body('filingDate').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('priorityDate').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('publicationDate').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('grantDate').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('validUntil').optional({ nullable: true, checkFalsy: true }).isISO8601()
];

router.post('/', createCaseValidation, handleValidationErrors, caseController.createCase);
router.post('/from-enquiry', fromEnquiryValidation, handleValidationErrors, caseController.createCaseFromEnquiry);
router.post('/intake', [
  body('clientName').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone is required').isLength({ max: 30 }),
  body('track').isIn(['A', 'B']).withMessage('Track must be A or B'),
  body('inventionTitle').optional().trim().isLength({ max: 200 }),
  body('inventionDomain').optional().trim().isLength({ max: 100 }),
  body('inventionSummary').optional().trim().isLength({ max: 5000 }),
  body('jurisdiction').optional().isArray()
], handleValidationErrors, caseController.publicIntake);
router.get('/', caseController.listCases);
router.get('/:id', idParam, handleValidationErrors, caseController.getCaseById);
router.patch('/:id', detailsValidation, handleValidationErrors, caseController.updateCaseDetails);
router.get('/:id/timeline', idParam, handleValidationErrors, caseController.getTimeline);
router.get('/:id/activity', idParam, handleValidationErrors, caseController.getActivity);
router.get('/:id/notes', idParam, handleValidationErrors, caseController.listNotes);
router.post('/:id/notes', [...idParam, body('body').trim().notEmpty().withMessage('Note body is required').isLength({ max: 5000 })], handleValidationErrors, caseController.createNote);
router.delete('/:id/notes/:noteId', [...idParam, param('noteId').isMongoId().withMessage('Invalid note ID')], handleValidationErrors, caseController.deleteNote);
router.patch('/:id/status', statusValidation, handleValidationErrors, caseController.updateStatus);
router.patch('/:id/assign', assignValidation, handleValidationErrors, caseController.assignCase);
router.patch('/:id/hold', idParam, handleValidationErrors, caseController.holdCase);
router.patch('/:id/strategy', idParam, handleValidationErrors, caseController.lockStrategy);
router.patch('/:id/track', trackValidation, handleValidationErrors, caseController.changeTrack);

module.exports = router;
