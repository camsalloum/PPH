/**
 * @fileoverview Rate Limiting Middleware Configuration
 * @module middleware/rateLimiter
 * @description Configures rate limiters to prevent API abuse and ensure fair resource allocation
 * 
 * @requires express-rate-limit
 * 
 * @limiters
 * - uploadLimiter: 10 requests per hour for file upload endpoints
 * - queryLimiter: 100 requests per 15 minutes for data query endpoints
 * - generalLimiter: 500 requests per 15 minutes for general API endpoints
 * 
 * @features
 * - IP-based tracking with standardHeaders (RateLimit headers)
 * - Customizable error messages per limiter type
 * - Automatic header injection for client awareness
 * - Skip successful requests option for uploads
 * 
 * @usage
 * ```javascript
 * const { uploadLimiter, queryLimiter } = require('./middleware/rateLimiter');
 * router.post('/upload', uploadLimiter, handler);
 * router.get('/data', queryLimiter, handler);
 * ```
 */

const rateLimit = require('express-rate-limit');

/**
 * Upload Rate Limiter
 * Strict limit for file upload operations to prevent storage abuse
 * 
 * @limit 10 requests per hour per IP
 * @applies POST /upload-actual, POST /upload-budget, POST /analyze-file
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 upload requests per hour
  message: {
    success: false,
    error: 'Too many upload requests from this IP, please try again after an hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip successful requests (only count failed uploads toward the limit)
  skipSuccessfulRequests: false,
  // Custom handler for when limit is exceeded
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Upload rate limit exceeded',
      message: 'Too many upload requests from this IP. Please try again after an hour.',
      retryAfter: '1 hour',
      limit: 10,
      windowMs: 3600000
    });
  }
});

/**
 * Query Rate Limiter
 * Moderate limit for data retrieval operations
 * 
 * @limit 100 requests per 15 minutes per IP
 * @applies GET /actual, GET /budget, GET /summary, POST /calculate-estimate, etc.
 */
const queryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 query requests per 15 minutes
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Query rate limit exceeded',
      message: 'Too many requests from this IP. Please try again after 15 minutes.',
      retryAfter: '15 minutes',
      limit: 100,
      windowMs: 900000
    });
  }
});

/**
 * General API Rate Limiter
 * Generous limit for general API endpoints (health checks, metadata, etc.)
 * 
 * @limit 500 requests per 15 minutes per IP
 * @applies All other endpoints not covered by specific limiters
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per 15 minutes
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: 'Too many requests from this IP. Please try again after 15 minutes.',
      retryAfter: '15 minutes',
      limit: 500,
      windowMs: 900000
    });
  }
});

/**
 * Export Rate Limiter
 * Moderate limit for export operations (CSV, Excel)
 * 
 * @limit 30 requests per 15 minutes per IP
 * @applies GET /export, GET /bulk-export/:batchId
 */
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 export requests per 15 minutes
  message: {
    success: false,
    error: 'Too many export requests from this IP, please try again after 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Export rate limit exceeded',
      message: 'Too many export requests from this IP. Please try again after 15 minutes.',
      retryAfter: '15 minutes',
      limit: 30,
      windowMs: 900000
    });
  }
});

module.exports = {
  uploadLimiter,
  queryLimiter,
  generalLimiter,
  exportLimiter
};
