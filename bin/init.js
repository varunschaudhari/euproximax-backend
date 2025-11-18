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

const normalizeSeedUsers = (users) => {
    if (Array.isArray(users) && users.length) {
        return users;
    }
    if (users && typeof users === 'object' && Object.keys(users).length) {
        return [users];
    }
    return [{}];
};

const seedUsers = normalizeSeedUsers(seedData.users);

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

const upsertUserAccount = async (seedUser, index = 0) => {
    const seedUserEmail = (seedUser.email || 'admin@example.com').toLowerCase();

    let user = await User.findOne({ email: seedUserEmail });
    if (!user) {
        const fallbackMobile = seedUser.mobileNumber || seedUser.mobile || `+1000000000${index + 1}`;
        const payload = {
            name: seedUser.name || 'Admin',
            mobile: fallbackMobile,
            email: seedUserEmail,
            password: (seedUser.password && String(seedUser.password).length >= 6) ? seedUser.password : 'ChangeMe123!',
            designation: seedUser.designation || 'Founder',
            remarks: seedUser.remarks || 'Seeded superuser account'
        };
        user = await User.create(payload);
        logger.info(`👤 User inserted: ${user.email}`);
    } else {
        logger.info(`⚠️  Seed user already exists (${seedUserEmail}), skipping insert`);
    }
    return user;
};

const init = async () => {
    try {
        await connect();

        // Seed users via Mongoose model (aligns with our schema)
        const seededUsers = [];
        for (let i = 0; i < seedUsers.length; i++) {
            const userSeed = seedUsers[i];
            const userDoc = await upsertUserAccount(userSeed, i);
            if (userDoc) {
                seededUsers.push({ seed: userSeed, user: userDoc });
            }
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

        // Assign roles to each user (defaults to superuser)
        for (const entry of seededUsers) {
            const { seed, user } = entry;
            const userRoles =
                Array.isArray(seed.roles) && seed.roles.length
                    ? seed.roles
                    : ['superuser'];

            for (const roleName of userRoles) {
                const role = roleMap[roleName] || await Role.findOne({ rolename: roleName });
                if (!role) {
                    logger.warn(`⚠️  Role "${roleName}" not found, skipping assignment for ${user.email}`);
                    continue;
                }
                await ensureUserRole(user._id, role._id);
                logger.info(`🔗 Assigned role "${roleName}" to ${user.email}`);
            }
        }

        // Generate a JWT for quick testing using app secrets
        if (seededUsers.length) {
            const jwtAuth = new JwtAuth({
                JWT_SECRET: config.jwt.secret,
                JWT_PL_SECRET: config.jwt.plSecret,
                JWT_SALT: config.jwt.salt
            });

            for (const { user } of seededUsers) {
                const token = jwtAuth.generateToken(user);
                if (token) {
                    logger.info(`🪪 Test JWT (Bearer) for ${user.email}:`);
                    logger.info(token);
                }
            }
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