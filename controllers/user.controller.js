const User = require('../models/User');
const JwtAuth = require('../auth/jwt-auth');
const config = require('../utils/config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

// Create JwtAuth instance (singleton pattern)
const jwtAuth = new JwtAuth({
    JWT_SECRET: config.jwt.secret,
    JWT_PL_SECRET: config.jwt.plSecret,
    JWT_SALT: config.jwt.salt
});

/**
 * Register a new user
 * @route POST /api/v1/auth/register
 * @access Public
 * @param {Object} req.body - Request body containing name, mobile, email, password
 * @returns {Object} User object and JWT token
 */
const register = async (req, res, next) => {
    try {
        const { name, mobile, email, password } = req.body;

        logger.info(`Registration attempt - Email: ${email}, Mobile: ${mobile}`);

        // Check if user already exists (optimized: single query for both email and mobile)
        const existingUser = await User.findOne({
            $or: [{ email: email.toLowerCase() }, { mobile }]
        });

        if (existingUser) {
            if (existingUser.email === email.toLowerCase()) {
                logger.warn(`Registration failed - Email already exists: ${email}`);
                return next(new AppError('User with this email already exists', 400));
            }
            if (existingUser.mobile === mobile) {
                logger.warn(`Registration failed - Mobile already exists: ${mobile}`);
                return next(new AppError('User with this mobile number already exists', 400));
            }
        }

        // Create user (password will be hashed by pre-save hook)
        const user = await User.create({
            name: name.trim(),
            mobile: mobile.trim(),
            email: email.toLowerCase().trim(),
            password
        });

        logger.info(`User registered successfully - ID: ${user._id}, Email: ${user.email}`);

        // Generate JWT token
        const token = jwtAuth.generateToken(user);
        if (!token) {
            logger.error('Token generation failed for user:', user._id);
            return next(new AppError('Failed to generate authentication token', 500));
        }

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: user.toJSON(),
                token
            }
        });
    } catch (error) {
        logger.error('Registration error:', {
            error: error.message,
            stack: error.stack,
            email: req.body?.email
        });
        next(error);
    }
};

/**
 * Login user
 * @route POST /api/v1/auth/login
 * @access Public
 * @param {Object} req.body - Request body containing email and password
 * @returns {Object} User object and JWT token
 */
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        logger.info(`Login attempt - Email: ${email}`);

        // Validate input
        if (!email || !password) {
            return next(new AppError('Please provide email and password', 400));
        }

        // Find user by email and include password field
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) {
            logger.warn(`Login failed - User not found: ${email}`);
            return next(new AppError('Invalid email or password', 401));
        }

        // Verify password using the model method
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            logger.warn(`Login failed - Invalid password for email: ${email}`);
            return next(new AppError('Invalid email or password', 401));
        }

        // Update lastLogin timestamp (non-blocking)
        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        logger.info(`User logged in successfully - ID: ${user._id}, Email: ${user.email}`);

        // Generate JWT token
        const token = jwtAuth.generateToken(user);
        if (!token) {
            logger.error('Token generation failed for user:', user._id);
            return next(new AppError('Failed to generate authentication token', 500));
        }

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                user: user.toJSON(),
                token
            }
        });
    } catch (error) {
        logger.error('Login error:', {
            error: error.message,
            stack: error.stack,
            email: req.body?.email
        });
        next(error);
    }
};

/**
 * Get logged-in user profile
 * @route GET /api/v1/user/me
 * @access Private (requires JWT token)
 * @returns {Object} User object
 */
const getMe = async (req, res, next) => {
    try {
        // Get user ID from authenticated request (set by auth middleware)
        const userId = req.user?.id || req.user?._id;

        if (!userId) {
            logger.warn('GetMe failed - No user ID in request');
            return next(new AppError('User not authenticated', 401));
        }

        const user = await User.findById(userId);
        if (!user) {
            logger.warn(`GetMe failed - User not found: ${userId}`);
            return next(new AppError('User not found', 404));
        }

        logger.info(`Profile retrieved - ID: ${user._id}, Email: ${user.email}`);

        res.status(200).json({
            success: true,
            data: {
                user: user.toJSON()
            }
        });
    } catch (error) {
        logger.error('Get profile error:', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id || req.user?._id
        });
        next(error);
    }
};

module.exports = {
    register,
    login,
    getMe
};
