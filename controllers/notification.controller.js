const Notification = require('../models/Notification');
const { AppError } = require('../middleware/errorHandler');
const { dispatch } = require('../utils/notify');

/**
 * GET /api/v1/notifications/case/:caseId
 */
const listByCase = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ caseId: req.params.caseId })
      .sort({ createdAt: -1 })
      .limit(200);
    res.status(200).json({ success: true, message: 'Notifications fetched', data: notifications });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/notifications/user/:userId
 * Notifications addressed to a user (in-app inbox).
 */
const listForUser = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ recipientId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.status(200).json({ success: true, message: 'Notifications fetched', data: notifications });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/notifications/test
 * Sends a test email + in-app record to the current user. Owner/admin use only
 * (ACL gated on the frontend).
 * Body: { to? }
 */
const sendTest = async (req, res, next) => {
  try {
    const to = req.body.to || req.user.email;
    if (!to) return next(new AppError('No recipient email available', 400));
    const results = await dispatch({
      recipientId: req.user._id,
      recipientType: 'internal',
      to,
      channels: ['email', 'in_app'],
      trigger: 'test',
      subject: 'Patent CRM — test notification',
      body: 'This is a test notification from the Patent CRM dispatch layer.'
    });
    res.status(200).json({ success: true, message: 'Test notification dispatched', data: results });
  } catch (error) {
    next(error);
  }
};

module.exports = { listByCase, listForUser, sendTest };
