/**
 * Client portal controller. Every endpoint is scoped to the logged-in client
 * via Client.userId === req.user._id, and re-checks case ownership. Clients only
 * ever see client-safe fields and friendly status labels — never internal CRM
 * status strings, assignments, margins, or internal notes.
 */
const Client = require('../models/Client');
const Case = require('../models/Case');
const Payment = require('../models/Payment');
const Document = require('../models/Document');
const Notification = require('../models/Notification');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const razorpay = require('../utils/razorpay');
const { CLIENT_LABELS, getDisplayLabel, getPhaseForStatus } = require('../utils/crmStateMachine');

const friendly = (status) => CLIENT_LABELS[status] || getDisplayLabel(status);

/** Resolve the Client record for the authenticated portal user. */
const getClient = async (req) => {
  const client = await Client.findOne({ userId: req.user._id });
  return client;
};

/** Fetch a case only if it belongs to this client. */
const getOwnedCase = async (clientId, caseId) =>
  Case.findOne({ _id: caseId, clientId });

const caseSummary = (c) => ({
  _id: c._id,
  caseNumber: c.caseNumber,
  track: c.track,
  phase: c.phase,
  status: c.status,
  statusLabel: friendly(c.status),
  inventionTitle: c.inventionTitle,
  updatedAt: c.updatedAt
});

/**
 * GET /api/v1/portal/me
 * Client profile + their cases (summaries).
 */
const getMe = async (req, res, next) => {
  try {
    const client = await getClient(req);
    if (!client) return next(new AppError('No client profile linked to this account', 403));
    const cases = await Case.find({ clientId: client._id }).sort({ updatedAt: -1 });
    res.status(200).json({
      success: true,
      message: 'Portal profile',
      data: {
        client: { _id: client._id, name: client.name, email: client.email, phone: client.phone },
        cases: cases.map(caseSummary)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/portal/cases/:id
 */
const getCase = async (req, res, next) => {
  try {
    const client = await getClient(req);
    if (!client) return next(new AppError('No client profile linked to this account', 403));
    const c = await getOwnedCase(client._id, req.params.id);
    if (!c) return next(new AppError('Case not found', 404));

    res.status(200).json({
      success: true,
      message: 'Case',
      data: {
        _id: c._id,
        caseNumber: c.caseNumber,
        track: c.track,
        phase: c.phase,
        status: c.status,
        statusLabel: friendly(c.status),
        inventionTitle: c.inventionTitle,
        inventionDomain: c.inventionDomain,
        jurisdiction: c.jurisdiction,
        applicationNumber: c.applicationNumber,
        filingDate: c.filingDate,
        priorityDate: c.priorityDate,
        grantDate: c.grantDate,
        patentNumber: c.patentNumber,
        isOnHold: c.isOnHold,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/portal/cases/:id/timeline
 * Client-friendly status history (labels, no internal notes).
 */
const getTimeline = async (req, res, next) => {
  try {
    const client = await getClient(req);
    if (!client) return next(new AppError('No client profile linked to this account', 403));
    const c = await getOwnedCase(client._id, req.params.id);
    if (!c) return next(new AppError('Case not found', 404));

    const history = (c.statusHistory || []).map((h) => ({
      status: h.status,
      label: friendly(h.status),
      phase: getPhaseForStatus(h.status),
      changedAt: h.changedAt
    }));
    res.status(200).json({ success: true, message: 'Timeline', data: history });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/portal/cases/:id/documents
 * Only client-visible documents.
 */
const getDocuments = async (req, res, next) => {
  try {
    const client = await getClient(req);
    if (!client) return next(new AppError('No client profile linked to this account', 403));
    const c = await getOwnedCase(client._id, req.params.id);
    if (!c) return next(new AppError('Case not found', 404));

    const docs = await Document.find({ caseId: c._id, isVisibleToClient: true })
      .sort({ uploadedAt: -1 })
      .select('name type url s3Url uploadedAt fileSize mimeType');
    res.status(200).json({
      success: true,
      message: 'Documents',
      data: docs.map((d) => ({
        _id: d._id,
        name: d.name,
        type: d.type,
        url: d.url || d.s3Url || null,
        uploadedAt: d.uploadedAt
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/portal/cases/:id/payments
 */
const getPayments = async (req, res, next) => {
  try {
    const client = await getClient(req);
    if (!client) return next(new AppError('No client profile linked to this account', 403));
    const c = await getOwnedCase(client._id, req.params.id);
    if (!c) return next(new AppError('Case not found', 404));

    const payments = await Payment.find({ caseId: c._id }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      message: 'Payments',
      data: payments.map((p) => ({
        _id: p._id,
        milestoneLabel: p.milestoneLabel,
        type: p.type,
        amount: p.amount,
        gstPercent: p.gstPercent,
        gstAmount: p.gstAmount,
        totalAmount: p.totalAmount,
        currency: p.currency,
        status: p.status,
        invoiceNumber: p.invoiceNumber,
        invoiceUrl: p.invoiceUrl || null,
        dueDate: p.dueDate,
        paidAt: p.paidAt
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/portal/payments/:id/pay
 * Create a Razorpay order for one of the client's own payments.
 */
const payInvoice = async (req, res, next) => {
  try {
    const client = await getClient(req);
    if (!client) return next(new AppError('No client profile linked to this account', 403));

    const payment = await Payment.findById(req.params.id);
    if (!payment || payment.clientId.toString() !== client._id.toString()) {
      return next(new AppError('Payment not found', 404));
    }
    if (payment.status === 'paid') return next(new AppError('This invoice is already paid', 400));

    const order = await razorpay.createOrder(payment);
    payment.razorpayOrderId = order.id;
    if (payment.status === 'pending') payment.status = 'invoice_sent';
    await payment.save();

    res.status(200).json({
      success: true,
      message: 'Order created',
      data: { order, keyId: razorpay.KEY_ID, paymentId: payment._id }
    });
  } catch (error) {
    if (error.statusCode) return next(new AppError(error.message, error.statusCode));
    next(error);
  }
};

/**
 * POST /api/v1/portal/cases/:id/feedback
 * Body: { message } — stored as an internal notification for staff.
 */
const submitFeedback = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return next(new AppError('Message is required', 400));

    const client = await getClient(req);
    if (!client) return next(new AppError('No client profile linked to this account', 403));
    const c = await getOwnedCase(client._id, req.params.id);
    if (!c) return next(new AppError('Case not found', 404));

    await Notification.create({
      caseId: c._id,
      recipientType: 'internal',
      channel: 'in_app',
      trigger: 'client_feedback',
      subject: `Client feedback on ${c.caseNumber}`,
      body: `${client.name}: ${message.trim()}`,
      status: 'sent',
      sentAt: new Date()
    });

    logger.info(`Client feedback submitted on case ${c.caseNumber}`);
    res.status(201).json({ success: true, message: 'Feedback submitted' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMe,
  getCase,
  getTimeline,
  getDocuments,
  getPayments,
  payInvoice,
  submitFeedback
};
