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
const Quote = require('../models/Quote');
const fs = require('fs');
const path = require('path');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const razorpay = require('../utils/razorpay');
const { CLIENT_LABELS, getDisplayLabel, getPhaseForStatus } = require('../utils/crmStateMachine');
const { applyTransition } = require('../utils/caseWorkflow');

const friendly = (status) => CLIENT_LABELS[status] || getDisplayLabel(status);

/**
 * Client-performable actions that advance the case. Each is only offered when
 * the case is at `from`. `button` is the portal CTA; `label` is the past-tense
 * phrase recorded in history; `note: true` collects an optional message.
 */
const CLIENT_ACTIONS = {
  sign_nda: { from: 'NDA_SENT', to: 'NDA_SIGNED', button: 'Sign & accept NDA', label: 'signed the NDA' },
  submit_disclosure: { from: 'DISCLOSURE_SENT', to: 'DISCLOSURE_RECEIVED', button: 'Submit disclosure', label: 'submitted the invention disclosure', note: true },
  respond_clarification: { from: 'CLARIFICATION_REQUESTED', to: 'CLARIFICATION_RECEIVED', button: 'Send response', label: 'responded to clarifications', note: true },
  approve_quote: { from: 'QUOTE_SENT', to: 'CLIENT_APPROVED_QUOTE', button: 'Approve quote', label: 'approved the quotation' },
  reject_quote: { from: 'QUOTE_SENT', to: 'QUOTE_REJECTED', button: 'Decline quote', label: 'declined the quotation', note: true, danger: true },
  prototype_signoff: { from: 'PROTOTYPE_DELIVERED', to: 'PROTOTYPE_CLIENT_SIGNOFF', button: 'Approve prototype', label: 'signed off on the prototype' },
  approve_draft: { from: 'DRAFT_SENT_TO_CLIENT', to: 'DRAFT_APPROVED_BY_CLIENT', button: 'Approve draft', label: 'approved the patent draft' },
  request_draft_changes: { from: 'DRAFT_SENT_TO_CLIENT', to: 'CLIENT_FEEDBACK_RECEIVED', button: 'Request changes', label: 'requested changes to the draft', note: true }
};

/** Actions available to the client for a given status. */
const availableActions = (status) =>
  Object.entries(CLIENT_ACTIONS)
    .filter(([, a]) => a.from === status)
    .map(([key, a]) => ({ action: key, button: a.button, note: !!a.note, danger: !!a.danger }));

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
  actionNeeded: availableActions(c.status).length > 0,
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
        availableActions: availableActions(c.status),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/portal/cases/:id/action
 * Client performs a workflow step (sign NDA, approve quote/draft, etc.) that
 * advances the case. Body: { action, note? }.
 */
const caseAction = async (req, res, next) => {
  try {
    const { action, note } = req.body;
    const def = CLIENT_ACTIONS[action];
    if (!def) return next(new AppError('Unknown action', 400));

    const client = await getClient(req);
    if (!client) return next(new AppError('No client profile linked to this account', 403));
    const c = await getOwnedCase(client._id, req.params.id);
    if (!c) return next(new AppError('Case not found', 404));

    if (c.status !== def.from) {
      return next(new AppError("This action isn't available for the case right now", 409));
    }

    const trimmedNote = def.note && note ? String(note).trim().slice(0, 1000) : '';
    const result = await applyTransition(c, def.to, {
      userId: client.userId,
      note: `Client ${def.label}${trimmedNote ? ` — ${trimmedNote}` : ''}`
    });
    if (!result.ok) return next(new AppError(result.error, 409));

    // Stamp the quote's client decision when this action is about the quote.
    if (action === 'approve_quote' || action === 'reject_quote') {
      await Quote.findOneAndUpdate(
        { caseId: c._id },
        {
          status: action === 'approve_quote' ? 'accepted' : 'rejected',
          clientDecisionAt: new Date(),
          clientDecisionNote: trimmedNote || undefined
        }
      ).catch(() => {});
    }

    // Alert staff in-app that the client acted.
    await Notification.create({
      caseId: c._id,
      recipientType: 'internal',
      channel: 'in_app',
      trigger: 'client_action',
      subject: `Client ${def.label} — ${c.caseNumber}`,
      body: `${client.name} ${def.label}${trimmedNote ? `: ${trimmedNote}` : ''}`,
      status: 'sent',
      sentAt: new Date()
    }).catch(() => {});

    logger.info(`Portal action "${action}" on ${c.caseNumber} by ${client.name}`);
    res.status(200).json({
      success: true,
      message: 'Done',
      data: {
        _id: c._id,
        status: c.status,
        statusLabel: friendly(c.status),
        phase: c.phase,
        availableActions: availableActions(c.status)
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
 * GET /api/v1/portal/cases/:id/documents/:docId/download
 * Streams a client-visible document the client owns (auth + ownership checked).
 */
const downloadDocument = async (req, res, next) => {
  try {
    const client = await getClient(req);
    if (!client) return next(new AppError('No client profile linked to this account', 403));
    const c = await getOwnedCase(client._id, req.params.id);
    if (!c) return next(new AppError('Case not found', 404));

    const doc = await Document.findOne({ _id: req.params.docId, caseId: c._id, isVisibleToClient: true });
    if (!doc) return next(new AppError('Document not found', 404));

    if (doc.s3Url && !doc.storagePath && !doc.url) {
      return res.status(200).json({ success: true, data: { url: doc.s3Url } });
    }
    const filePath = doc.storagePath || (doc.url ? path.join(__dirname, '..', doc.url) : null);
    if (!filePath || !fs.existsSync(filePath)) return next(new AppError('File not found on server', 404));
    return res.download(filePath, doc.name);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/portal/cases/:id/quote
 * The quotation, client-safe, only once it has been sent (or decided).
 */
const getQuote = async (req, res, next) => {
  try {
    const client = await getClient(req);
    if (!client) return next(new AppError('No client profile linked to this account', 403));
    const c = await getOwnedCase(client._id, req.params.id);
    if (!c) return next(new AppError('Case not found', 404));

    const quote = await Quote.findOne({ caseId: c._id });
    if (!quote || !['sent', 'accepted', 'rejected'].includes(quote.status)) {
      return res.status(200).json({ success: true, message: 'Quote', data: null });
    }
    res.status(200).json({
      success: true,
      message: 'Quote',
      data: {
        title: quote.title,
        lineItems: quote.lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          amount: li.amount
        })),
        currency: quote.currency,
        subtotal: quote.subtotal,
        gstPercent: quote.gstPercent,
        gstAmount: quote.gstAmount,
        total: quote.total,
        notes: quote.notes,
        validUntil: quote.validUntil,
        status: quote.status,
        sentAt: quote.sentAt
      }
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
  caseAction,
  getTimeline,
  getDocuments,
  downloadDocument,
  getQuote,
  getPayments,
  payInvoice,
  submitFeedback
};
