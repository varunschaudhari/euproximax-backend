const Quote = require('../models/Quote');
const Case = require('../models/Case');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { getUserRoleNames } = require('../utils/crmAccess');
const { GATE_OVERRIDE_ROLES } = require('../utils/crmGates');
const { applyTransition } = require('../utils/caseWorkflow');

const POPULATE = [
  { path: 'createdBy', select: 'name email' },
  { path: 'internalApprovedBy', select: 'name email' },
  { path: 'sentBy', select: 'name email' }
];

/**
 * GET /api/v1/quotes/case/:caseId — the case's quote (null if none yet).
 */
const getByCase = async (req, res, next) => {
  try {
    const quote = await Quote.findOne({ caseId: req.params.caseId }).populate(POPULATE);
    res.status(200).json({ success: true, message: 'Quote', data: quote });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/quotes/case/:caseId — create or update the draft quote.
 * Editable only while draft. Saving from STRATEGY_LOCKED advances the case to
 * QUOTE_DRAFTED. Body: { title, lineItems, gstPercent, currency, notes, validUntil }.
 */
const saveQuote = async (req, res, next) => {
  try {
    const caseDoc = await Case.findById(req.params.caseId);
    if (!caseDoc) return next(new AppError('Case not found', 404));

    let quote = await Quote.findOne({ caseId: caseDoc._id });
    if (quote && !['draft'].includes(quote.status)) {
      return next(new AppError('Quote can only be edited while in draft. Reset/recreate is not allowed after internal approval.', 409));
    }

    const { title, lineItems, gstPercent, currency, notes, validUntil } = req.body;
    if (!quote) {
      quote = new Quote({ caseId: caseDoc._id, createdBy: req.user._id });
    }
    if (title !== undefined) quote.title = title;
    if (Array.isArray(lineItems)) quote.lineItems = lineItems;
    if (gstPercent !== undefined) quote.gstPercent = gstPercent;
    if (currency) quote.currency = currency;
    if (notes !== undefined) quote.notes = notes;
    if (validUntil !== undefined) quote.validUntil = validUntil ? new Date(validUntil) : undefined;
    quote.status = 'draft';
    quote.recomputeTotals();
    await quote.save();

    // Advance the case into Phase 4 drafting if it's just locked strategy.
    if (caseDoc.status === 'STRATEGY_LOCKED') {
      await applyTransition(caseDoc, 'QUOTE_DRAFTED', { userId: req.user._id, note: 'Quotation drafted' });
    }

    await quote.populate(POPULATE);
    res.status(200).json({ success: true, message: 'Quote saved', data: quote });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/quotes/case/:caseId/approve — internal owner approval.
 * QUOTE_DRAFTED → QUOTE_APPROVED_INTERNAL. Owner-type roles only (spec §3).
 */
const approveInternal = async (req, res, next) => {
  try {
    const roleNames = await getUserRoleNames(req.user._id);
    if (!roleNames.some((r) => GATE_OVERRIDE_ROLES.includes(r))) {
      return next(new AppError('Only an owner can approve a quote internally', 403));
    }

    const caseDoc = await Case.findById(req.params.caseId);
    if (!caseDoc) return next(new AppError('Case not found', 404));
    const quote = await Quote.findOne({ caseId: caseDoc._id });
    if (!quote) return next(new AppError('No quote to approve', 404));
    if (!quote.lineItems.length) return next(new AppError('Add at least one line item before approving', 400));
    if (caseDoc.status !== 'QUOTE_DRAFTED') {
      return next(new AppError('Quote can only be approved from the drafted stage', 409));
    }

    quote.status = 'approved_internal';
    quote.internalApprovedBy = req.user._id;
    quote.internalApprovedAt = new Date();
    await quote.save();
    await applyTransition(caseDoc, 'QUOTE_APPROVED_INTERNAL', { userId: req.user._id, note: 'Quote approved internally' });

    await quote.populate(POPULATE);
    res.status(200).json({ success: true, message: 'Quote approved internally', data: quote });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/quotes/case/:caseId/send — send the approved quote to the client.
 * QUOTE_APPROVED_INTERNAL → QUOTE_SENT.
 */
const sendToClient = async (req, res, next) => {
  try {
    const caseDoc = await Case.findById(req.params.caseId);
    if (!caseDoc) return next(new AppError('Case not found', 404));
    const quote = await Quote.findOne({ caseId: caseDoc._id });
    if (!quote) return next(new AppError('No quote to send', 404));
    if (caseDoc.status !== 'QUOTE_APPROVED_INTERNAL') {
      return next(new AppError('Quote must be internally approved before sending', 409));
    }

    quote.status = 'sent';
    quote.sentBy = req.user._id;
    quote.sentAt = new Date();
    await quote.save();
    // This transition notifies the client; they then approve/decline from the portal.
    await applyTransition(caseDoc, 'QUOTE_SENT', { userId: req.user._id, note: 'Quote sent to client' });

    await quote.populate(POPULATE);
    logger.info(`Quote sent for case ${caseDoc.caseNumber}`);
    res.status(200).json({ success: true, message: 'Quote sent to client', data: quote });
  } catch (error) {
    next(error);
  }
};

module.exports = { getByCase, saveQuote, approveInternal, sendToClient };
