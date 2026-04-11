/**
 * @fileoverview Request Correlation Middleware
 * @module middleware/correlation
 * @description Adds correlation IDs to all requests for tracing
 * 
 * Features:
 * - Unique correlation ID per request
 * - Request tracing across services
 * - Structured logging with correlation
 * - Async context propagation
 * 
 * @created 2024-12-06
 */

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

// Async local storage for correlation context
const correlationStorage = new AsyncLocalStorage();

/**
 * Generate a unique correlation ID
 * Format: timestamp-random (e.g., 1701865200000-a1b2c3d4)
 * 
 * @returns {string} Unique correlation ID
 */
function generateCorrelationId() {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * Get current correlation context
 * 
 * @returns {Object|null} Current correlation context or null
 */
function getCorrelationContext() {
  return correlationStorage.getStore() || null;
}

/**
 * Get current correlation ID
 * 
 * @returns {string|null} Current correlation ID or null
 */
function getCorrelationId() {
  const context = getCorrelationContext();
  return context?.correlationId || null;
}

/**
 * Run a function with correlation context
 * 
 * @param {Object} context - Correlation context
 * @param {Function} fn - Function to run
 * @returns {*} Function result
 */
function runWithCorrelation(context, fn) {
  return correlationStorage.run(context, fn);
}

/**
 * Correlation middleware
 * Adds correlation ID to request and sets up async context
 */
function correlationMiddleware(req, res, next) {
  // Check for incoming correlation ID (from upstream services)
  const incomingId = req.headers['x-correlation-id'] || 
                     req.headers['x-request-id'] ||
                     req.query._correlationId;
  
  // Use incoming or generate new
  const correlationId = incomingId || generateCorrelationId();
  
  // Create correlation context
  const context = {
    correlationId,
    requestId: generateCorrelationId(), // Always unique per request
    startTime: Date.now(),
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  };
  
  // Attach to request
  req.correlationId = correlationId;
  req.correlationContext = context;
  
  // Set response header
  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Request-ID', context.requestId);
  
  // Run remaining middleware with correlation context
  correlationStorage.run(context, () => {
    // Add timing on response finish
    res.on('finish', () => {
      const duration = Date.now() - context.startTime;
      context.duration = duration;
      context.statusCode = res.statusCode;
    });
    
    next();
  });
}

/**
 * Enhanced logger wrapper with correlation
 * Automatically adds correlation ID to log entries
 * 
 * @param {Object} logger - Winston logger instance
 * @returns {Object} Enhanced logger
 */
function createCorrelatedLogger(logger) {
  const methods = ['error', 'warn', 'info', 'debug', 'verbose', 'silly'];
  const correlatedLogger = {};
  
  methods.forEach(method => {
    correlatedLogger[method] = (message, meta = {}) => {
      const context = getCorrelationContext();
      const enhancedMeta = {
        ...meta,
        correlationId: context?.correlationId || 'no-correlation',
        requestId: context?.requestId
      };
      
      logger[method](message, enhancedMeta);
    };
  });
  
  // Keep original logger methods available
  correlatedLogger.original = logger;
  
  return correlatedLogger;
}

/**
 * Request summary logger
 * Logs a summary of each request
 * 
 * @param {Object} logger - Logger instance
 */
function requestSummaryMiddleware(logger) {
  return (req, res, next) => {
    res.on('finish', () => {
      const context = req.correlationContext;
      if (!context) return;
      
      const summary = {
        correlationId: context.correlationId,
        method: context.method,
        path: context.path,
        statusCode: res.statusCode,
        duration: `${Date.now() - context.startTime}ms`,
        ip: context.ip,
        userAgent: context.userAgent?.slice(0, 50)
      };
      
      // Log based on status code
      if (res.statusCode >= 500) {
        logger.error('Request completed with server error', summary);
      } else if (res.statusCode >= 400) {
        logger.warn('Request completed with client error', summary);
      } else {
        logger.info('Request completed', summary);
      }
    });
    
    next();
  };
}

/**
 * Get correlation headers for outgoing requests
 * Use when making HTTP calls to other services
 * 
 * @returns {Object} Headers with correlation info
 */
function getCorrelationHeaders() {
  const context = getCorrelationContext();
  return {
    'X-Correlation-ID': context?.correlationId || generateCorrelationId(),
    'X-Request-ID': context?.requestId || generateCorrelationId(),
    'X-Forwarded-For': context?.ip
  };
}

module.exports = {
  correlationMiddleware,
  generateCorrelationId,
  getCorrelationId,
  getCorrelationContext,
  runWithCorrelation,
  createCorrelatedLogger,
  requestSummaryMiddleware,
  getCorrelationHeaders
};
