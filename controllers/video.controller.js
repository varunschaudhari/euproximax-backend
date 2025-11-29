const Video = require('../models/Video');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const normalizeList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.split(',').map((v) => v.trim()).filter(Boolean);
};

const normalizeTags = (tags) => normalizeList(tags).slice(0, 20);

const publicListVideos = async (req, res, next) => {
  try {
    const category = req.query.category?.trim();
    const featuredOnly = req.query.featured === 'true';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const filter = { status: 'Published' };
    if (category) filter.category = category;
    if (featuredOnly) filter.isFeatured = true;

    const items = await Video.find(filter).sort({ isFeatured: -1, publishedAt: -1 }).limit(limit).lean();

    res.status(200).json({
      success: true,
      message: 'Videos fetched successfully',
      data: items,
    });
  } catch (error) {
    logger.error('Public list videos error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to load videos', 500));
  }
};

const adminListVideos = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const statusFilter = normalizeList(req.query.status);
    const category = req.query.category?.trim();

    const filter = {};
    if (statusFilter.length) filter.status = { $in: statusFilter };
    if (category) filter.category = category;
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ title: regex }, { description: regex }, { category: regex }, { tags: regex }];
    }

    const [items, total, categories] = await Promise.all([
      Video.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Video.countDocuments(filter),
      Video.distinct('category'),
    ]);

    res.status(200).json({
      success: true,
      message: 'Videos fetched successfully',
      data: {
        items,
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        categories,
      },
    });
  } catch (error) {
    logger.error('Admin list videos error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to load videos', 500));
  }
};

const adminGetVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id).lean();
    if (!video) {
      return next(new AppError('Video not found', 404));
    }
    res.status(200).json({
      success: true,
      message: 'Video fetched successfully',
      data: video,
    });
  } catch (error) {
    logger.error('Admin get video error', { error: error.message, stack: error.stack, videoId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to fetch video', 500));
  }
};

const buildPayload = (req) => {
  const payload = {
    title: req.body.title?.trim(),
    description: req.body.description?.trim(),
    category: req.body.category?.trim() || null,
    tags: normalizeTags(req.body.tags),
    durationSeconds: req.body.durationSeconds ? Number(req.body.durationSeconds) : undefined,
    videoUrl: req.body.videoUrl?.trim(),
    thumbnailUrl: req.body.thumbnailUrl?.trim() || null,
    heroImageAlt: req.body.heroImageAlt?.trim() || null,
    status: req.body.status,
    isFeatured: req.body.isFeatured,
    seoTitle: req.body.seoTitle?.trim() || null,
    seoDescription: req.body.seoDescription?.trim() || null,
    seoKeywords: normalizeTags(req.body.seoKeywords),
  };
  return payload;
};

const adminCreateVideo = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    const payload = buildPayload(req);
    payload.uploadedBy = req.user._id;
    if (payload.status === 'Published') {
      payload.publishedAt = new Date();
    }
    const video = await Video.create(payload);
    res.status(201).json({
      success: true,
      message: 'Video created successfully',
      data: video,
    });
  } catch (error) {
    logger.error('Create video error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to create video', 500));
  }
};

const adminUpdateVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const video = await Video.findById(id);
    if (!video) {
      return next(new AppError('Video not found', 404));
    }

    const updates = buildPayload(req);
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        video[key] = value;
      }
    });

    if (updates.status === 'Published' && !video.publishedAt) {
      video.publishedAt = new Date();
    }
    if (updates.status === 'Draft') {
      video.publishedAt = null;
    }

    await video.save();
    res.status(200).json({
      success: true,
      message: 'Video updated successfully',
      data: video,
    });
  } catch (error) {
    logger.error('Update video error', { error: error.message, stack: error.stack, videoId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to update video', 500));
  }
};

const adminDeleteVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const video = await Video.findById(id);
    if (!video) {
      return next(new AppError('Video not found', 404));
    }
    await video.deleteOne();
    res.status(200).json({
      success: true,
      message: 'Video deleted successfully',
    });
  } catch (error) {
    logger.error('Delete video error', { error: error.message, stack: error.stack, videoId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to delete video', 500));
  }
};

const uploadVideoFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('Video file is required', 400));
    }
    const relativePath = `/uploads/video/${req.file.filename}`;
    res.status(201).json({
      success: true,
      message: 'Video uploaded successfully',
      data: { url: relativePath },
    });
  } catch (error) {
    logger.error('Video upload error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to upload video', 500));
  }
};

const uploadThumbnail = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('Thumbnail image is required', 400));
    }
    const relativePath = `/uploads/blog/${req.file.filename}`;
    res.status(201).json({
      success: true,
      message: 'Thumbnail uploaded successfully',
      data: { url: relativePath },
    });
  } catch (error) {
    logger.error('Thumbnail upload error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to upload thumbnail', 500));
  }
};

module.exports = {
  publicListVideos,
  adminListVideos,
  adminGetVideo,
  adminCreateVideo,
  adminUpdateVideo,
  adminDeleteVideo,
  uploadVideoFile,
  uploadThumbnail,
};


