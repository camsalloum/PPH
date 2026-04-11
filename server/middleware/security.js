/**
 * @fileoverview Security Middleware - Helmet.js Configuration
 * @module middleware/security
 * @description Comprehensive security headers and protection using Helmet.js
 * 
 * Features:
 * - Content Security Policy (CSP)
 * - HTTP Strict Transport Security (HSTS)
 * - X-Frame-Options (Clickjacking protection)
 * - X-Content-Type-Options
 * - Referrer Policy
 * - Permissions Policy
 * 
 * @created 2024-12-06
 */

const helmet = require('helmet');
const logger = require('../utils/logger');

/**
 * Security configuration for Helmet.js
 * Customized for API server with cross-origin requirements
 */
const securityConfig = {
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval needed for ECharts
      styleSrc: ["'self'", "'unsafe-inline'"], // Ant Design CSS-in-JS needs unsafe-inline
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      workerSrc: ["'self'", 'blob:'],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },

  // HTTP Strict Transport Security (force HTTPS)
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true
  },

  // Prevent clickjacking
  frameguard: {
    action: 'deny'
  },

  // Prevent MIME type sniffing
  noSniff: true,

  // Hide X-Powered-By header
  hidePoweredBy: true,

  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false
  },

  // Download options for IE8+
  ieNoOpen: true,

  // Permissions Policy (formerly Feature Policy)
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none'
  }
};

/**
 * Development-specific security config (more permissive)
 */
const developmentSecurityConfig = {
  ...securityConfig,
  contentSecurityPolicy: false, // Disable CSP in development for easier debugging
  hsts: false // No HTTPS enforcement in development
};

/**
 * Apply security middleware to Express app
 * Different configurations for production and development
 * 
 * @param {Express.Application} app - Express app instance
 */
function applySecurityMiddleware(app) {
  const isProduction = process.env.NODE_ENV === 'production';
  const config = isProduction ? securityConfig : developmentSecurityConfig;

  // Apply Helmet middleware
  app.use(helmet(config));

  // Additional custom security headers
  app.use((req, res, next) => {
    // Prevent browser caching of sensitive API data (not static assets)
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    // Additional security headers
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    // Note: Cross-Origin-Embedder-Policy and Cross-Origin-Resource-Policy
    // are NOT set here — they break ECharts, fonts, and other resources
    // when the frontend is served by Apache and API by Express.

    next();
  });

  logger.info(`Security middleware applied (${isProduction ? 'production' : 'development'} mode)`, {
    csp: config.contentSecurityPolicy !== false,
    hsts: config.hsts !== false,
    frameguard: true,
    noSniff: true
  });
}

/**
 * CSP violation reporting endpoint
 * Logs CSP violations for monitoring
 */
function cspViolationReporter(req, res) {
  if (req.body) {
    logger.warn('CSP Violation:', {
      violation: req.body['csp-report'],
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });
  }
  res.status(204).end();
}

/**
 * Security audit middleware
 * Logs potentially dangerous requests
 */
function securityAuditMiddleware(req, res, next) {
  const suspiciousPatterns = [
    /(<script|javascript:|onerror=|onclick=)/i,  // XSS attempts
    /(union|select|insert|drop|delete|update|exec|script)/i,  // SQL injection
    /(\.\.\/|\.\.\\)/,  // Path traversal
    /(%00|%0d%0a)/i     // Null byte injection
  ];

  const checkString = `${req.originalUrl} ${JSON.stringify(req.query)} ${JSON.stringify(req.body)}`;

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(checkString)) {
      logger.warn('Suspicious request detected', {
        pattern: pattern.source,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      break;
    }
  }

  next();
}

/**
 * Rate limit security headers
 * Adds additional headers for rate-limited responses
 */
function rateLimitSecurityHeaders(req, res, next) {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    if (res.statusCode === 429) {
      res.setHeader('X-Rate-Limit-Policy', 'Too many requests');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    return originalJson(data);
  };
  
  next();
}

module.exports = {
  applySecurityMiddleware,
  cspViolationReporter,
  securityAuditMiddleware,
  rateLimitSecurityHeaders,
  securityConfig,
  developmentSecurityConfig
};
