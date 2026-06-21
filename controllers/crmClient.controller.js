const crypto = require('crypto');
const Client = require('../models/Client');
const Case = require('../models/Case');
const User = require('../models/User');
const Role = require('../models/Role');
const UserRole = require('../models/UserRole');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const config = require('../utils/config');
const { sendMail } = require('../utils/mailer');

/**
 * GET /api/v1/crm-clients
 */
const listClients = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.search) {
      const regex = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const [items, total] = await Promise.all([
      Client.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Client.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      message: 'Clients fetched successfully',
      data: { items, page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/crm-clients
 */
const createClient = async (req, res, next) => {
  try {
    const { name, email, phone, whatsapp, address, gstNumber } = req.body;
    const client = await Client.create({ name, email, phone, whatsapp, address, gstNumber });
    logger.info(`CRM client created: ${client._id} by ${req.user?.name || 'unknown'}`);
    res.status(201).json({ success: true, message: 'Client created successfully', data: client });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/crm-clients/:id
 */
const getClientById = async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return next(new AppError('Client not found', 404));
    res.status(200).json({ success: true, message: 'Client fetched successfully', data: client });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/crm-clients/:id
 */
const updateClient = async (req, res, next) => {
  try {
    const updatable = ['name', 'email', 'phone', 'whatsapp', 'address', 'gstNumber'];
    const update = {};
    updatable.forEach((k) => {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    });
    const client = await Client.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });
    if (!client) return next(new AppError('Client not found', 404));
    res.status(200).json({ success: true, message: 'Client updated successfully', data: client });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/crm-clients/:id/cases
 */
const getClientCases = async (req, res, next) => {
  try {
    const cases = await Case.find({ clientId: req.params.id })
      .sort({ updatedAt: -1 })
      .populate('assignedPM', 'name email')
      .populate('assignedAttorney', 'name email');
    res.status(200).json({ success: true, message: 'Client cases fetched', data: cases });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/crm-clients/:id/portal-access
 * Provision a portal login for a client: ensure a User (role `client`) exists and
 * is linked to the Client, then email a set-password (reset) link. Idempotent.
 */
const grantPortalAccess = async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return next(new AppError('Client not found', 404));
    if (!client.email) return next(new AppError('Client has no email on record', 400));

    // Ensure the `client` role exists.
    let clientRole = await Role.findOne({ rolename: 'client' });
    if (!clientRole) clientRole = await Role.create({ rolename: 'client' });

    // Find or create the User.
    let user = await User.findOne({ email: client.email.toLowerCase() });
    let created = false;
    if (!user) {
      const tempPassword = crypto.randomBytes(16).toString('hex');
      try {
        user = await User.create({
          name: client.name,
          email: client.email,
          mobile: client.phone || `na-${Date.now()}`,
          password: tempPassword
        });
      } catch (err) {
        if (err.code === 11000) {
          // Mobile collision — retry with a unique placeholder.
          user = await User.create({
            name: client.name,
            email: client.email,
            mobile: `na-${Date.now()}`,
            password: tempPassword
          });
        } else {
          throw err;
        }
      }
      created = true;
    }

    // Link Client → User and assign the client role (both idempotent).
    if (!client.userId) {
      client.userId = user._id;
      await client.save();
    }
    await UserRole.updateOne(
      { userId: user._id, roleId: clientRole._id },
      { $setOnInsert: { userId: user._id, roleId: clientRole._id } },
      { upsert: true }
    );

    // Email a set-password link (reset token).
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h for first set
    await user.save({ validateBeforeSave: false });

    const link = `${config.adminPortal.url || ''}/reset-password?token=${rawToken}`;
    try {
      await sendMail({
        to: user.email,
        subject: 'Your Patent CRM portal access',
        html: `<p>Hi ${user.name || ''},</p><p>A portal account has been created for you. Set your password using the link below (valid 24 hours):</p><p><a href="${link}">${link}</a></p><p>Then log in to track your patent case, view documents, and pay invoices.</p>`,
        text: `Set your portal password: ${link}`
      });
    } catch (mailErr) {
      logger.error('Failed to send portal access email', { error: mailErr.message });
    }

    logger.info(`Portal access provisioned for client ${client._id} (user ${user._id})`);
    res.status(200).json({
      success: true,
      message: created ? 'Portal login created and invite emailed' : 'Portal access ensured and invite re-sent',
      data: { userId: user._id, email: user.email, created }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listClients,
  createClient,
  getClientById,
  updateClient,
  getClientCases,
  grantPortalAccess
};
