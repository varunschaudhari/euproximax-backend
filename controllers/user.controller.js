const User = require('../models/User');
const Role = require('../models/Role');
const UserRole = require('../models/UserRole');
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

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ACTIVE_USER_CONDITION = {
    $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }]
};

const withActiveFilter = (filter = {}) => ({
    $and: [filter, ACTIVE_USER_CONDITION]
});

/**
 * Register a new user
 * @route POST /api/v1/auth/register
 * @access Public
 * @param {Object} req.body - Request body containing name, mobile, email, password, designation, remarks
 * @returns {Object} User object and JWT token
 */
const register = async (req, res, next) => {
    try {
        const { name, mobile, email, password, designation, remarks } = req.body;

        logger.info(`Registration attempt - Email: ${email}, Mobile: ${mobile}`);

        // Check if user already exists (optimized: single query for both email and mobile)
        const existingUser = await User.findOne(
            withActiveFilter({
                $or: [{ email: email.toLowerCase() }, { mobile }]
            })
        );

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
            password,
            designation: designation?.trim() || undefined,
            remarks: remarks?.trim() || undefined
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
        const user = await User.findOne(withActiveFilter({ email: email.toLowerCase() })).select('+password');
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

        const user = await User.findOne(withActiveFilter({ _id: userId }));
        if (!user) {
            logger.warn(`GetMe failed - User not found: ${userId}`);
            return next(new AppError('User not found', 404));
        }

        // Get user roles
        const UserRole = require('../models/UserRole');
        const Role = require('../models/Role');
        const userRoles = await UserRole.find({ userId: user._id }).lean();
        const roleIds = userRoles.map(ur => ur.roleId);
        const roles = await Role.find({ _id: { $in: roleIds } }).select('rolename').lean();
        const roleNames = roles.map(r => r.rolename);

        logger.info(`Profile retrieved - ID: ${user._id}, Email: ${user.email}`);

        res.status(200).json({
            success: true,
            data: {
                user: {
                    ...user.toJSON(),
                    roles: roleNames
                }
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

/**
 * Get paginated list of users (admin)
 * @route GET /api/v1/user
 * @access Private
 */
const getUsers = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
        const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const roleParam = typeof req.query.role === 'string' ? req.query.role.trim() : '';
        const skip = (page - 1) * limit;

        const emptyResponse = () =>
            res.status(200).json({
                success: true,
                message: 'Users fetched successfully',
                data: {
                    users: [],
                    page,
                    limit,
                    total: 0,
                    totalPages: 1
                }
            });

        const searchFilter = searchTerm
            ? {
                $or: [
                    { name: new RegExp(escapeRegex(searchTerm), 'i') },
                    { email: new RegExp(escapeRegex(searchTerm), 'i') },
                    { mobile: new RegExp(escapeRegex(searchTerm), 'i') }
                ]
            }
            : {};

        let roleFilterCondition = null;
        if (roleParam) {
            const role = await Role.findOne({
                rolename: new RegExp(`^${escapeRegex(roleParam)}$`, 'i')
            });

            if (!role) {
                return emptyResponse();
            }

            const roleAssignments = await UserRole.find({ roleId: role._id }, 'userId');
            const userIds = roleAssignments.map((entry) => entry.userId);

            if (userIds.length === 0) {
                return emptyResponse();
            }

            roleFilterCondition = { _id: { $in: userIds } };
        }

        const filters = [ACTIVE_USER_CONDITION];
        if (Object.keys(searchFilter).length) {
            filters.push(searchFilter);
        }
        if (roleFilterCondition) {
            filters.push(roleFilterCondition);
        }

        const filter =
            filters.length > 1
                ? {
                    $and: filters
                }
                : filters[0];

        const [users, total] = await Promise.all([
            User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            User.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            message: 'Users fetched successfully',
            data: {
                users,
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        });
    } catch (error) {
        logger.error('Fetch users error:', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id || req.user?._id
        });
        next(error);
    }
};

/**
 * Get single user details
 * @route GET /api/v1/user/:id
 * @access Private
 */
const getUserById = async (req, res, next) => {
    try {
        const userId = req.params.id;

        const user = await User.findById(userId);
        if (!user || user.isDeleted) {
            return next(new AppError('User not found', 404));
        }

        const roles = await UserRole.find({ userId: user._id }).populate('roleId', 'rolename');
        const roleDetails = roles.map((entry) => ({
            _id: entry.roleId?._id,
            rolename: entry.roleId?.rolename
        }));

        res.status(200).json({
            success: true,
            message: 'User fetched successfully',
            data: {
                user: user.toJSON(),
                roles: roleDetails
            }
        });
    } catch (error) {
        logger.error('Fetch user detail error:', {
            error: error.message,
            stack: error.stack,
            userId: req.params.id
        });
        next(error);
    }
};

/**
 * Update user details
 * @route PUT /api/v1/user/:id
 * @access Private
 */
const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, mobile, email, designation, remarks, roles } = req.body;
        const normalizedEmail = email?.toLowerCase().trim();
        const normalizedMobile = mobile?.trim();

        const user = await User.findById(id);
        if (!user || user.isDeleted) {
            return next(new AppError('User not found', 404));
        }

        if (normalizedEmail && normalizedEmail !== user.email) {
            const existingEmail = await User.findOne({ email: normalizedEmail });
            if (existingEmail) {
                return next(new AppError('User with this email already exists', 400));
            }
            user.email = normalizedEmail;
        }

        if (normalizedMobile && normalizedMobile !== user.mobile) {
            const existingMobile = await User.findOne({ mobile: normalizedMobile });
            if (existingMobile) {
                return next(new AppError('User with this mobile number already exists', 400));
            }
            user.mobile = normalizedMobile;
        }

        if (name) user.name = name.trim();
        if (designation !== undefined) user.designation = designation?.trim() || undefined;
        if (remarks !== undefined) user.remarks = remarks?.trim() || undefined;

        await user.save();

        let updatedRoles = [];
        if (Array.isArray(roles)) {
            const validRoles = await Role.find({ _id: { $in: roles } }, '_id rolename');
            updatedRoles = validRoles.map((role) => role._id.toString());

            await UserRole.deleteMany({ userId: user._id });

            const userRoleDocuments = validRoles.map((role) => ({
                userId: user._id,
                roleId: role._id
            }));

            if (userRoleDocuments.length > 0) {
                await UserRole.insertMany(userRoleDocuments, { ordered: false });
            }
        }

        res.status(200).json({
            success: true,
            message: 'User updated successfully',
            data: {
                user: user.toJSON(),
                roles: updatedRoles
            }
        });
    } catch (error) {
        logger.error('Update user error:', {
            error: error.message,
            stack: error.stack,
            userId: req.params.id
        });
        next(error);
    }
};
/**
 * Create user via admin module
 * @route POST /api/v1/user
 * @access Private
 */
const createUser = async (req, res, next) => {
    try {
        const { name, mobile, email, password, designation, remarks, roles } = req.body;
        const normalizedEmail = email.toLowerCase().trim();
        const normalizedMobile = mobile.trim();
        const requestedRoleIds = Array.isArray(roles)
            ? roles.filter((roleId) => typeof roleId === 'string' && roleId.trim().length > 0)
            : [];

        logger.info(`Admin creating user - Email: ${normalizedEmail}, Mobile: ${normalizedMobile}`);

        const existingUser = await User.findOne({
            $or: [{ email: normalizedEmail }, { mobile: normalizedMobile }]
        });

        if (existingUser) {
            if (existingUser.email === normalizedEmail) {
                return next(new AppError('User with this email already exists', 400));
            }
            if (existingUser.mobile === normalizedMobile) {
                return next(new AppError('User with this mobile number already exists', 400));
            }
        }

        const user = await User.create({
            name: name.trim(),
            mobile: normalizedMobile,
            email: normalizedEmail,
            password,
            designation: designation?.trim() || undefined,
            remarks: remarks?.trim() || undefined
        });

        logger.info(`User created via admin module - ID: ${user._id}, Email: ${user.email}`);

        let assignedRoleIds = [];
        if (requestedRoleIds.length > 0) {
            const validRoles = await Role.find({ _id: { $in: requestedRoleIds } }, '_id rolename');
            assignedRoleIds = validRoles.map((role) => role._id.toString());

            if (validRoles.length > 0) {
                const userRoleDocuments = validRoles.map((role) => ({
                    userId: user._id,
                    roleId: role._id
                }));

                try {
                    await UserRole.insertMany(userRoleDocuments, { ordered: false });
                } catch (roleError) {
                    if (roleError.code !== 11000) {
                        throw roleError;
                    }
                }
            }
        }

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: {
                user: {
                    ...user.toJSON(),
                    roles: assignedRoleIds
                }
            }
        });
    } catch (error) {
        logger.error('Admin create user error:', {
            error: error.message,
            stack: error.stack,
            email: req.body?.email
        });
        next(error);
    }
};

/**
 * Soft delete user
 * @route DELETE /api/v1/user/:id
 * @access Private
 */
const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);
        if (!user || user.isDeleted) {
            return next(new AppError('User not found', 404));
        }

        user.isDeleted = true;
        await user.save({ validateBeforeSave: false });
        await UserRole.deleteMany({ userId: user._id });

        res.status(200).json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        logger.error('Delete user error:', {
            error: error.message,
            stack: error.stack,
            userId: req.params.id
        });
        next(error);
    }
};

module.exports = {
    register,
    login,
    getMe,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    createUser
};
