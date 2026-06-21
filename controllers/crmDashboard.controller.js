/**
 * Role-based CRM dashboards (spec §13). Returns only the sections relevant to
 * the logged-in user's roles. Attorney/PM sections are scoped to their own
 * assigned cases; owner/accounts sections are firm-wide.
 */
const Case = require('../models/Case');
const Payment = require('../models/Payment');
const VendorEngagement = require('../models/VendorEngagement');
const Deadline = require('../models/Deadline');
const { getUserRoleNames } = require('../utils/crmAccess');

// Roles that get the firm-wide "owner" dashboard section (excludes accounts,
// which has its own finance section even though it can view all cases).
const OWNER_DASHBOARD_ROLES = ['super admin', 'owner', 'admin', 'superuser', 'Higher Management'];

const DAY = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round((n || 0) * 100) / 100;

// Statuses where the ball is in the client's court.
const CLIENT_ACTION_STATUSES = [
  'NDA_SENT', 'DISCLOSURE_SENT', 'CLARIFICATION_REQUESTED', 'QUOTE_SENT',
  'DRAFT_SENT_TO_CLIENT', 'PROTOTYPE_CLIENT_SIGNOFF',
  'PRIOR_ART_INVOICE_SENT', 'PROTOTYPE_INVOICE_SENT', 'DRAFTING_INVOICE_SENT', 'FILING_INVOICE_SENT'
];

const CASE_FIELDS = 'caseNumber status phase inventionTitle updatedAt isOnHold';

const ownerSection = async (now) => {
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const in7 = new Date(now.getTime() + 7 * DAY);

  const [byPhase, revThis, revLast, paidAll, vendorCostAll, upcoming, onHold, overdue] = await Promise.all([
    Case.aggregate([
      { $match: { isClosed: { $ne: true } } },
      { $group: { _id: '$phase', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),
    Payment.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: startThisMonth } } },
      { $group: { _id: null, net: { $sum: '$amount' } } }
    ]),
    Payment.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: startLastMonth, $lt: startThisMonth } } },
      { $group: { _id: null, net: { $sum: '$amount' } } }
    ]),
    Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, net: { $sum: '$amount' } } }]),
    VendorEngagement.aggregate([{ $group: { _id: null, cost: { $sum: '$vendorQuoteAmount' } } }]),
    Deadline.find({ status: 'active', statutoryDeadline: { $gte: now, $lte: in7 } })
      .sort({ statutoryDeadline: 1 })
      .populate('caseId', 'caseNumber')
      .limit(20)
      .lean(),
    Case.find({ isOnHold: true }).select(CASE_FIELDS).limit(20).lean(),
    Payment.aggregate([
      { $match: { status: { $in: ['invoice_sent', 'overdue'] }, dueDate: { $lt: now } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
    ])
  ]);

  const netProfit = round2((paidAll[0]?.net || 0) - (vendorCostAll[0]?.cost || 0));

  return {
    activeCasesByPhase: byPhase.map((p) => ({ phase: p._id, count: p.count })),
    revenueThisMonth: round2(revThis[0]?.net || 0),
    revenueLastMonth: round2(revLast[0]?.net || 0),
    netProfit,
    upcomingDeadlines: upcoming.map((d) => ({
      _id: d._id, label: d.label, dueDate: d.statutoryDeadline, caseNumber: d.caseId?.caseNumber
    })),
    casesOnHold: onHold,
    overduePayments: { total: round2(overdue[0]?.total || 0), count: overdue[0]?.count || 0 }
  };
};

const attorneySection = async (userId, now) => {
  const in14 = new Date(now.getTime() + 14 * DAY);
  const in90 = new Date(now.getTime() + 90 * DAY);

  const [myCases, deadlines14, rfe90] = await Promise.all([
    Case.find({ assignedAttorney: userId, isClosed: { $ne: true } })
      .select(CASE_FIELDS)
      .sort({ updatedAt: -1 })
      .lean(),
    Deadline.find({ status: 'active', ownerId: userId, statutoryDeadline: { $gte: now, $lte: in14 } })
      .sort({ statutoryDeadline: 1 })
      .populate('caseId', 'caseNumber')
      .lean(),
    Deadline.find({ status: 'active', ownerId: userId, type: 'rfe_filing', statutoryDeadline: { $gte: now, $lte: in90 } })
      .sort({ statutoryDeadline: 1 })
      .populate('caseId', 'caseNumber')
      .lean()
  ]);

  return {
    myCases,
    deadlinesDue14d: deadlines14.map((d) => ({ _id: d._id, label: d.label, dueDate: d.statutoryDeadline, caseNumber: d.caseId?.caseNumber })),
    draftsPendingReview: myCases.filter((c) => c.status === 'DRAFT_SENT_TO_CLIENT'),
    fersReceived: myCases.filter((c) => c.status === 'FER_RECEIVED'),
    rfeDue90d: rfe90.map((d) => ({ _id: d._id, label: d.label, dueDate: d.statutoryDeadline, caseNumber: d.caseId?.caseNumber }))
  };
};

const pmSection = async (userId, now) => {
  const in7 = new Date(now.getTime() + 7 * DAY);
  const myCases = await Case.find({ assignedPM: userId, isClosed: { $ne: true } })
    .select(CASE_FIELDS)
    .sort({ updatedAt: -1 })
    .lean();
  const caseIds = myCases.map((c) => c._id);

  const [vendorInProgress, prototypeThisWeek, overdue] = await Promise.all([
    VendorEngagement.find({ caseId: { $in: caseIds }, status: { $in: ['briefed', 'in_progress'] } })
      .populate('vendorId', 'name')
      .populate('caseId', 'caseNumber')
      .lean(),
    VendorEngagement.find({
      caseId: { $in: caseIds },
      type: 'prototype',
      status: { $in: ['briefed', 'in_progress'] },
      expectedDelivery: { $gte: now, $lte: in7 }
    })
      .populate('vendorId', 'name')
      .populate('caseId', 'caseNumber')
      .lean(),
    Payment.find({ caseId: { $in: caseIds }, status: { $in: ['invoice_sent', 'overdue'] }, dueDate: { $lt: now } })
      .populate('caseId', 'caseNumber')
      .lean()
  ]);

  return {
    myCases,
    vendorEngagementsInProgress: vendorInProgress.map((e) => ({
      _id: e._id, vendor: e.vendorId?.name, caseNumber: e.caseId?.caseNumber, type: e.type, status: e.status, expectedDelivery: e.expectedDelivery
    })),
    prototypeDeliveriesThisWeek: prototypeThisWeek.map((e) => ({
      _id: e._id, vendor: e.vendorId?.name, caseNumber: e.caseId?.caseNumber, expectedDelivery: e.expectedDelivery
    })),
    casesAwaitingClientAction: myCases.filter((c) => CLIENT_ACTION_STATUSES.includes(c.status)),
    overduePayments: overdue.map((p) => ({
      _id: p._id, caseNumber: p.caseId?.caseNumber, milestoneLabel: p.milestoneLabel, totalAmount: p.totalAmount, dueDate: p.dueDate
    }))
  };
};

const accountsSection = async (now) => {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start7 = new Date(now.getTime() - 7 * DAY);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [pendingNotSent, recToday, rec7, recMonth, gstMonth, overdue, vendorAwaiting] = await Promise.all([
    Payment.find({ status: 'pending' }).populate('caseId', 'caseNumber').sort({ createdAt: -1 }).limit(50).lean(),
    Payment.aggregate([{ $match: { status: 'paid', paidAt: { $gte: startToday } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: 'paid', paidAt: { $gte: start7 } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: 'paid', paidAt: { $gte: startMonth } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: 'paid', paidAt: { $gte: startMonth } } }, { $group: { _id: null, gst: { $sum: '$gstAmount' } } }]),
    Payment.find({ status: { $in: ['invoice_sent', 'overdue'] }, dueDate: { $lt: now } }).populate('caseId', 'caseNumber').sort({ dueDate: 1 }).lean(),
    VendorEngagement.find({ vendorPaymentStatus: 'approved' }).populate('vendorId', 'name').populate('caseId', 'caseNumber').lean()
  ]);

  return {
    pendingInvoicesNotSent: pendingNotSent.map((p) => ({
      _id: p._id, caseNumber: p.caseId?.caseNumber, milestoneLabel: p.milestoneLabel, totalAmount: p.totalAmount
    })),
    received: {
      today: round2(recToday[0]?.total || 0),
      week: round2(rec7[0]?.total || 0),
      month: round2(recMonth[0]?.total || 0)
    },
    gstThisMonth: round2(gstMonth[0]?.gst || 0),
    overduePayments: overdue.map((p) => ({
      _id: p._id, caseNumber: p.caseId?.caseNumber, milestoneLabel: p.milestoneLabel, totalAmount: p.totalAmount, dueDate: p.dueDate
    })),
    vendorPaymentOrdersAwaiting: vendorAwaiting.map((e) => ({
      _id: e._id, vendor: e.vendorId?.name, caseNumber: e.caseId?.caseNumber, amount: e.vendorQuoteAmount
    }))
  };
};

const getDashboard = async (req, res, next) => {
  try {
    const now = new Date();
    const roleNames = await getUserRoleNames(req.user._id);
    const isOwner = roleNames.some((r) => OWNER_DASHBOARD_ROLES.includes(r));
    const isAttorney = roleNames.includes('attorney');
    const isPM = roleNames.includes('pm');
    const isAccounts = roleNames.includes('accounts');

    const data = { roles: roleNames };
    const tasks = [];
    if (isOwner) tasks.push(ownerSection(now).then((d) => { data.owner = d; }));
    if (isAttorney) tasks.push(attorneySection(req.user._id, now).then((d) => { data.attorney = d; }));
    if (isPM) tasks.push(pmSection(req.user._id, now).then((d) => { data.pm = d; }));
    if (isAccounts) tasks.push(accountsSection(now).then((d) => { data.accounts = d; }));
    await Promise.all(tasks);

    res.status(200).json({ success: true, message: 'Dashboard', data });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboard };
