const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const responsetime = require('response-time');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const passport = require('passport');

// Load environment variables
dotenv.config();

// Import logger
const logger = require('./utils/logger');

// Import configuration
const config = require('./utils/config');

// Import database connection
const connectDB = require('./utils/db');

// Import error handler
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const routes = require('./routes');

// Connect to MongoDB
connectDB().then(async () => {
  logger.info('Connected to MongoDB');
  try {
    // Add any initialization logic here if needed
    logger.debug('Database initialization complete');
  } catch (err) {
    logger.error('Database initialization error:', err);
  }
}).catch((err) => {
  logger.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});

// Initialize Express app
const app = express();

// Middleware
app.use(responsetime());
app.use(compression());
app.use(helmet());
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));

// CORS - only in non-production
if (config.server.nodeEnv !== 'production') {
  app.use(cors());
}

app.use(express.json());

// Initialize Passport middleware
app.use(passport.initialize());

// Health check route (before routes setup)
app.get('/api/health', (req, res) => {
  logger.info('Health check requested');
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/health', (req, res) => {
  logger.info('Health check requested (v1)');
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    version: 'v1',
    timestamp: new Date().toISOString()
  });
});

// Setup all routes
routes(app);

// 404 handler - must be after all routes
app.use(notFound);

// Global error handler - must be last
app.use(errorHandler);

// Start server
const PORT = config.server.port;

app.listen(PORT, async () => {
  logger.info('Server has started!');
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Environment: ${config.server.nodeEnv}`);
});

module.exports = app;
