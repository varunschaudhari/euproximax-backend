#!/usr/bin/env node

/**
 * Database seed script (Mongoose + app secrets)
 * - Inserts initial user, roles, permissions, and user-role mapping
 * - Generates and prints a JWT for the seeded user using current app secrets
 */

const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const config = require('../utils/config');
const JwtAuth = require('../auth/jwt-auth');

// Models
const User = require('../models/User');
const Role = require('../models/Role');
const AclPermission = require('../models/AclPermission');
const UserRole = require('../models/UserRole');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const seedData = require('./initdb.json');

const connect = async () => {
    let mongoUri = config.database.uri;
    if (!mongoUri) {
        logger.error('❌ MongoDB connection string is missing. Set MONGODB_URI in .env');
        process.exit(1);
    }
    // Force IPv4 to avoid ::1 issues with localhost
    if (mongoUri.includes('localhost')) {
        mongoUri = mongoUri.replace('localhost', '127.0.0.1');
    }
    logger.info(`Attempting to connect to MongoDB: ${mongoUri.replace(/\/\/.*@/, '//***:***@')}`);
    await mongoose.connect(mongoUri);
    logger.info(`✅ MongoDB Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
};

const upsertRole = async (rolename) => {
    const existing = await Role.findOne({ rolename });
    if (existing) return existing;
    return await Role.create({ rolename });
};

const upsertPermission = async (roleId, type, action) => {
    const existing = await AclPermission.findOne({ roleId, type, action });
    if (existing) return existing;
    return await AclPermission.create({ roleId, type, action });
};

const ensureUserRole = async (userId, roleId) => {
    const existing = await UserRole.findOne({ userId, roleId });
    if (existing) return existing;
    return await UserRole.create({ userId, roleId });
};

const init = async () => {
    try {
        await connect();

        // Seed user via Mongoose model (aligns with our schema)
        const seedUserEmail = seedData.users.email || 'admin@example.com';
        let user = await User.findOne({ email: seedUserEmail.toLowerCase() });
        if (!user) {
            const payload = {
                name: seedData.users.name || 'Admin',
                mobile: seedData.users.mobileNumber || seedData.users.mobile || '+10000000000',
                email: seedUserEmail.toLowerCase(),
                password: (seedData.users.password && String(seedData.users.password).length >= 6) ? seedData.users.password : 'ChangeMe123!'
            };
            user = await User.create(payload);
            logger.info(`👤 User inserted: ${user.email}`);
        } else {
            logger.info('⚠️  Seed user already exists, skipping');
        }

        // Seed roles
        const roleMap = {};
        if (Array.isArray(seedData.roles)) {
            for (const role of seedData.roles) {
                const r = await upsertRole(role.rolename);
                roleMap[role.rolename] = r;
            }
            logger.info('🧩 Roles ensured');
        }

        // Seed permissions
        if (Array.isArray(seedData.permissions)) {
            for (const permission of seedData.permissions) {
                const role = roleMap[permission.rolename] || await Role.findOne({ rolename: permission.rolename });
                if (!role) continue;
                await upsertPermission(role._id, permission.type, permission.action);
            }
            logger.info('🔐 Permissions ensured');
        }

        // Assign superuser role
        const superRole = roleMap['superuser'] || await Role.findOne({ rolename: 'superuser' });
        if (superRole && user) {
            await ensureUserRole(user._id, superRole._id);
            logger.info(`🔗 Assigned role "superuser" to ${user.email}`);
        }

        // Generate a JWT for quick testing using app secrets
        const jwtAuth = new JwtAuth({
            JWT_SECRET: config.jwt.secret,
            JWT_PL_SECRET: config.jwt.plSecret,
            JWT_SALT: config.jwt.salt
        });
        const token = jwtAuth.generateToken(user);
        if (token) {
            logger.info('🪪 Test JWT (Bearer):');
            logger.info(token);
        }

        await mongoose.connection.close();
        logger.info('📦 Seed complete and connection closed.');
        process.exit(0);
    } catch (e) {
        logger.error('❌ Seed failed:', e.message || e);
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
        process.exit(1);
    }
};

init();