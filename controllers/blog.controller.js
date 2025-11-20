const mongoose = require('mongoose');
const BlogPost = require('../models/BlogPost');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

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
    const existing = await BlogPost.findOne(slugFilter(uniqueSlug)).select('_id').lean();
    if (!existing) break;
    uniqueSlug = `${candidate}-${suffix}`;
    suffix += 1;
  }

  return uniqueSlug;
};

const normalizeTags = (tags) => {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean)
      .slice(0, 12);
  }
  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return [];
};

const buildAuthor = (author = {}) => {
  if (typeof author === 'string') {
    return {
      name: author,
    };
  }

  return {
    name: author.name?.trim() || 'EuProximaX Team',
    title: author.title?.trim() || author.designation?.trim() || undefined,
    avatar: author.avatar?.trim() || undefined,
  };
};

const estimateReadTime = (text = '') => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.min(Math.round(words / 200) || 1, 60));
};

const createBlog = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const {
      title,
      slug,
      excerpt,
      content,
      category,
      coverImage,
      heroImageAlt,
      tags,
      seoTitle,
      seoDescription,
      seoKeywords,
      author,
      readTimeMinutes,
      status = 'Draft',
      isFeatured = false,
    } = req.body;

    const baseSlug = slugify(slug || title);
    const uniqueSlug = await ensureUniqueSlug(baseSlug);

    const blog = await BlogPost.create({
      title: title.trim(),
      slug: uniqueSlug,
      excerpt: excerpt.trim(),
      content: content.trim(),
      category: category.trim(),
      coverImage: coverImage?.trim(),
      heroImageAlt: heroImageAlt?.trim(),
      tags: normalizeTags(tags),
      seoTitle: seoTitle?.trim(),
      seoDescription: seoDescription?.trim(),
      seoKeywords: normalizeTags(seoKeywords),
      author: buildAuthor(author),
      readTimeMinutes: Number(readTimeMinutes) || 5,
      status,
      isFeatured,
      publishedAt: status === 'Published' ? new Date() : null,
    });

    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: blog,
    });
  } catch (error) {
    logger.error('Create blog error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to create blog', 500));
  }
};

const listBlogs = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 9, 50);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = req.query.category?.trim();
    const tag = req.query.tag?.trim();
    const featuredOnly = req.query.featured === true || req.query.featured === 'true';
    const skip = (page - 1) * limit;

    const filter = { status: 'Published' };

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (featuredOnly) {
      filter.isFeatured = true;
    }

    if (tag) {
      filter.tags = tag;
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ title: regex }, { excerpt: regex }, { 'author.name': regex }, { category: regex }, { tags: regex }];
    }

    const [items, total, categories] = await Promise.all([
      BlogPost.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BlogPost.countDocuments(filter),
      BlogPost.distinct('category', { status: 'Published' }),
    ]);

    res.status(200).json({
      success: true,
      message: 'Blogs fetched successfully',
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
    logger.error('List blogs error', { error: error.message, stack: error.stack });
    next(error);
  }
};

const getBlogBySlug = async (req, res, next) => {
  try {
    const identifier = req.params.slugOrId;
    if (!identifier) {
      return next(new AppError('Blog identifier is required', 400));
    }

    let blog = null;
    const normalizedSlug = slugify(identifier);

    blog = await BlogPost.findOne({ slug: normalizedSlug }).lean();

    if (!blog && mongoose.Types.ObjectId.isValid(identifier)) {
      blog = await BlogPost.findById(identifier).lean();
    }

    if (!blog) {
      return next(new AppError('Blog not found', 404));
    }

    if (blog.status !== 'Published') {
      return next(new AppError('Blog not found', 404));
    }

    res.status(200).json({
      success: true,
      message: 'Blog fetched successfully',
      data: blog,
    });
  } catch (error) {
    logger.error('Get blog error', { error: error.message, stack: error.stack, slug: req.params.slugOrId });
    next(error instanceof AppError ? error : new AppError('Unable to fetch blog', 500));
  }
};

const updateBlog = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const { id } = req.params;
    const blog = await BlogPost.findById(id);

    if (!blog) {
      return next(new AppError('Blog not found', 404));
    }

    const updates = req.body || {};

    if (updates.title) {
      blog.title = updates.title.trim();
    }

    if (updates.excerpt) {
      blog.excerpt = updates.excerpt.trim();
    }

    if (updates.content) {
      blog.content = updates.content.trim();
    }

    if (updates.category) {
      blog.category = updates.category.trim();
    }

    if (updates.coverImage !== undefined) {
      blog.coverImage = updates.coverImage?.trim() || null;
    }
    if (updates.heroImageAlt !== undefined) {
      blog.heroImageAlt = updates.heroImageAlt?.trim() || null;
    }

    if (updates.tags !== undefined) {
      blog.tags = normalizeTags(updates.tags);
    }

    if (updates.author !== undefined) {
      blog.author = buildAuthor(updates.author);
    }

    if (updates.readTimeMinutes !== undefined) {
      blog.readTimeMinutes = Math.max(1, Math.min(Number(updates.readTimeMinutes) || 5, 60));
    }

    if (updates.isFeatured !== undefined) {
      blog.isFeatured = Boolean(updates.isFeatured);
    }
    if (updates.seoTitle !== undefined) {
      blog.seoTitle = updates.seoTitle?.trim() || null;
    }
    if (updates.seoDescription !== undefined) {
      blog.seoDescription = updates.seoDescription?.trim() || null;
    }
    if (updates.seoKeywords !== undefined) {
      blog.seoKeywords = normalizeTags(updates.seoKeywords);
    }

    if (updates.slug) {
      const newSlug = slugify(updates.slug);
      blog.slug = await ensureUniqueSlug(newSlug, blog._id);
    } else if (updates.title) {
      // regenerate slug if title changed and slug matches previous title
      blog.slug = await ensureUniqueSlug(slugify(blog.title), blog._id);
    }

    if (updates.status && ['Draft', 'Published'].includes(updates.status)) {
      blog.status = updates.status;
      if (updates.status === 'Published' && !blog.publishedAt) {
        blog.publishedAt = new Date();
      }
      if (updates.status === 'Draft') {
        blog.publishedAt = null;
      }
    }

    if (updates.submissionStatus && ['Submitted', 'In Review', 'Approved', 'Rejected'].includes(updates.submissionStatus)) {
      blog.submissionStatus = updates.submissionStatus;
      if (updates.submissionStatus === 'Approved') {
        blog.status = 'Published';
        if (!blog.publishedAt) {
          blog.publishedAt = new Date();
        }
      }
    }

    await blog.save();

    res.status(200).json({
      success: true,
      message: 'Blog updated successfully',
      data: blog,
    });
  } catch (error) {
    logger.error('Update blog error', { error: error.message, stack: error.stack, blogId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to update blog', 500));
  }
};

const deleteBlog = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const { id } = req.params;
    const blog = await BlogPost.findById(id);

    if (!blog) {
      return next(new AppError('Blog not found', 404));
    }

    await blog.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Blog deleted successfully',
    });
  } catch (error) {
    logger.error('Delete blog error', { error: error.message, stack: error.stack, blogId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to delete blog', 500));
  }
};

const submitBlogProposal = async (req, res, next) => {
  try {
    const { name, email, title, summary, reference, category } = req.body;

    const cleanTitle = title.trim();
    const cleanSummary = summary.trim();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    const baseSlug = slugify(`${cleanTitle}-${Date.now()}`);
    const uniqueSlug = await ensureUniqueSlug(baseSlug);

    const excerpt = cleanSummary.length > 500 ? `${cleanSummary.slice(0, 497)}...` : cleanSummary;
    const readTimeMinutes = estimateReadTime(cleanSummary);

    const blog = await BlogPost.create({
      title: cleanTitle,
      slug: uniqueSlug,
      excerpt,
      content: cleanSummary,
      category: category?.trim() || 'Guest Submission',
      tags: [],
      author: {
        name: cleanName,
      },
      readTimeMinutes,
      status: 'Draft',
      isFeatured: false,
      submittedByName: cleanName,
      submittedByEmail: cleanEmail,
      submissionReference: reference?.trim(),
      submissionStatus: 'Submitted',
      publishedAt: null,
    });

    res.status(201).json({
      success: true,
      message: 'Submission received. Our editorial team will review it shortly.',
      data: {
        submissionId: blog._id,
        slug: blog.slug,
      },
    });
  } catch (error) {
    logger.error('Blog submission error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to submit article', 500));
  }
};

const listBlogsAdmin = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const statusParam = req.query.status;
    const submissionParam = req.query.submissionStatus;
    const category = req.query.category?.trim();
    const onlySubmissions = req.query.onlySubmissions === 'true';
    const skip = (page - 1) * limit;

    const normalizeList = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      return value.split(',').map((v) => v.trim()).filter(Boolean);
    };

    const statusList = normalizeList(statusParam);
    const submissionList = normalizeList(submissionParam);

    const filter = {};

    if (statusList.length) {
      filter.status = { $in: statusList };
    }
    if (submissionList.length) {
      filter.submissionStatus = { $in: submissionList };
    }
    if (category) {
      filter.category = category;
    }
    if (onlySubmissions) {
      filter.submissionStatus = { $in: ['Submitted', 'In Review'] };
    }
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ title: regex }, { excerpt: regex }, { 'author.name': regex }, { category: regex }, { tags: regex }];
    }

    const [items, total, categories] = await Promise.all([
      BlogPost.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      BlogPost.countDocuments(filter),
      BlogPost.distinct('category'),
    ]);

    res.status(200).json({
      success: true,
      message: 'Blogs fetched successfully',
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
    logger.error('Admin list blogs error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch blogs', 500));
  }
};

const getBlogAdminById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const blog = await BlogPost.findById(id).lean();
    if (!blog) {
      return next(new AppError('Blog not found', 404));
    }
    res.status(200).json({
      success: true,
      message: 'Blog fetched successfully',
      data: blog,
    });
  } catch (error) {
    logger.error('Get admin blog error', { error: error.message, stack: error.stack, blogId: req.params.id });
    next(error instanceof AppError ? error : new AppError('Unable to fetch blog', 500));
  }
};

const uploadHeroImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('Hero image file is required', 400));
    }

    const relativePath = `/uploads/blog/${req.file.filename}`;

    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: relativePath,
      },
    });
  } catch (error) {
    logger.error('Hero image upload error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to upload image', 500));
  }
};

module.exports = {
  createBlog,
  listBlogs,
  getBlogBySlug,
  updateBlog,
  deleteBlog,
  submitBlogProposal,
  listBlogsAdmin,
  getBlogAdminById,
  uploadHeroImage,
};


