const Payment = require('../models/Payment');
const Case = require('../models/Case');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const Client = require('../models/Client');
const razorpay = require('../utils/razorpay');
const { notifyPaymentEvent } = require('../utils/notify');
const { generateInvoicePdf } = require('../utils/invoicePdf');
const { applyTransition } = require('../utils/caseWorkflow');

// When a client payment is confirmed, advance the case past the matching gate
// (only if it's sitting at the corresponding *_INVOICE_SENT status).
const PAYMENT_ADVANCE = {
  prior_art_search: { from: 'PRIOR_ART_INVOICE_SENT', to: 'PRIOR_ART_PAYMENT_RECEIVED' },
  prototype: { from: 'PROTOTYPE_INVOICE_SENT', to: 'PROTOTYPE_PAYMENT_RECEIVED' },
  drafting: { from: 'DRAFTING_INVOICE_SENT', to: 'DRAFTING_PAYMENT_RECEIVED' },
  filing_govt: { from: 'FILING_INVOICE_SENT', to: 'FILING_PAYMENT_RECEIVED' },
  filing_professional: { from: 'FILING_INVOICE_SENT', to: 'FILING_PAYMENT_RECEIVED' },
  renewal_govt: { from: 'RENEWAL_INVOICE_SENT', to: 'RENEWAL_PAYMENT_RECEIVED' },
  renewal_management: { from: 'RENEWAL_INVOICE_SENT', to: 'RENEWAL_PAYMENT_RECEIVED' }
};

const autoAdvanceOnPayment = async (payment, userId) => {
  try {
    const map = PAYMENT_ADVANCE[payment.type];
    if (!map) return;
    const caseDoc = await Case.findById(payment.caseId);
    if (!caseDoc || caseDoc.isClosed || caseDoc.status !== map.from) return;
    await applyTransition(caseDoc, map.to, {
      userId,
      note: `Auto-advanced on confirmed ${payment.milestoneLabel || payment.type} payment`
    });
    logger.info(`Case ${caseDoc.caseNumber} auto-advanced ${map.from} -> ${map.to} on payment`);
  } catch (err) {
    logger.error('Auto-advance on payment failed', { error: err.message });
  }
};

const INVOICE_PREFIX = process.env.INVOICE_PREFIX || 'INV';

/** Compute GST + total from a base amount and gst percent. */
const computeTotals = (amount, gstPercent) => {
  const pct = gstPercent ?? 18;
  const gstAmount = Math.round(amount * (pct / 100) * 100) / 100;
  const totalAmount = Math.round((amount + gstAmount) * 100) / 100;
  return { gstPercent: pct, gstAmount, totalAmount };
};

/** Generate the next invoice number for the year, e.g. INV-2026-0001. */
const generateInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `${INVOICE_PREFIX}-${year}-`;
  const last = await Payment.findOne({ invoiceNumber: new RegExp(`^${prefix}`) })
    .sort({ invoiceNumber: -1 })
    .select('invoiceNumber')
    .lean();
  let seq = 1;
  if (last?.invoiceNumber) {
    const n = parseInt(last.invoiceNumber.slice(prefix.length), 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

/**
 * GET /api/v1/payments — admin list all payments with optional filters
 * Query: page, limit, status, caseId, clientId
 */
const listPayments = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.caseId) filter.caseId = req.query.caseId;
    if (req.query.clientId) filter.clientId = req.query.clientId;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('caseId', 'caseNumber')
        .populate('clientId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      message: 'Payments fetched',
      data: {
        payments,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/payments/case/:caseId
 */
const listByCase = async (req, res, next) => {
  try {
    const payments = await Payment.find({ caseId: req.params.caseId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, message: 'Payments fetched', data: payments });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/payments
 * Body: { caseId, type, milestoneLabel, amount, currency?, gstPercent?, dueDate?, isPlanPayment?, planInstalment? }
 */
const createPayment = async (req, res, next) => {
  try {
    const { caseId, type, milestoneLabel, amount, currency, gstPercent, dueDate, isPlanPayment, planInstalment } =
      req.body;

    const caseDoc = await Case.findById(caseId).select('_id clientId');
    if (!caseDoc) return next(new AppError('Case not found', 404));
    if (!caseDoc.clientId) return next(new AppError('Case has no client', 400));

    const totals = computeTotals(Number(amount), gstPercent);

    const payment = await Payment.create({
      caseId,
      clientId: caseDoc.clientId,
      type,
      milestoneLabel,
      amount: Number(amount),
      currency: currency || 'INR',
      ...totals,
      status: 'pending',
      isPlanPayment: Boolean(isPlanPayment),
      planInstalment: planInstalment || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined
    });

    logger.info(`Payment milestone created for case ${caseId} by ${req.user?.name || 'unknown'}`);
    res.status(201).json({ success: true, message: 'Payment milestone created', data: payment });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/payments/:id/send
 * Generate an invoice number and mark the invoice as sent.
 * Body: { dueDate? }
 */
const sendInvoice = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return next(new AppError('Payment not found', 404));
    if (payment.status === 'paid') return next(new AppError('Payment already paid', 400));

    if (!payment.invoiceNumber) {
      payment.invoiceNumber = await generateInvoiceNumber();
    }
    payment.status = 'invoice_sent';
    payment.invoicedAt = new Date();
    if (req.body.dueDate) payment.dueDate = new Date(req.body.dueDate);

    // Generate the GST invoice PDF (best-effort).
    try {
      const [client, caseDoc] = await Promise.all([
        Client.findById(payment.clientId).lean(),
        Case.findById(payment.caseId).select('caseNumber').lean()
      ]);
      payment.invoiceUrl = await generateInvoicePdf(payment, client, caseDoc);
    } catch (pdfErr) {
      logger.error('Invoice PDF generation skipped', { error: pdfErr.message });
    }

    await payment.save();

    notifyPaymentEvent(payment, 'invoice').catch(() => {});
    logger.info(`Invoice ${payment.invoiceNumber} sent for payment ${payment._id}`);
    res.status(200).json({ success: true, message: 'Invoice sent', data: payment });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/payments/:id/razorpay
 * Create a Razorpay order for online payment (used by the client portal).
 */
const createRazorpayOrder = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return next(new AppError('Payment not found', 404));
    if (payment.status === 'paid') return next(new AppError('Payment already paid', 400));

    const order = await razorpay.createOrder(payment);
    payment.razorpayOrderId = order.id;
    if (payment.status === 'pending') payment.status = 'invoice_sent';
    await payment.save();

    res.status(200).json({
      success: true,
      message: 'Razorpay order created',
      data: { order, keyId: razorpay.KEY_ID, paymentId: payment._id }
    });
  } catch (error) {
    if (error.statusCode) return next(new AppError(error.message, error.statusCode));
    next(error);
  }
};

/**
 * POST /api/v1/payments/webhook  (PUBLIC — no JWT)
 * Razorpay webhook. Verifies the signature and marks the matching payment paid.
 */
const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    // Use the exact received bytes (stashed by body-parser) for HMAC; fall back
    // to a re-serialised body only if the raw buffer is unavailable.
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

    if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Razorpay webhook signature verification failed');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body?.event;
    const entity = req.body?.payload?.payment?.entity;

    if ((event === 'payment.captured' || event === 'order.paid') && entity) {
      const orderId = entity.order_id;
      const payment = await Payment.findOne({ razorpayOrderId: orderId });
      if (payment && payment.status !== 'paid') {
        payment.status = 'paid';
        payment.paidAt = new Date();
        payment.razorpayPaymentId = entity.id;
        await payment.save();
        notifyPaymentEvent(payment, 'received').catch(() => {});
        await autoAdvanceOnPayment(payment);
        logger.info(`Payment ${payment._id} marked paid via Razorpay webhook`);
      }
    }

    // Always 200 so Razorpay stops retrying once received.
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Razorpay webhook error', { error: error.message });
    res.status(200).json({ success: true }); // avoid retries storm; logged for follow-up
  }
};

/**
 * PATCH /api/v1/payments/:id/confirm
 * Manual confirmation by accounts (e.g. bank transfer / cash).
 * Body: { reference? }
 */
const confirmPayment = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return next(new AppError('Payment not found', 404));
    if (payment.status === 'paid') return next(new AppError('Payment already paid', 400));
    if (payment.status === 'waived') return next(new AppError('Payment was waived', 400));

    payment.status = 'paid';
    payment.paidAt = new Date();
    if (req.body.reference) payment.razorpayPaymentId = req.body.reference; // manual ref reuse
    await payment.save();

    notifyPaymentEvent(payment, 'received').catch(() => {});
    await autoAdvanceOnPayment(payment, req.user._id);
    logger.info(`Payment ${payment._id} manually confirmed by ${req.user?.name || 'unknown'}`);
    res.status(200).json({ success: true, message: 'Payment confirmed', data: payment });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/payments/:id/waive  (owner only — enforced via ACL on the frontend)
 * Body: { reason? }
 */
const waivePayment = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return next(new AppError('Payment not found', 404));
    if (payment.status === 'paid') return next(new AppError('Cannot waive a paid payment', 400));

    payment.status = 'waived';
    await payment.save();

    logger.info(`Payment ${payment._id} waived by ${req.user?.name || 'unknown'}`);
    res.status(200).json({ success: true, message: 'Payment waived', data: payment });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/payments/overdue
 */
const listOverdue = async (req, res, next) => {
  try {
    const payments = await Payment.find({
      status: { $in: ['invoice_sent', 'overdue'] },
      dueDate: { $lt: new Date() }
    })
      .sort({ dueDate: 1 })
      .populate('caseId', 'caseNumber')
      .populate('clientId', 'name email');
    res.status(200).json({ success: true, message: 'Overdue payments fetched', data: payments });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/payments/plan
 * Create a custom payment plan — multiple instalment milestones at once.
 * Body: { caseId, type, milestoneLabel?, currency?, gstPercent?, instalments: [{ amount, dueDate?, label? }] }
 */
const createPlan = async (req, res, next) => {
  try {
    const { caseId, type, milestoneLabel, currency, gstPercent, instalments } = req.body;
    if (!Array.isArray(instalments) || instalments.length === 0) {
      return next(new AppError('instalments array is required', 400));
    }
    const caseDoc = await Case.findById(caseId).select('clientId');
    if (!caseDoc) return next(new AppError('Case not found', 404));

    const docs = instalments.map((inst, i) => {
      const totals = computeTotals(Number(inst.amount), gstPercent);
      return {
        caseId,
        clientId: caseDoc.clientId,
        type,
        milestoneLabel: inst.label || `${milestoneLabel || 'Instalment'} ${i + 1}/${instalments.length}`,
        amount: Number(inst.amount),
        currency: currency || 'INR',
        ...totals,
        status: 'pending',
        isPlanPayment: true,
        planInstalment: i + 1,
        dueDate: inst.dueDate ? new Date(inst.dueDate) : undefined
      };
    });

    const created = await Payment.insertMany(docs);
    logger.info(`Payment plan (${created.length} instalments) created for case ${caseId}`);
    res.status(201).json({ success: true, message: 'Payment plan created', data: created });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listPayments,
  listByCase,
  createPayment,
  createPlan,
  sendInvoice,
  createRazorpayOrder,
  razorpayWebhook,
  confirmPayment,
  waivePayment,
  listOverdue
};
