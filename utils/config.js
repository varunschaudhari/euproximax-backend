/**
 * Application Configuration
 * Centralized configuration for all application settings
 */
module.exports = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    apiVersion: process.env.API_VERSION || 'v1'
  },

  // Database Configuration
  database: {
    uri: process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/euproximax',
    options: {
      // Mongoose connection options can be added here if needed
    }
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-key-change-in-production',
    plSecret: process.env.JWT_PL_SECRET || 'default-payload-secret-key-change-in-production',
    salt: process.env.JWT_SALT || 'default-salt-change-in-production',
    expiresIn: process.env.JWT_EXPIRE || '7d',
    algorithm: 'HS256'
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};
