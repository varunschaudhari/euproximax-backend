#!/usr/bin/env node

/**
 * Password Reset Utility
 * Resets password for a user by email
 * Usage: node bin/reset-password.js <email> <new-password>
 */

const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('../utils/config');
const User = require('../models/User');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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

const resetPassword = async (email, newPassword) => {
    try {
        await connect();

        const normalizedEmail = email.toLowerCase().trim();

        // Find user
        const user = await User.findOne({ email: normalizedEmail }).select('+password');
        
        if (!user) {
            logger.error(`❌ User not found: ${normalizedEmail}`);
            await mongoose.connection.close();
            process.exit(1);
        }

        // Validate password
        if (!newPassword || newPassword.length < 6) {
            logger.error('❌ Password must be at least 6 characters long');
            await mongoose.connection.close();
            process.exit(1);
        }

        // Update password (will be hashed by pre-save hook)
        user.password = newPassword;
        await user.save();

        logger.info(`✅ Password reset successfully for: ${normalizedEmail}`);
        logger.info(`   New password: ${newPassword}`);
        
        // Verify the password works
        const isValid = await user.comparePassword(newPassword);
        if (isValid) {
            logger.info(`✅ Password verification successful`);
        } else {
            logger.warn(`⚠️  Password verification failed - this should not happen`);
        }

        await mongoose.connection.close();
        logger.info('📦 Password reset complete and connection closed.');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Password reset failed:', error.message || error);
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
        process.exit(1);
    }
};

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    logger.error('❌ Usage: node bin/reset-password.js <email> <new-password>');
    logger.info('');
    logger.info('Example:');
    logger.info('  node bin/reset-password.js varun@gmail.com Varun123');
    process.exit(1);
}

const [email, newPassword] = args;
resetPassword(email, newPassword);

