const mongoose = require('mongoose');
const Partner = require('../models/Partner');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const slugify = (value) => {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/dr\.\s*/g, 'dr-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
};

const ensureUniqueSlug = async (candidate, excludeId = null) => {
  let uniqueSlug = candidate || `${Date.now()}`;
  let suffix = 1;

  const slugFilter = (slug) => {
    const query = { slug };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: excludeId };
    }
    return query;
  };

  while (true) {
    const existing = await Partner.findOne(slugFilter(uniqueSlug)).select('_id').lean();
    if (!existing) break;
    uniqueSlug = `${candidate}-${suffix}`;
    suffix += 1;
  }

  return uniqueSlug;
};

const normalizeList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v.trim() : String(v))).filter(Boolean);
  return value.split(',').map((v) => v.trim()).filter(Boolean);
};

const normalizeExpertise = (expertise) => normalizeList(expertise).slice(0, 50);

const publicListPartners = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);

    const filter = { status: 'Active' };

    const items = await Partner.find(filter)
      .sort({ order: 1, name: 1 })
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      message: 'Partners fetched successfully',
      data: items,
    });
  } catch (error) {
    logger.error('Public list partners error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to load partners', 500));
  }
};

const publicGetPartnerBySlug = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ slug: req.params.slug, status: 'Active' }).lean();
    if (!partner) {
      return next(new AppError('Partner not found', 404));
    }
    res.status(200).json({
      success: true,
      message: 'Partner fetched successfully',
      data: partner,
    });
  } catch (error) {
    logger.error('Public get partner by slug error', { error: error.message, stack: error.stack, slug: req.params.slug });
    next(error instanceof AppError ? error : new AppError('Unable to fetch partner', 500));
  }
};

const adminListPartners = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const statusFilter = normalizeList(req.query.status);
    const location = req.query.location?.trim();

    const filter = {};
    if (statusFilter.length) filter.status = { $in: statusFilter };
    if (location && location !== 'all') filter.location = location;
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { name: regex },
        { location: regex },
        { role: regex },
        { email: regex },
      ];
    }

    const [items, total, locations] = await Promise.all([
      Partner.find(filter).sort({ order: 1, name: 1 }).skip(skip).limit(limit).lean(),
      Partner.countDocuments(filter),
      Partner.distinct('location'),
    ]);

    res.status(200).json({
      success: true,
      message: 'Partners fetched successfully',
      data: {
        items,
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        locations,
      },
    });
  } catch (error) {
    logger.error('Admin list partners error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to load partners', 500));
  }
};

const adminGetPartner = async (req, res, next) => {
  try {
    const partner = await Partner.findById(req.params.id).lean();
    if (!partner) {
      return next(new AppError('Partner not found', 404));
    }
    res.status(200).json({
      success: true,
      message: 'Partner fetched successfully',
      data: partner,
    });
  } catch (error) {
    logger.error('Admin get partner error', { error: error.message, stack: error.stack, partnerId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to fetch partner', 500));
  }
};

const createPartner = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const {
      name,
      slug,
      location,
      role,
      email,
      phone,
      bio,
      expertise,
      image,
      status = 'Active',
      order = 0,
    } = req.body;

    const baseSlug = slugify(slug || name);
    const uniqueSlug = await ensureUniqueSlug(baseSlug);

    const partner = await Partner.create({
      name: name.trim(),
      slug: uniqueSlug,
      location: location.trim(),
      role: role.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      bio: bio?.trim() || null,
      expertise: normalizeExpertise(expertise),
      image: image?.trim() || null,
      status,
      order: Number(order) || 0,
      createdBy: req.user._id,
    });

    logger.info('Partner created', { partnerId: partner._id, name: partner.name, createdBy: req.user._id });

    res.status(201).json({
      success: true,
      message: 'Partner created successfully',
      data: partner,
    });
  } catch (error) {
    if (error.code === 11000) {
      logger.warn('Partner creation failed - duplicate slug', { error: error.keyValue });
      return next(new AppError('A partner with this slug already exists', 400));
    }
    logger.error('Create partner error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to create partner', 500));
  }
};

const updatePartner = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const partner = await Partner.findById(req.params.id);
    if (!partner) {
      return next(new AppError('Partner not found', 404));
    }

    const {
      name,
      slug,
      location,
      role,
      email,
      phone,
      bio,
      expertise,
      image,
      status,
      order,
    } = req.body;

    // Regenerate slug if name changed or slug is provided
    let uniqueSlug = partner.slug;
    if (name && name.trim() !== partner.name) {
      const baseSlug = slugify(slug || name);
      uniqueSlug = await ensureUniqueSlug(baseSlug, partner._id);
    } else if (slug && slug.trim() !== partner.slug) {
      const baseSlug = slugify(slug);
      uniqueSlug = await ensureUniqueSlug(baseSlug, partner._id);
    }

    partner.name = name?.trim() || partner.name;
    partner.slug = uniqueSlug;
    partner.location = location?.trim() || partner.location;
    partner.role = role?.trim() || partner.role;
    partner.email = email !== undefined ? (email?.trim() || null) : partner.email;
    partner.phone = phone !== undefined ? (phone?.trim() || null) : partner.phone;
    partner.bio = bio !== undefined ? (bio?.trim() || null) : partner.bio;
    partner.expertise = expertise !== undefined ? normalizeExpertise(expertise) : partner.expertise;
    partner.image = image !== undefined ? (image?.trim() || null) : partner.image;
    partner.status = status !== undefined ? status : partner.status;
    partner.order = order !== undefined ? Number(order) : partner.order;

    await partner.save();

    logger.info('Partner updated', { partnerId: partner._id, name: partner.name, updatedBy: req.user._id });

    res.status(200).json({
      success: true,
      message: 'Partner updated successfully',
      data: partner,
    });
  } catch (error) {
    if (error.code === 11000) {
      logger.warn('Partner update failed - duplicate slug', { error: error.keyValue });
      return next(new AppError('A partner with this slug already exists', 400));
    }
    logger.error('Update partner error', { error: error.message, stack: error.stack, partnerId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to update partner', 500));
  }
};

const deletePartner = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const partner = await Partner.findById(req.params.id);
    if (!partner) {
      return next(new AppError('Partner not found', 404));
    }

    await Partner.findByIdAndDelete(req.params.id);

    logger.info('Partner deleted', { partnerId: req.params.id, name: partner.name, deletedBy: req.user._id });

    res.status(200).json({
      success: true,
      message: 'Partner deleted successfully',
    });
  } catch (error) {
    logger.error('Delete partner error', { error: error.message, stack: error.stack, partnerId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to delete partner', 500));
  }
};

const uploadImage = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!req.file) {
      return next(new AppError('Image file is required', 400));
    }

    const relativePath = `/uploads/partners/${req.file.filename}`;

    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: relativePath,
        filename: req.file.filename,
        originalname: req.file.originalname,
      },
    });
  } catch (error) {
    logger.error('Upload partner image error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to upload image', 500));
  }
};

module.exports = {
  publicListPartners,
  publicGetPartnerBySlug,
  adminListPartners,
  adminGetPartner,
  createPartner,
  updatePartner,
  deletePartner,
  uploadImage,
};

