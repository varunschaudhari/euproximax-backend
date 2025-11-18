const logger = require('../utils/logger');
const config = require('../utils/config');

// Import routes
const authRoutes = require('./auth');
const userRoutes = require('./user');
const aclRoutes = require('./acl');
const contactRoutes = require('./contact');
const projectRoutes = require('./project');

// JWT secrets configuration (not used directly, but kept for reference)
// JWT config is now accessed via config.jwt in middleware/auth.js

// Import JWT middleware
const jwtMiddleware = require('../middleware/auth');

/**
 * Auth route filter - routes that don't require authentication
 * These routes will bypass JWT middleware
 */
const authRouteFilter = (req, res, next) => {
    const publicRoutes = [
        { path: '/api/v1/auth/register' },
        { path: '/api/v1/auth/login' },
        { path: '/api/health' },
        { path: '/api/v1/health' },
        { path: '/api/v1/contact', methods: ['POST'] }
    ];

    const isPublicRoute = publicRoutes.some(route => {
        const matchPath = req.path === route.path || req.path === route.path + '/';
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

    // Protected routes (require authentication)
    app.use('/api/v1/user', userRoutes);
    app.use('/api/v1/acl', aclRoutes);
    app.use('/api/v1/project', projectRoutes);

    logger.debug('App routes setup complete.');
};

module.exports = routes;

