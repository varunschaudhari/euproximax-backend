#!/usr/bin/env node

/**
 * Database Initialization Script
 * Inserts a test user into the database for testing purposes
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import User model
const User = require('../models/User');
const logger = require('../utils/logger');
const config = require('../utils/config');

/**
 * Connect to MongoDB
 */
const connectDB = async () => {
    let mongoURI;
    try {
        mongoURI = config.database.uri;

        if (!mongoURI) {
            logger.error('❌ MongoDB connection string is missing. Please set MONGODB_URI in your .env file');
            process.exit(1);
        }

        logger.info(`Attempting to connect to MongoDB: ${mongoURI.replace(/\/\/.*@/, '//***:***@')}`);

        const conn = await mongoose.connect(mongoURI);
        logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
        logger.info(`Database: ${conn.connection.name}`);
        return conn;
    } catch (error) {
        logger.error('❌ Error connecting to MongoDB:', error.message);

        // Provide helpful error messages
        if (error.message.includes('ECONNREFUSED')) {
            logger.error('');
            logger.error('═══════════════════════════════════════════════════════');
            logger.error('MongoDB connection refused. MongoDB is not running!');
            logger.error('═══════════════════════════════════════════════════════');
            logger.error('');
            logger.error('To fix this, start MongoDB:');
            logger.error('');
            logger.error('Option 1 - Windows Service:');
            logger.error('  1. Open Services (Win + R, type: services.msc)');
            logger.error('  2. Find "MongoDB" service');
            logger.error('  3. Right-click → Start');
            logger.error('');
            logger.error('Option 2 - Command Line (Run as Administrator):');
            logger.error('  net start MongoDB');
            logger.error('');
            logger.error('Option 3 - Manual Start:');
            logger.error('  mongod --dbpath "C:\\data\\db"');
            logger.error('  (Make sure C:\\data\\db directory exists)');
            logger.error('');
            logger.error('Option 4 - Use MongoDB Atlas (Cloud):');
            logger.error('  Update MONGODB_URI in .env file with Atlas connection string');
            logger.error('');
            if (mongoURI) {
                logger.error(`Current connection string: ${mongoURI.replace(/\/\/.*@/, '//***:***@')}`);
            } else {
                logger.error('Current connection string: Not configured (using default)');
            }
            logger.error('═══════════════════════════════════════════════════════');
            logger.error('');
        } else if (error.message.includes('authentication failed')) {
            logger.error('MongoDB authentication failed. Check your username and password.');
        } else if (error.message.includes('ENOTFOUND')) {
            logger.error('MongoDB host not found. Check your connection string.');
        }

        process.exit(1);
    }
};

/**
 * Create test user
 */
const createTestUser = async () => {
    try {
        // Test user data
        const testUserData = {
            name: 'Test User',
            email: 'test@example.com',
            mobile: '+1234567890',
            password: 'Test123' // Will be hashed by pre-save hook
        };

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [
                { email: testUserData.email },
                { mobile: testUserData.mobile }
            ]
        });

        if (existingUser) {
            logger.info('⚠️  Test user already exists:');
            logger.info(`   Email: ${existingUser.email}`);
            logger.info(`   Mobile: ${existingUser.mobile}`);
            logger.info(`   ID: ${existingUser._id}`);
            return existingUser;
        }

        // Create new test user
        const user = await User.create(testUserData);
        logger.info('✅ Test user created successfully:');
        logger.info(`   Name: ${user.name}`);
        logger.info(`   Email: ${user.email}`);
        logger.info(`   Mobile: ${user.mobile}`);
        logger.info(`   ID: ${user._id}`);
        logger.info(`   Password: ${testUserData.password} (hashed in database)`);

        return user;
    } catch (error) {
        logger.error('❌ Error creating test user:', error.message);
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            logger.error('   Validation errors:', errors.join(', '));
        }
        throw error;
    }
};

/**
 * Main initialization function
 */
const init = async () => {
    try {
        logger.info('🚀 Starting database initialization...\n');

        // Connect to database
        await connectDB();

        // Create test user
        await createTestUser();

        logger.info('\n✅ Database initialization completed successfully!');

        // Close database connection
        await mongoose.connection.close();
        logger.info('📦 Database connection closed.');

        process.exit(0);
    } catch (error) {
        logger.error('\n❌ Database initialization failed:', error.message);

        // Close database connection on error
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }

        process.exit(1);
    }
};

// Run initialization
init();

