const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const responsetime = require('response-time');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const passport = require('passport');
const path = require('path');

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
// Increase body size limits for file uploads (images, videos, etc.)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// CORS Configuration - Support both website and admin frontends
const allowedOrigins = [
  'http://localhost:5173', // Website (default Vite port)
  'http://localhost:5174', // Admin (custom Vite port)
  'https://euproximax.com',
  'https://www.euproximax.com',
  'https://admin.euproximax.com',
  config.website.url,
  config.adminPortal.url,
].filter(Boolean); // Remove undefined values

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow localhost origins
    if (config.server.nodeEnv !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log the rejected origin for debugging
      logger.warn(`CORS: Origin not allowed: ${origin}`);
      // Return proper CORS error instead of throwing
      callback(null, false);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

app.use(cors(corsOptions));

// Initialize Passport middleware
app.use(passport.initialize());

// Serve static files from uploads directory with CORS headers
// Use the same CORS logic as the main app to ensure consistency
app.use('/uploads', (req, res, next) => {
  const origin = req.headers.origin;
  
  // Use the same CORS origin checking logic as corsOptions
  let allowOrigin = false;
  
  // Allow requests with no origin (like direct image loads)
  if (!origin) {
    allowOrigin = true;
  } else {
    // In development, allow localhost origins
    if (config.server.nodeEnv !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        allowOrigin = true;
      }
    }
    
    // Check if origin is in allowed list (includes production URLs)
    if (allowedOrigins.includes(origin)) {
      allowOrigin = true;
    }
  }
  
  // Set CORS headers if origin is allowed
  if (allowOrigin && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // For requests without origin, set wildcard (less secure but allows direct access)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // Set Cross-Origin-Resource-Policy to allow cross-origin loading
  // Using 'cross-origin' as images are served from a different origin than the frontend
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  
  next();
}, express.static(path.join(__dirname, 'uploads')));

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
