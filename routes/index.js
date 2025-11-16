const logger = require('../utils/logger');
const config = require('../utils/config');

// Import routes
const authRoutes = require('./auth');
const userRoutes = require('./user');
const aclRoutes = require('./acl');

// JWT secrets configuration (not used directly, but kept for reference)
// JWT config is now accessed via config.jwt in middleware/auth.js

// Import JWT middleware
const jwtMiddleware = require('../middleware/auth');

/**
 * Auth route filter - routes that don't require authentication
 * These routes will bypass JWT middleware
 */
const authRouteFilter = (req, res, next) => {
    // Routes that don't require authentication
    const publicRoutes = [
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/health',
        '/api/v1/health'
    ];

    const isPublicRoute = publicRoutes.some(route => {
        return req.path === route || req.path === route + '/';
    });

    if (isPublicRoute) {
        return next(); // Skip JWT middleware for public routes
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

    // Protected routes (require authentication)
    app.use('/api/v1/user', userRoutes);
    app.use('/api/v1/acl', aclRoutes);

    logger.debug('App routes setup complete.');
};

module.exports = routes;

