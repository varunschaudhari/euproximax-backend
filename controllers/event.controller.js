const mongoose = require('mongoose');
const Event = require('../models/Event');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const getBaseUrl = (req) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = forwardedHost ? forwardedHost.split(',')[0].trim() : req.get('host');
  return `${protocol}://${host}`;
};

const toAbsoluteUrl = (req, url) => {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${getBaseUrl(req)}${url}`;
};

const normalizeUploadPath = (url) => {
  if (!url) return url;
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url);
      if (parsed.pathname && parsed.pathname.startsWith('/uploads/')) {
        return parsed.pathname;
      }
      return url;
    }
  } catch (err) {
    // Fall through to return original url
  }
  return url;
};

const formatEventForResponse = (req, event) => {
  if (!event) return event;
  const formatted = { ...event };
  if (formatted.heroImage) {
    const normalizedHero = normalizeUploadPath(formatted.heroImage);
    formatted.heroImage = toAbsoluteUrl(req, normalizedHero);
  }
  if (Array.isArray(formatted.images)) {
    formatted.images = formatted.images.map((img) => ({
      ...img,
      url: toAbsoluteUrl(req, normalizeUploadPath(img.url)),
    }));
  }
  return formatted;
};

const slugify = (value) => {
  return value
    .toString()
    .trim()
    .toLowerCase()
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
    const existing = await Event.findOne(slugFilter(uniqueSlug)).select('_id').lean();
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

const normalizeOutcomes = (outcomes) => normalizeList(outcomes).slice(0, 20);
const normalizeKeywords = (keywords) => normalizeList(keywords).slice(0, 20);

const publicListEvents = async (req, res, next) => {
  try {
    const category = req.query.category?.trim();
    const featuredOnly = req.query.featured === 'true';
    const statusFilter = req.query.status?.trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const filter = { status: 'Published' };
    if (category && category !== 'all') filter.category = category;
    if (featuredOnly) filter.isFeatured = true;
    if (statusFilter === 'upcoming') {
      filter.startDate = { $gte: new Date() };
    } else if (statusFilter === 'past') {
      filter.endDate = { $lt: new Date() };
    }

    const items = await Event.find(filter)
      .sort({ isFeatured: -1, startDate: 1, publishedAt: -1 })
      .limit(limit)
      .lean();

    const formattedItems = items.map((event) => formatEventForResponse(req, event));

    res.status(200).json({
      success: true,
      message: 'Events fetched successfully',
      data: formattedItems,
    });
  } catch (error) {
    logger.error('Public list events error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to load events', 500));
  }
};

const adminListEvents = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const statusFilter = normalizeList(req.query.status);
    const category = req.query.category?.trim();

    const filter = {};
    if (statusFilter.length) filter.status = { $in: statusFilter };
    if (category && category !== 'all') filter.category = category;
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { title: regex },
        { description: regex },
        { category: regex },
        { venue: regex },
      ];
    }

    const [items, total, categories] = await Promise.all([
      Event.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Event.countDocuments(filter),
      Event.distinct('category'),
    ]);

    const formattedItems = items.map((event) => formatEventForResponse(req, event));

    res.status(200).json({
      success: true,
      message: 'Events fetched successfully',
      data: {
        items: formattedItems,
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        categories,
      },
    });
  } catch (error) {
    logger.error('Admin list events error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to load events', 500));
  }
};

const adminGetEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event) {
      return next(new AppError('Event not found', 404));
    }
    res.status(200).json({
      success: true,
      message: 'Event fetched successfully',
      data: formatEventForResponse(req, event),
    });
  } catch (error) {
    logger.error('Admin get event error', { error: error.message, stack: error.stack, eventId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to fetch event', 500));
  }
};

const createEvent = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const {
      title,
      slug,
      description,
      category,
      venue,
      startDate,
      endDate,
      registrationLink,
      maxAttendees,
      outcomes,
      heroImage,
      heroImageAlt,
      status = 'Draft',
      isFeatured = false,
      seoTitle,
      seoDescription,
      seoKeywords,
      utmSource,
      utmMedium,
      utmCampaign,
    } = req.body;

    const baseSlug = slugify(slug || title);
    const uniqueSlug = await ensureUniqueSlug(baseSlug);

    if (!startDate || !endDate) {
      return next(new AppError('Start date and end date are required', 400));
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return next(new AppError('Invalid date format', 400));
    }

    if (end < start) {
      return next(new AppError('End date must be after start date', 400));
    }

    const event = await Event.create({
      title: title.trim(),
      slug: uniqueSlug,
      description: description.trim(),
      category: category.trim(),
      venue: venue.trim(),
      startDate: start,
      endDate: end,
      registrationLink: registrationLink?.trim() || null,
      maxAttendees: maxAttendees ? Number(maxAttendees) : null,
      outcomes: normalizeOutcomes(outcomes),
      heroImage: heroImage?.trim() || null,
      heroImageAlt: heroImageAlt?.trim() || null,
      status,
      isFeatured: Boolean(isFeatured),
      publishedAt: status === 'Published' ? new Date() : null,
      seoTitle: seoTitle?.trim() || null,
      seoDescription: seoDescription?.trim() || null,
      seoKeywords: normalizeKeywords(seoKeywords),
      utmSource: utmSource?.trim() || null,
      utmMedium: utmMedium?.trim() || null,
      utmCampaign: utmCampaign?.trim() || null,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: formatEventForResponse(req, event.toObject ? event.toObject() : event),
    });
  } catch (error) {
    logger.error('Create event error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to create event', 500));
  }
};

const updateEvent = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const { id } = req.params;
    const event = await Event.findById(id);

    if (!event) {
      return next(new AppError('Event not found', 404));
    }

    const updates = req.body || {};

    if (updates.title) {
      event.title = updates.title.trim();
    }

    if (updates.description) {
      event.description = updates.description.trim();
    }

    if (updates.category) {
      event.category = updates.category.trim();
    }

    if (updates.venue) {
      event.venue = updates.venue.trim();
    }

    if (updates.startDate) {
      const start = new Date(updates.startDate);
      if (isNaN(start.getTime())) {
        return next(new AppError('Invalid start date format', 400));
      }
      event.startDate = start;
    }

    if (updates.endDate) {
      const end = new Date(updates.endDate);
      if (isNaN(end.getTime())) {
        return next(new AppError('Invalid end date format', 400));
      }
      event.endDate = end;
    }

    if (updates.startDate && updates.endDate) {
      if (event.endDate < event.startDate) {
        return next(new AppError('End date must be after start date', 400));
      }
    } else if (updates.endDate && event.startDate && event.endDate < event.startDate) {
      return next(new AppError('End date must be after start date', 400));
    }

    if (updates.registrationLink !== undefined) {
      event.registrationLink = updates.registrationLink?.trim() || null;
    }

    if (updates.maxAttendees !== undefined) {
      event.maxAttendees = updates.maxAttendees ? Number(updates.maxAttendees) : null;
    }

    if (updates.outcomes !== undefined) {
      event.outcomes = normalizeOutcomes(updates.outcomes);
    }

    if (updates.heroImage !== undefined) {
      const normalizedHero = normalizeUploadPath(updates.heroImage?.trim());
      event.heroImage = normalizedHero || null;
    }

    if (updates.heroImageAlt !== undefined) {
      event.heroImageAlt = updates.heroImageAlt?.trim() || null;
    }

    if (updates.status && ['Draft', 'Published', 'Cancelled', 'Completed'].includes(updates.status)) {
      event.status = updates.status;
      if (updates.status === 'Published' && !event.publishedAt) {
        event.publishedAt = new Date();
      }
      if (updates.status === 'Draft' || updates.status === 'Cancelled') {
        event.publishedAt = null;
      }
    }

    if (updates.isFeatured !== undefined) {
      event.isFeatured = Boolean(updates.isFeatured);
    }

    if (updates.slug) {
      const newSlug = slugify(updates.slug);
      event.slug = await ensureUniqueSlug(newSlug, event._id);
    } else if (updates.title) {
      event.slug = await ensureUniqueSlug(slugify(event.title), event._id);
    }

    if (updates.seoTitle !== undefined) {
      event.seoTitle = updates.seoTitle?.trim() || null;
    }

    if (updates.seoDescription !== undefined) {
      event.seoDescription = updates.seoDescription?.trim() || null;
    }

    if (updates.seoKeywords !== undefined) {
      event.seoKeywords = normalizeKeywords(updates.seoKeywords);
    }

    if (updates.utmSource !== undefined) {
      event.utmSource = updates.utmSource?.trim() || null;
    }

    if (updates.utmMedium !== undefined) {
      event.utmMedium = updates.utmMedium?.trim() || null;
    }

    if (updates.utmCampaign !== undefined) {
      event.utmCampaign = updates.utmCampaign?.trim() || null;
    }

    await event.save();

    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      data: formatEventForResponse(req, event.toObject ? event.toObject() : event),
    });
  } catch (error) {
    logger.error('Update event error', { error: error.message, stack: error.stack, eventId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to update event', 500));
  }
};

const deleteEvent = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const { id } = req.params;
    const event = await Event.findById(id);

    if (!event) {
      return next(new AppError('Event not found', 404));
    }

    await event.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully',
    });
  } catch (error) {
    logger.error('Delete event error', { error: error.message, stack: error.stack, eventId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to delete event', 500));
  }
};

const uploadHeroImage = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!req.file) {
      return next(new AppError('No file uploaded', 400));
    }

    const filePath = `/uploads/event/${req.file.filename}`;
    const absoluteUrl = toAbsoluteUrl(req, filePath);

    res.status(200).json({
      success: true,
      message: 'Hero image uploaded successfully',
      data: {
        url: absoluteUrl,
        filename: req.file.filename,
        originalname: req.file.originalname,
      },
    });
  } catch (error) {
    logger.error('Upload hero image error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to upload image', 500));
  }
};

const uploadGalleryImages = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    logger.info('Gallery upload request', { 
      filesCount: req.files?.length || 0,
      files: req.files?.map(f => ({ name: f.originalname, size: f.size, mimetype: f.mimetype })) || []
    });

    if (!req.files || req.files.length === 0) {
      logger.warn('No files in request', { body: req.body, files: req.files });
      return next(new AppError('No files uploaded', 400));
    }

    const uploadedImages = req.files.map((file, index) => {
      const relativeUrl = `/uploads/event/${file.filename}`;
      return {
        url: toAbsoluteUrl(req, relativeUrl),
        alt: file.originalname.replace(/\.[^/.]+$/, ''),
        caption: '',
        order: index,
      };
    });

    logger.info('Gallery images uploaded successfully', { count: uploadedImages.length });

    res.status(200).json({
      success: true,
      message: 'Gallery images uploaded successfully',
      data: uploadedImages,
    });
  } catch (error) {
    logger.error('Upload gallery images error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to upload images', 500));
  }
};

const updateEventImages = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const { id } = req.params;
    const { images } = req.body;

    const event = await Event.findById(id);
    if (!event) {
      return next(new AppError('Event not found', 404));
    }

    if (Array.isArray(images)) {
      event.images = images
        .map((img, index) => {
          const normalizedUrl = normalizeUploadPath(img.url?.trim());
          return {
            url: normalizedUrl || '',
            alt: img.alt?.trim() || '',
            caption: img.caption?.trim() || '',
            order: img.order !== undefined ? Number(img.order) : index,
          };
        })
        .filter((img) => img.url);
    }

    await event.save();

    res.status(200).json({
      success: true,
      message: 'Event images updated successfully',
      data: event,
    });
  } catch (error) {
    logger.error('Update event images error', { error: error.message, stack: error.stack, eventId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to update images', 500));
  }
};

module.exports = {
  publicListEvents,
  adminListEvents,
  adminGetEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  uploadHeroImage,
  uploadGalleryImages,
  updateEventImages,
};

