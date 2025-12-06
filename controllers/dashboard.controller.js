const mongoose = require('mongoose');
const User = require('../models/User');
const Contact = require('../models/ContactMessage');
const Project = require('../models/Project');
const BlogPost = require('../models/BlogPost');
const Video = require('../models/Video');
const Event = require('../models/Event');
const Partner = require('../models/Partner');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Get dashboard statistics
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Get all counts in parallel
    const [
      totalUsers,
      totalEnquiries,
      totalProjects,
      totalBlogs,
      totalVideos,
      totalEvents,
      totalPartners,
      usersThisMonth,
      contactsThisMonth,
      projectsThisMonth,
      blogsThisMonth,
      contactsLast7Days,
      projectsLast7Days,
      blogsLast7Days,
      contactsByStatus,
      projectsByStatus,
      blogsByStatus,
      recentContacts,
      recentProjects,
      recentBlogs,
      recentEvents,
    ] = await Promise.all([
      // Total counts
      User.countDocuments(),
      Contact.countDocuments(),
      Project.countDocuments(),
      BlogPost.countDocuments(),
      Video.countDocuments(),
      Event.countDocuments(),
      Partner.countDocuments(),

      // This month counts
      User.countDocuments({ createdAt: { $gte: thisMonth } }),
      Contact.countDocuments({ createdAt: { $gte: thisMonth } }),
      Project.countDocuments({ createdAt: { $gte: thisMonth } }),
      BlogPost.countDocuments({ createdAt: { $gte: thisMonth } }),

      // Last 7 days counts
      Contact.countDocuments({ createdAt: { $gte: last7Days } }),
      Project.countDocuments({ createdAt: { $gte: last7Days } }),
      BlogPost.countDocuments({ createdAt: { $gte: last7Days } }),

      // Status breakdowns
      Contact.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Project.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      BlogPost.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Recent items (last 10)
      Contact.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('name email subject status createdAt')
        .lean(),
      Project.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('projectName clientName status createdAt')
        .populate('projectManager', 'name')
        .lean(),
      BlogPost.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('title category status createdAt')
        .lean(),
      Event.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('title category status createdAt')
        .lean(),
    ]);

    // Calculate trends (this month vs last month)
    const contactsLastMonth = await Contact.countDocuments({
      createdAt: { $gte: lastMonth, $lt: thisMonth },
    });
    const projectsLastMonth = await Project.countDocuments({
      createdAt: { $gte: lastMonth, $lt: thisMonth },
    });
    const blogsLastMonth = await BlogPost.countDocuments({
      createdAt: { $gte: lastMonth, $lt: thisMonth },
    });

    // Calculate percentage changes
    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    // Format status breakdowns
    const formatStatusBreakdown = (aggregation) => {
      return aggregation.reduce((acc, item) => {
        acc[item._id || 'Unknown'] = item.count;
        return acc;
      }, {});
    };

    // Get activity timeline (last 30 days)
    const activityTimeline = await Promise.all([
      Contact.aggregate([
        { $match: { createdAt: { $gte: last30Days } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Project.aggregate([
        { $match: { createdAt: { $gte: last30Days } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      BlogPost.aggregate([
        { $match: { createdAt: { $gte: last30Days } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      message: 'Dashboard statistics fetched successfully',
      data: {
        overview: {
          totalUsers,
          totalEnquiries,
          totalProjects,
          totalBlogs,
          totalVideos,
          totalEvents,
          totalPartners,
        },
        thisMonth: {
          users: usersThisMonth,
          contacts: contactsThisMonth,
          projects: projectsThisMonth,
          blogs: blogsThisMonth,
        },
        last7Days: {
          contacts: contactsLast7Days,
          projects: projectsLast7Days,
          blogs: blogsLast7Days,
        },
        trends: {
          contacts: {
            current: contactsThisMonth,
            previous: contactsLastMonth,
            change: calculateChange(contactsThisMonth, contactsLastMonth),
          },
          projects: {
            current: projectsThisMonth,
            previous: projectsLastMonth,
            change: calculateChange(projectsThisMonth, projectsLastMonth),
          },
          blogs: {
            current: blogsThisMonth,
            previous: blogsLastMonth,
            change: calculateChange(blogsThisMonth, blogsLastMonth),
          },
        },
        statusBreakdown: {
          contacts: formatStatusBreakdown(contactsByStatus),
          projects: formatStatusBreakdown(projectsByStatus),
          blogs: formatStatusBreakdown(blogsByStatus),
        },
        recent: {
          contacts: recentContacts,
          projects: recentProjects,
          blogs: recentBlogs,
          events: recentEvents,
        },
        activityTimeline: {
          contacts: activityTimeline[0],
          projects: activityTimeline[1],
          blogs: activityTimeline[2],
        },
      },
    });
  } catch (error) {
    logger.error('Get dashboard stats error', {
      error: error.message,
      stack: error.stack,
    });
    next(
      error instanceof AppError
        ? error
        : new AppError('Unable to fetch dashboard statistics', 500)
    );
  }
};

module.exports = {
  getDashboardStats,
};

