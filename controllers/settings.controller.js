const Settings = require('../models/Settings');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * GET /api/v1/settings
 * Fetch current settings (public or admin only)
 */
const getSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne().lean();
    if (!settings) {
      // Create default settings if none exist
      settings = await Settings.create({});
    }
    res.status(200).json({ success: true, message: 'Settings fetched', data: settings });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/settings
 * Update settings (admin only)
 */
const updateSettings = async (req, res, next) => {
  try {
    const {
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      companyWebsite,
      companyGST,
      companyLogo,
      bankName,
      accountHolder,
      accountNumber,
      ifscCode,
      upiId,
      enableRazorpay,
      paymentTerms,
      additionalTerms,
      primaryColor,
      secondaryColor,
      accentColor
    } = req.body;

    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }

    // Update fields if provided
    if (companyName !== undefined) settings.companyName = companyName;
    if (companyAddress !== undefined) settings.companyAddress = companyAddress;
    if (companyPhone !== undefined) settings.companyPhone = companyPhone;
    if (companyEmail !== undefined) settings.companyEmail = companyEmail;
    if (companyWebsite !== undefined) settings.companyWebsite = companyWebsite;
    if (companyGST !== undefined) settings.companyGST = companyGST;
    if (companyLogo !== undefined) settings.companyLogo = companyLogo;
    if (bankName !== undefined) settings.bankName = bankName;
    if (accountHolder !== undefined) settings.accountHolder = accountHolder;
    if (accountNumber !== undefined) settings.accountNumber = accountNumber;
    if (ifscCode !== undefined) settings.ifscCode = ifscCode;
    if (upiId !== undefined) settings.upiId = upiId;
    if (enableRazorpay !== undefined) settings.enableRazorpay = enableRazorpay;
    if (paymentTerms !== undefined) settings.paymentTerms = paymentTerms;
    if (additionalTerms !== undefined) settings.additionalTerms = additionalTerms;
    if (primaryColor !== undefined) settings.primaryColor = primaryColor;
    if (secondaryColor !== undefined) settings.secondaryColor = secondaryColor;
    if (accentColor !== undefined) settings.accentColor = accentColor;

    settings.updatedAt = new Date();
    await settings.save();

    logger.info(`Settings updated by ${req.user?.name || 'unknown'}`);
    res.status(200).json({ success: true, message: 'Settings updated', data: settings });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSettings, updateSettings };
