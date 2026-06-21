const Payment = require('../models/Payment');
const VendorEngagement = require('../models/VendorEngagement');
const Vendor = require('../models/Vendor');
const Case = require('../models/Case');
const Deadline = require('../models/Deadline');

const round2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * GET /api/v1/reports/revenue
 * Paid revenue grouped by month (last 12 months) + all-time totals + outstanding.
 * Revenue is reported ex-GST (`amount`); GST is tracked separately.
 */
const revenue = async (req, res, next) => {
  try {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [monthly, totals, outstanding] = await Promise.all([
      Payment.aggregate([
        { $match: { status: 'paid', paidAt: { $gte: since } } },
        {
          $group: {
            _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } },
            net: { $sum: '$amount' },
            gst: { $sum: '$gstAmount' },
            total: { $sum: '$totalAmount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.y': 1, '_id.m': 1 } }
      ]),
      Payment.aggregate([
        { $match: { status: 'paid' } },
        {
          $group: {
            _id: null,
            net: { $sum: '$amount' },
            gst: { $sum: '$gstAmount' },
            total: { $sum: '$totalAmount' },
            count: { $sum: 1 }
          }
        }
      ]),
      Payment.aggregate([
        { $match: { status: { $in: ['invoice_sent', 'overdue'] } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ])
    ]);

    const months = monthly.map((m) => ({
      year: m._id.y,
      month: m._id.m,
      label: `${m._id.y}-${String(m._id.m).padStart(2, '0')}`,
      net: round2(m.net),
      gst: round2(m.gst),
      total: round2(m.total),
      count: m.count
    }));

    const t = totals[0] || { net: 0, gst: 0, total: 0, count: 0 };

    res.status(200).json({
      success: true,
      message: 'Revenue report',
      data: {
        months,
        totals: { net: round2(t.net), gst: round2(t.gst), total: round2(t.total), count: t.count },
        outstanding: {
          total: round2(outstanding[0]?.total || 0),
          count: outstanding[0]?.count || 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reports/cases
 * Case counts by status and by phase + overall totals.
 */
const cases = async (req, res, next) => {
  try {
    const [byStatus, byPhase, total, active, onHold] = await Promise.all([
      Case.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Case.aggregate([{ $group: { _id: '$phase', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Case.countDocuments(),
      Case.countDocuments({ isClosed: { $ne: true } }),
      Case.countDocuments({ isOnHold: true })
    ]);

    res.status(200).json({
      success: true,
      message: 'Cases report',
      data: {
        byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
        byPhase: byPhase.map((p) => ({ phase: p._id, count: p.count })),
        total,
        active,
        onHold
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reports/profit
 * Per-case profit = paid client revenue (ex-GST) − vendor cost (vendor quotes),
 * plus an aggregate. Sorted by profit desc.
 */
const profit = async (req, res, next) => {
  try {
    const [revenueByCase, costByCase, caseList] = await Promise.all([
      Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: '$caseId', revenue: { $sum: '$amount' }, collected: { $sum: '$totalAmount' } } }
      ]),
      VendorEngagement.aggregate([
        { $group: { _id: '$caseId', vendorCost: { $sum: '$vendorQuoteAmount' } } }
      ]),
      Case.find().select('caseNumber status inventionTitle').lean()
    ]);

    const revMap = new Map(revenueByCase.map((r) => [String(r._id), r]));
    const costMap = new Map(costByCase.map((c) => [String(c._id), c.vendorCost || 0]));

    const rows = caseList
      .map((c) => {
        const rev = revMap.get(String(c._id));
        const revenueVal = round2(rev?.revenue || 0);
        const vendorCost = round2(costMap.get(String(c._id)) || 0);
        return {
          caseId: c._id,
          caseNumber: c.caseNumber,
          inventionTitle: c.inventionTitle || '',
          status: c.status,
          revenue: revenueVal,
          collected: round2(rev?.collected || 0),
          vendorCost,
          profit: round2(revenueVal - vendorCost)
        };
      })
      // Only show cases with any financial activity.
      .filter((r) => r.revenue > 0 || r.vendorCost > 0)
      .sort((a, b) => b.profit - a.profit);

    const aggregate = rows.reduce(
      (acc, r) => {
        acc.revenue += r.revenue;
        acc.vendorCost += r.vendorCost;
        acc.profit += r.profit;
        return acc;
      },
      { revenue: 0, vendorCost: 0, profit: 0 }
    );

    res.status(200).json({
      success: true,
      message: 'Profit report',
      data: {
        cases: rows,
        aggregate: {
          revenue: round2(aggregate.revenue),
          vendorCost: round2(aggregate.vendorCost),
          profit: round2(aggregate.profit),
          caseCount: rows.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reports/vendors
 * Vendor spend summary — per vendor totals across all engagements.
 */
const vendors = async (req, res, next) => {
  try {
    const [agg, vendorDocs] = await Promise.all([
      VendorEngagement.aggregate([
        {
          $group: {
            _id: '$vendorId',
            engagements: { $sum: 1 },
            vendorCost: { $sum: '$vendorQuoteAmount' },
            clientCharged: { $sum: '$clientChargedAmount' },
            margin: { $sum: '$margin' },
            paid: {
              $sum: {
                $cond: [{ $eq: ['$vendorPaymentStatus', 'paid'] }, '$vendorQuoteAmount', 0]
              }
            }
          }
        },
        { $sort: { vendorCost: -1 } }
      ]),
      Vendor.find().select('name specialisation').lean()
    ]);

    const nameMap = new Map(vendorDocs.map((v) => [String(v._id), v]));

    const rows = agg.map((a) => ({
      vendorId: a._id,
      name: nameMap.get(String(a._id))?.name || 'Unknown vendor',
      specialisation: nameMap.get(String(a._id))?.specialisation || '',
      engagements: a.engagements,
      vendorCost: round2(a.vendorCost),
      clientCharged: round2(a.clientCharged),
      margin: round2(a.margin),
      paid: round2(a.paid),
      outstanding: round2((a.vendorCost || 0) - (a.paid || 0))
    }));

    const totals = rows.reduce(
      (acc, r) => {
        acc.vendorCost += r.vendorCost;
        acc.paid += r.paid;
        acc.outstanding += r.outstanding;
        acc.margin += r.margin;
        return acc;
      },
      { vendorCost: 0, paid: 0, outstanding: 0, margin: 0 }
    );

    res.status(200).json({
      success: true,
      message: 'Vendor spend report',
      data: {
        vendors: rows,
        totals: {
          vendorCost: round2(totals.vendorCost),
          paid: round2(totals.paid),
          outstanding: round2(totals.outstanding),
          margin: round2(totals.margin)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reports/renewals
 * Upcoming renewals in the next 90 days (from the Deadline engine) + count of
 * active patents. (Becomes richer once the deadline engine is generating data.)
 */
const renewals = async (req, res, next) => {
  try {
    const now = new Date();
    const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [upcoming, activePatents] = await Promise.all([
      Deadline.find({
        type: 'renewal',
        status: 'active',
        statutoryDeadline: { $gte: now, $lte: in90 }
      })
        .sort({ statutoryDeadline: 1 })
        .populate('caseId', 'caseNumber patentNumber status')
        .lean(),
      Case.countDocuments({ status: 'PATENT_ACTIVE' })
    ]);

    res.status(200).json({
      success: true,
      message: 'Renewals report',
      data: {
        upcoming: upcoming.map((d) => ({
          deadlineId: d._id,
          label: d.label,
          dueDate: d.statutoryDeadline,
          case: d.caseId
        })),
        activePatents
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { revenue, cases, profit, vendors, renewals };
