const Vendor = require('../models/Vendor');
const VendorEngagement = require('../models/VendorEngagement');
const Payment = require('../models/Payment');
const Case = require('../models/Case');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/* ----------------------------- Vendors ----------------------------- */

/**
 * GET /api/v1/vendors
 */
const listVendors = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.search) {
      const regex = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [{ name: regex }, { specialisation: regex }, { contactName: regex }];
    }
    const vendors = await Vendor.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, message: 'Vendors fetched', data: vendors });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/vendors
 */
const createVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.create(req.body);
    logger.info(`Vendor created: ${vendor._id} by ${req.user?.name || 'unknown'}`);
    res.status(201).json({ success: true, message: 'Vendor created', data: vendor });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/vendors/:id
 */
const getVendorById = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return next(new AppError('Vendor not found', 404));
    res.status(200).json({ success: true, message: 'Vendor fetched', data: vendor });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/vendors/:id
 */
const updateVendor = async (req, res, next) => {
  try {
    const updatable = ['name', 'type', 'contactName', 'email', 'phone', 'specialisation', 'isEmpanelled', 'rating', 'notes'];
    const update = {};
    updatable.forEach((k) => {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    });
    const vendor = await Vendor.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!vendor) return next(new AppError('Vendor not found', 404));
    res.status(200).json({ success: true, message: 'Vendor updated', data: vendor });
  } catch (error) {
    next(error);
  }
};

/* -------------------------- Engagements --------------------------- */

const ENGAGEMENT_POPULATE = [
  { path: 'vendorId', select: 'name type specialisation email phone' },
  { path: 'clientPaymentId', select: 'milestoneLabel type status totalAmount invoiceNumber' }
];

/**
 * POST /api/v1/vendors/engage
 * Engage a vendor for a case.
 * Body: { caseId, vendorId, type, vendorQuoteAmount?, clientChargedAmount?, briefingNotes?, expectedDelivery?, clientPaymentId? }
 */
const engageVendor = async (req, res, next) => {
  try {
    const {
      caseId, vendorId, type, vendorQuoteAmount, clientChargedAmount,
      briefingNotes, expectedDelivery, clientPaymentId
    } = req.body;

    const [caseDoc, vendor] = await Promise.all([
      Case.findById(caseId).select('_id'),
      Vendor.findById(vendorId).select('_id')
    ]);
    if (!caseDoc) return next(new AppError('Case not found', 404));
    if (!vendor) return next(new AppError('Vendor not found', 404));

    // If a client payment is linked, validate it belongs to this case.
    if (clientPaymentId) {
      const payment = await Payment.findById(clientPaymentId).select('caseId');
      if (!payment) return next(new AppError('Linked client payment not found', 404));
      if (payment.caseId.toString() !== caseId) {
        return next(new AppError('Linked payment does not belong to this case', 400));
      }
    }

    const vq = vendorQuoteAmount != null ? Number(vendorQuoteAmount) : undefined;
    const cc = clientChargedAmount != null ? Number(clientChargedAmount) : undefined;
    const margin = vq != null && cc != null ? cc - vq : undefined;

    const engagement = await VendorEngagement.create({
      caseId,
      vendorId,
      type,
      briefingNotes,
      expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : undefined,
      briefedAt: new Date(),
      status: 'briefed',
      vendorQuoteAmount: vq,
      clientChargedAmount: cc,
      margin,
      clientPaymentId: clientPaymentId || undefined
    });

    await engagement.populate(ENGAGEMENT_POPULATE);
    logger.info(`Vendor ${vendorId} engaged for case ${caseId} by ${req.user?.name || 'unknown'}`);
    res.status(201).json({ success: true, message: 'Vendor engaged', data: engagement });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/vendors/engagements/:caseId
 */
const listEngagementsByCase = async (req, res, next) => {
  try {
    const engagements = await VendorEngagement.find({ caseId: req.params.caseId })
      .sort({ createdAt: -1 })
      .populate(ENGAGEMENT_POPULATE);
    res.status(200).json({ success: true, message: 'Engagements fetched', data: engagements });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/vendors/engagements/:id/deliver
 * Body: { deliveryNotes? }
 */
const markDelivered = async (req, res, next) => {
  try {
    const engagement = await VendorEngagement.findById(req.params.id);
    if (!engagement) return next(new AppError('Engagement not found', 404));

    engagement.status = 'delivered';
    engagement.deliveredAt = new Date();
    if (req.body.deliveryNotes) engagement.deliveryNotes = req.body.deliveryNotes;
    await engagement.save();
    await engagement.populate(ENGAGEMENT_POPULATE);

    res.status(200).json({ success: true, message: 'Marked delivered', data: engagement });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/vendors/engagements/:id/approve
 * Client sign-off / PM approval of the delivery.
 */
const approveEngagement = async (req, res, next) => {
  try {
    const engagement = await VendorEngagement.findById(req.params.id);
    if (!engagement) return next(new AppError('Engagement not found', 404));
    if (engagement.status !== 'delivered') {
      return next(new AppError('Engagement must be delivered before approval', 400));
    }

    engagement.status = 'approved';
    engagement.clientSignoffAt = new Date();
    await engagement.save();
    await engagement.populate(ENGAGEMENT_POPULATE);

    res.status(200).json({ success: true, message: 'Engagement approved', data: engagement });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/vendors/engagements/:id/payment
 * Raise a vendor payment order. HARD GATE: the linked client payment must be
 * confirmed `paid` first (no vendor payout before client pays). Spec §9.
 */
const raiseVendorPayment = async (req, res, next) => {
  try {
    const engagement = await VendorEngagement.findById(req.params.id);
    if (!engagement) return next(new AppError('Engagement not found', 404));

    if (!engagement.clientPaymentId) {
      return next(
        new AppError('Link a client payment to this engagement before raising vendor payment', 400)
      );
    }

    const clientPayment = await Payment.findById(engagement.clientPaymentId).select('status');
    if (!clientPayment || clientPayment.status !== 'paid') {
      return next(
        new AppError('Cannot raise vendor payment — client payment not yet confirmed', 403)
      );
    }

    if (engagement.vendorPaymentStatus === 'paid') {
      return next(new AppError('Vendor already paid', 400));
    }

    engagement.vendorPaymentStatus = 'approved';
    engagement.vendorPaymentApprovedBy = req.user._id;
    engagement.vendorPaymentApprovedAt = new Date();
    await engagement.save();
    await engagement.populate(ENGAGEMENT_POPULATE);

    logger.info(`Vendor payment raised for engagement ${engagement._id} by ${req.user?.name || 'unknown'}`);
    res.status(200).json({ success: true, message: 'Vendor payment order raised', data: engagement });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/vendors/engagements/:id/paid
 * Body: { vendorPaymentRef? }
 */
const markVendorPaid = async (req, res, next) => {
  try {
    const engagement = await VendorEngagement.findById(req.params.id);
    if (!engagement) return next(new AppError('Engagement not found', 404));
    if (engagement.vendorPaymentStatus !== 'approved') {
      return next(new AppError('Raise the vendor payment order before marking it paid', 400));
    }

    engagement.vendorPaymentStatus = 'paid';
    engagement.vendorPaidAt = new Date();
    if (req.body.vendorPaymentRef) engagement.vendorPaymentRef = req.body.vendorPaymentRef;
    await engagement.save();
    await engagement.populate(ENGAGEMENT_POPULATE);

    res.status(200).json({ success: true, message: 'Vendor marked paid', data: engagement });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listVendors,
  createVendor,
  getVendorById,
  updateVendor,
  engageVendor,
  listEngagementsByCase,
  markDelivered,
  approveEngagement,
  raiseVendorPayment,
  markVendorPaid
};
