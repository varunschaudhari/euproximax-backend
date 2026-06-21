const Deadline = require('../models/Deadline');
const Case = require('../models/Case');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

const POPULATE = [
  { path: 'caseId', select: 'caseNumber inventionTitle status' },
  { path: 'ownerId', select: 'name email' }
];

/**
 * GET /api/v1/deadlines/case/:caseId
 */
const listByCase = async (req, res, next) => {
  try {
    const deadlines = await Deadline.find({ caseId: req.params.caseId })
      .sort({ statutoryDeadline: 1 })
      .populate(POPULATE);
    res.status(200).json({ success: true, message: 'Deadlines fetched', data: deadlines });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/deadlines
 * Body: { caseId, type, label, statutoryDeadline, internalDeadline?, ownerId? }
 */
const createDeadline = async (req, res, next) => {
  try {
    const { caseId, type, label, statutoryDeadline, internalDeadline, ownerId } = req.body;

    const caseDoc = await Case.findById(caseId).select('_id');
    if (!caseDoc) return next(new AppError('Case not found', 404));

    const deadline = await Deadline.create({
      caseId,
      type,
      label,
      statutoryDeadline: new Date(statutoryDeadline),
      internalDeadline: internalDeadline ? new Date(internalDeadline) : undefined,
      ownerId: ownerId || undefined,
      status: 'active'
    });

    await deadline.populate(POPULATE);
    logger.info(`Deadline created for case ${caseId} by ${req.user?.name || 'unknown'}`);
    res.status(201).json({ success: true, message: 'Deadline created', data: deadline });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/deadlines/:id/complete
 */
const completeDeadline = async (req, res, next) => {
  try {
    const deadline = await Deadline.findById(req.params.id);
    if (!deadline) return next(new AppError('Deadline not found', 404));

    deadline.status = 'completed';
    deadline.completedAt = new Date();
    deadline.completedBy = req.user._id;
    await deadline.save();
    await deadline.populate(POPULATE);

    res.status(200).json({ success: true, message: 'Deadline completed', data: deadline });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/deadlines/upcoming?days=7
 * Active deadlines due within the window (default 7 days).
 */
const listUpcoming = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 365);
    const now = new Date();
    const until = new Date(now.getTime() + days * DAY_MS);
    const deadlines = await Deadline.find({
      status: 'active',
      statutoryDeadline: { $gte: now, $lte: until }
    })
      .sort({ statutoryDeadline: 1 })
      .populate(POPULATE);
    res.status(200).json({ success: true, message: 'Upcoming deadlines', data: deadlines });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/deadlines/overdue
 * Active deadlines already past their statutory date, plus those marked missed.
 */
const listOverdue = async (req, res, next) => {
  try {
    const now = new Date();
    const deadlines = await Deadline.find({
      $or: [{ status: 'active', statutoryDeadline: { $lt: now } }, { status: 'missed' }]
    })
      .sort({ statutoryDeadline: 1 })
      .populate(POPULATE);
    res.status(200).json({ success: true, message: 'Overdue deadlines', data: deadlines });
  } catch (error) {
    next(error);
  }
};

module.exports = { listByCase, createDeadline, completeDeadline, listUpcoming, listOverdue };
