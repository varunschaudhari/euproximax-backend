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
    expiresIn: process.env.JWT_EXPIRE || '1d',
    algorithm: 'HS256'
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },

  // Email Configuration - Hostinger
  // Hostinger SMTP settings for custom domain emails
  mail: {
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10), // 587 for TLS, 465 for SSL
    secure: process.env.SMTP_SECURE === 'true', // false for port 587 (TLS), true for port 465 (SSL)
    auth: {
      user: process.env.SMTP_USER || 'contact@euproximax.com',
      pass: process.env.SMTP_PASS || ''
    },
    from: process.env.MAIL_FROM || 'contact@euproximax.com',
    logoUrl: process.env.LOGO_URL || 'PNG.png' // Full URL to logo for email templates
  },

  // Admin Portal Configuration
  adminPortal: {
    url: process.env.ADMIN_PORTAL_URL || process.env.ADMIN_URL || 'http://localhost:5174'
  }
};
