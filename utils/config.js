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
  },

  // Website URL Configuration
  website: {
    url: process.env.WEBSITE_URL || 'http://localhost:5173'
  },

  // Google Meet Configuration (Legacy - kept for backward compatibility)
  googleMeet: {
    baseUrl: process.env.GOOGLE_MEET_BASE_URL || 'https://meet.google.com',
    // Meeting code format: [part1]-[part2]-[part3]
    // Default: 3-4-3 format (e.g., abc-defg-hij)
    codeFormat: {
      part1Length: parseInt(process.env.GOOGLE_MEET_PART1_LENGTH || '3', 10),
      part2Length: parseInt(process.env.GOOGLE_MEET_PART2_LENGTH || '4', 10),
      part3Length: parseInt(process.env.GOOGLE_MEET_PART3_LENGTH || '3', 10)
    },
    // Character set for generating meeting codes (lowercase letters)
    characterSet: process.env.GOOGLE_MEET_CHARSET || 'abcdefghijklmnopqrstuvwxyz'
  },

  // Google Calendar API Configuration
  googleCalendar: {
    // Service Account Authentication (Recommended for server-to-server)
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'euproximax@steel-cairn-482717-e7.iam.gserviceaccount.com',
    privateKey: process.env.GOOGLE_PRIVATE_KEY || '',
    delegateUser: process.env.GOOGLE_DELEGATE_USER || null, // Optional: delegate to a user account
    
    // OAuth2 Authentication (Alternative method)
    clientId: process.env.GOOGLE_CLIENT_ID || '115059628190750064173',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    
    // Calendar Settings
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary', // 'primary' or specific calendar ID
    timezone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Kolkata'
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  }
};
