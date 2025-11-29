const mongoose = require('mongoose');
const logger = require('./logger');
const config = require('./config');

/**
 * Connect to MongoDB database
 */
const connectDB = async () => {
  try {
    const mongoURI = config.database.uri;

    if (!mongoURI) {
      logger.error('MongoDB connection string is missing. Please set MONGODB_URI in your .env file');
      process.exit(1);
    }

    logger.info(`Attempting to connect to MongoDB: ${mongoURI.replace(/\/\/.*@/, '//***:***@')}`);

    const conn = await mongoose.connect(mongoURI, {
      // These options are recommended for Mongoose 6+
      // useNewUrlParser: true, // No longer needed in Mongoose 6+
      // useUnifiedTopology: true, // No longer needed in Mongoose 6+
    });

    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
    logger.info(`Database: ${conn.connection.name}`);
    return conn;
  } catch (error) {
    logger.error('❌ Error connecting to MongoDB:', error.message);

    // Provide helpful error messages
    if (error.message.includes('ECONNREFUSED')) {
      logger.error('');
      logger.error('MongoDB connection refused. Please check:');
      logger.error('1. Is MongoDB installed and running?');
      logger.error('2. Start MongoDB service: mongod (or use MongoDB as a service)');
      logger.error('3. For Windows: Check if MongoDB service is running in Services');
      logger.error('4. Verify the connection string in .env file');
      logger.error('5. Default connection: mongodb://localhost:27017/euproximax');
      logger.error('');
    } else if (error.message.includes('authentication failed')) {
      logger.error('MongoDB authentication failed. Check your username and password.');
    } else if (error.message.includes('ENOTFOUND')) {
      logger.error('MongoDB host not found. Check your connection string.');
    }

    process.exit(1);
  }
};

module.exports = connectDB;

