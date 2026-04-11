/**
 * Environment Configuration & Validation
 * Validates and exports all environment variables with defaults
 * 
 * NOTE: dotenv is loaded once in index.js, do not load again here
 */

const logger = require('../utils/logger');

// Environment detection
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// Server configuration
const SERVER_CONFIG = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')
};

// Database configuration
const DATABASE_CONFIG = {
  // Main database
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fp_database',
  
  // Auth database
  authHost: process.env.AUTH_DB_HOST || process.env.DB_HOST || 'localhost',
  authPort: parseInt(process.env.AUTH_DB_PORT || process.env.DB_PORT || '5432', 10),
  authUser: process.env.AUTH_DB_USER || process.env.DB_USER || 'postgres',
  authPassword: process.env.AUTH_DB_PASSWORD || process.env.DB_PASSWORD || '',
  authDatabase: process.env.AUTH_DB_NAME || 'auth_database',
  
  // Connection pooling
  poolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),
  poolIdleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
  poolConnectionTimeout: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '2000', 10)
};

// CORS configuration
const CORS_CONFIG = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
};

// Session configuration
const SESSION_CONFIG = {
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  cookieName: process.env.SESSION_COOKIE_NAME || 'ipdashboard.sid',
  maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10) // 24 hours
};

// File upload configuration
const UPLOAD_CONFIG = {
  maxFileSize: process.env.MAX_FILE_SIZE || '50mb',
  uploadDir: process.env.UPLOAD_DIR || 'uploads'
};

/**
 * Validate environment configuration
 * Warns about missing or insecure settings in production
 */
function validateEnvironment() {
  const warnings = [];
  const errors = [];
  
  // Production-specific validations
  if (isProduction) {
    if (!DATABASE_CONFIG.password) {
      warnings.push('Database password is empty in production!');
    }
    
    if (SESSION_CONFIG.secret === 'your-secret-key-change-in-production') {
      // Auto-generate a session secret if not set (instead of crashing)
      const crypto = require('crypto');
      SESSION_CONFIG.secret = crypto.randomBytes(32).toString('hex');
      warnings.push('SESSION_SECRET not set — auto-generated for this run. Set SESSION_SECRET in .env for persistence.');
    }
    
    if (CORS_CONFIG.origin === 'http://localhost:3000') {
      warnings.push('CORS origin is set to localhost in production!');
    }
  }
  
  // Log validation results
  if (warnings.length > 0) {
    warnings.forEach(warning => logger.warn(`⚠️  ${warning}`));
  }
  
  if (errors.length > 0) {
    errors.forEach(error => logger.error(`❌ ${error}`));
    throw new Error('Environment validation failed. Check logs for details.');
  }
  
  // Log successful validation
  if (isDevelopment) {
    logger.info('✅ Environment configuration loaded (development mode)');
  } else {
    logger.info('✅ Environment configuration validated (production mode)');
  }
}

// Export configuration
module.exports = {
  // Environment
  isProduction,
  isDevelopment,
  
  // Configs
  SERVER_CONFIG,
  DATABASE_CONFIG,
  CORS_CONFIG,
  SESSION_CONFIG,
  UPLOAD_CONFIG,
  
  // Validation
  validateEnvironment
};
