const logger = require('../utils/logger');
const config = require('../utils/config');

// Import routes
const authRoutes = require('./auth');
const userRoutes = require('./user');
const aclRoutes = require('./acl');
const contactRoutes = require('./contact');
const blogRoutes = require('./blog');
const videoRoutes = require('./video');
const eventRoutes = require('./event');
const partnerRoutes = require('./partner');
const dashboardRoutes = require('./dashboard');
const chatbotRoutes = require('./chatbot');
const consultationRoutes = require('./consultation');
const caseRoutes = require('./case');
const crmClientRoutes = require('./crmClient');
const paymentRoutes = require('./payment');
const vendorRoutes = require('./vendor');
const reportsRoutes = require('./reports');
const deadlineRoutes = require('./deadline');
const notificationRoutes = require('./notification');
const portalRoutes = require('./portal');
const documentRoutes = require('./document');
const crmDashboardRoutes = require('./crmDashboard');
const quoteRoutes = require('./quote');
const settingsRoutes = require('./settings');

// JWT secrets configuration (not used directly, but kept for reference)
// JWT config is now accessed via config.jwt in middleware/auth.js

// Import JWT middleware
const jwtMiddleware = require('../middleware/auth');

/**
 * Auth route filter - routes that don't require authentication
 * These routes will bypass JWT middleware
 */
const authRouteFilter = (req, res, next) => {
    // Always allow OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
        return next();
    }

    // Check if this is a chatbot public route (not admin)
    const isChatbotPublicRoute = req.path.startsWith('/api/v1/chatbot/') && 
                                 !req.path.startsWith('/api/v1/chatbot/admin/') &&
                                 (req.path === '/api/v1/chatbot/conversation' ||
                                  req.path.startsWith('/api/v1/chatbot/conversation/') ||
                                  (req.path === '/api/v1/chatbot/message' && req.method === 'POST'));

    const publicRoutes = [
        { path: '/api/v1/auth/register' },
        { path: '/api/v1/auth/login' },
        { path: '/api/v1/auth/forgot-password', methods: ['POST'] },
        { path: '/api/v1/auth/reset-password', methods: ['POST'] },
        { path: '/api/health' },
        { path: '/api/v1/health' },
        { path: '/api/v1/contact', methods: ['POST'] },
        { path: '/api/v1/blog', methods: ['GET'] },
        { path: '/api/v1/blog/submissions', methods: ['POST'] },
        { path: '/api/v1/video', methods: ['GET'] },
        { path: '/api/v1/event', methods: ['GET'] },
        { path: '/api/v1/partner', methods: ['GET'] },
        { path: '/api/v1/consultation/slots', methods: ['GET'] },
        { path: '/api/v1/consultation/book', methods: ['POST'] },
        { path: '/api/v1/consultation/bookings', methods: ['GET'] },
        { path: '/api/v1/payments/webhook', methods: ['POST'] },
        { path: '/api/v1/cases/intake', methods: ['POST'] }
    ];

    const isPublicRoute = isChatbotPublicRoute || publicRoutes.some(route => {
        const normalizedRoutePath = route.path.endsWith('/') ? route.path.slice(0, -1) : route.path;
        const matchPath =
            req.path === normalizedRoutePath ||
            req.path === normalizedRoutePath + '/' ||
            req.path.startsWith(normalizedRoutePath + '/');
        if (!matchPath) return false;
        if (!route.methods) return true;
        return route.methods.includes(req.method);
    });

    if (isPublicRoute) {
        return next();
    }

    // Apply JWT middleware for protected routes
    return jwtMiddleware(req, res, next);
};

/**
 * Setup all routes
 * @param {Express} app - Express application instance
 */
const routes = (app) => {
    // Apply JWT middleware filter to all routes
    app.use(authRouteFilter);

    // Public routes (no authentication required)
    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/contact', contactRoutes);
    app.use('/api/v1/chatbot', chatbotRoutes);
    app.use('/api/v1/consultation', consultationRoutes);
    app.use('/api/v1/settings', settingsRoutes);

    // Protected routes (require authentication)
    app.use('/api/v1/user', userRoutes);
    app.use('/api/v1/acl', aclRoutes);
    app.use('/api/v1/blog', blogRoutes);
    app.use('/api/v1/video', videoRoutes);
    app.use('/api/v1/event', eventRoutes);
    app.use('/api/v1/partner', partnerRoutes);
    app.use('/api/v1/dashboard', dashboardRoutes);

    // Patent CRM
    app.use('/api/v1/cases', caseRoutes);
    app.use('/api/v1/crm-clients', crmClientRoutes);
    app.use('/api/v1/payments', paymentRoutes);
    app.use('/api/v1/vendors', vendorRoutes);
    app.use('/api/v1/reports', reportsRoutes);
    app.use('/api/v1/deadlines', deadlineRoutes);
    app.use('/api/v1/notifications', notificationRoutes);
    app.use('/api/v1/portal', portalRoutes);
    app.use('/api/v1/documents', documentRoutes);
    app.use('/api/v1/crm-dashboard', crmDashboardRoutes);
    app.use('/api/v1/quotes', quoteRoutes);

    logger.debug('App routes setup complete.');
};

module.exports = routes;

