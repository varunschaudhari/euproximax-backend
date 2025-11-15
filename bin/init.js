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

/**
 * Connect to MongoDB
 */
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || process.env.DATABASE_URL;

        if (!mongoURI) {
            logger.error('❌ MongoDB connection string is missing. Please set MONGODB_URI in your .env file');
            process.exit(1);
        }

        const conn = await mongoose.connect(mongoURI);
        logger.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        logger.error('❌ Error connecting to MongoDB:', error.message);
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
            logger.log('⚠️  Test user already exists:');
            logger.log(`   Email: ${existingUser.email}`);
            logger.log(`   Mobile: ${existingUser.mobile}`);
            logger.log(`   ID: ${existingUser._id}`);
            return existingUser;
        }

        // Create new test user
        const user = await User.create(testUserData);
        logger.log('✅ Test user created successfully:');
        logger.log(`   Name: ${user.name}`);
        logger.log(`   Email: ${user.email}`);
        logger.log(`   Mobile: ${user.mobile}`);
        logger.log(`   ID: ${user._id}`);
        logger.log(`   Password: ${testUserData.password} (hashed in database)`);

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
        logger.log('🚀 Starting database initialization...\n');

        // Connect to database
        await connectDB();

        // Create test user
        await createTestUser();

        logger.log('\n✅ Database initialization completed successfully!');

        // Close database connection
        await mongoose.connection.close();
        logger.log('📦 Database connection closed.');

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

