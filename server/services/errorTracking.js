/**
 * @fileoverview Error Tracking and Reporting Service
 * @module services/errorTracking
 * @description Centralized error tracking, logging, and alerting
 * 
 * Features:
 * - Error categorization and severity levels
 * - Error aggregation and deduplication
 * - Alert thresholds
 * - Error rate monitoring
 * - Integration ready for Sentry/DataDog
 * 
 * @created 2024-12-06
 */

const logger = require('../utils/logger');

/**
 * Error severity levels
 */
const ErrorSeverity = {
  LOW: 'low',           // Minor issues, no user impact
  MEDIUM: 'medium',     // Some user impact, degraded performance
  HIGH: 'high',         // Significant user impact
  CRITICAL: 'critical'  // System down, data loss risk
};

/**
 * Error categories
 */
const ErrorCategory = {
  DATABASE: 'database',
  AUTHENTICATION: 'authentication',
  VALIDATION: 'validation',
  EXTERNAL_API: 'external_api',
  FILE_SYSTEM: 'file_system',
  NETWORK: 'network',
  BUSINESS_LOGIC: 'business_logic',
  UNKNOWN: 'unknown'
};

/**
 * Error tracking state
 */
const errorState = {
  errors: [],
  errorCounts: {},
  lastErrorTime: {},
  alertThresholds: {
    [ErrorSeverity.CRITICAL]: 1,  // Alert on first critical error
    [ErrorSeverity.HIGH]: 5,       // Alert after 5 high errors
    [ErrorSeverity.MEDIUM]: 20,    // Alert after 20 medium errors
    [ErrorSeverity.LOW]: 50        // Alert after 50 low errors
  },
  maxStoredErrors: 1000,
  errorWindow: 3600000 // 1 hour in milliseconds
};

/**
 * Categorize error based on message and stack
 * 
 * @param {Error} error - Error object
 * @returns {string} Error category
 */
function categorizeError(error) {
  const message = error.message?.toLowerCase() || '';
  const stack = error.stack?.toLowerCase() || '';
  
  if (message.includes('database') || message.includes('postgres') || message.includes('sql')) {
    return ErrorCategory.DATABASE;
  }
  if (message.includes('auth') || message.includes('token') || message.includes('unauthorized')) {
    return ErrorCategory.AUTHENTICATION;
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorCategory.VALIDATION;
  }
  if (message.includes('enoent') || message.includes('file') || message.includes('directory')) {
    return ErrorCategory.FILE_SYSTEM;
  }
  if (message.includes('network') || message.includes('econnrefused') || message.includes('timeout')) {
    return ErrorCategory.NETWORK;
  }
  if (message.includes('fetch') || message.includes('api') || message.includes('request')) {
    return ErrorCategory.EXTERNAL_API;
  }
  
  return ErrorCategory.UNKNOWN;
}

/**
 * Determine error severity
 * 
 * @param {Error} error - Error object
 * @param {string} category - Error category
 * @returns {string} Severity level
 */
function determineSeverity(error, category) {
  const message = error.message?.toLowerCase() || '';
  
  // Critical errors
  if (message.includes('out of memory') || 
      message.includes('segfault') ||
      message.includes('fatal')) {
    return ErrorSeverity.CRITICAL;
  }
  
  // High severity
  if (category === ErrorCategory.DATABASE && message.includes('connection')) {
    return ErrorSeverity.HIGH;
  }
  if (category === ErrorCategory.AUTHENTICATION && message.includes('failed')) {
    return ErrorSeverity.HIGH;
  }
  
  // Medium severity
  if (category === ErrorCategory.EXTERNAL_API) {
    return ErrorSeverity.MEDIUM;
  }
  if (category === ErrorCategory.FILE_SYSTEM) {
    return ErrorSeverity.MEDIUM;
  }
  
  // Low severity (validation, business logic)
  return ErrorSeverity.LOW;
}

/**
 * Generate error fingerprint for deduplication
 * 
 * @param {Error} error - Error object
 * @returns {string} Error fingerprint
 */
function generateFingerprint(error) {
  const message = error.message || 'unknown';
  const firstLine = error.stack?.split('\n')[1] || '';
  return `${error.name}:${message}:${firstLine}`;
}

/**
 * Track and log error
 * 
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 * @returns {Object} Tracked error details
 */
function trackError(error, context = {}) {
  const timestamp = new Date().toISOString();
  const category = categorizeError(error);
  const severity = determineSeverity(error, category);
  const fingerprint = generateFingerprint(error);
  
  const trackedError = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp,
    name: error.name,
    message: error.message,
    stack: error.stack,
    category,
    severity,
    fingerprint,
    context,
    userAgent: context.userAgent || null,
    ip: context.ip || null,
    userId: context.userId || null,
    endpoint: context.endpoint || null,
    method: context.method || null
  };
  
  // Store error
  errorState.errors.unshift(trackedError);
  
  // Trim old errors
  if (errorState.errors.length > errorState.maxStoredErrors) {
    errorState.errors = errorState.errors.slice(0, errorState.maxStoredErrors);
  }
  
  // Update counts
  const countKey = `${category}:${severity}`;
  errorState.errorCounts[countKey] = (errorState.errorCounts[countKey] || 0) + 1;
  errorState.errorCounts[fingerprint] = (errorState.errorCounts[fingerprint] || 0) + 1;
  errorState.lastErrorTime[fingerprint] = Date.now();
  
  // Log based on severity
  const logData = {
    category,
    severity,
    fingerprint,
    ...context
  };
  
  switch (severity) {
    case ErrorSeverity.CRITICAL:
      logger.error(`🚨 CRITICAL ERROR: ${error.message}`, logData);
      checkAlertThresholds(severity, countKey);
      break;
    case ErrorSeverity.HIGH:
      logger.error(`⚠️  HIGH SEVERITY: ${error.message}`, logData);
      checkAlertThresholds(severity, countKey);
      break;
    case ErrorSeverity.MEDIUM:
      logger.warn(`⚠️  MEDIUM SEVERITY: ${error.message}`, logData);
      break;
    case ErrorSeverity.LOW:
      logger.info(`ℹ️  LOW SEVERITY: ${error.message}`, logData);
      break;
  }
  
  return trackedError;
}

/**
 * Check if error count exceeds alert thresholds
 * 
 * @param {string} severity - Error severity
 * @param {string} countKey - Count key
 */
function checkAlertThresholds(severity, countKey) {
  const count = errorState.errorCounts[countKey];
  const threshold = errorState.alertThresholds[severity];
  
  if (count >= threshold && count % threshold === 0) {
    logger.error(`🚨 ALERT: ${severity} errors exceeded threshold`, {
      count,
      threshold,
      category: countKey
    });
    
    // Here you would integrate with alerting system (PagerDuty, Slack, etc.)
    // sendAlert(severity, count, countKey);
  }
}

/**
 * Get error statistics
 * 
 * @returns {Object} Error statistics
 */
function getErrorStats() {
  const now = Date.now();
  const windowStart = now - errorState.errorWindow;
  
  // Filter errors in time window
  const recentErrors = errorState.errors.filter(
    err => new Date(err.timestamp).getTime() > windowStart
  );
  
  // Group by category
  const byCategory = recentErrors.reduce((acc, err) => {
    acc[err.category] = (acc[err.category] || 0) + 1;
    return acc;
  }, {});
  
  // Group by severity
  const bySeverity = recentErrors.reduce((acc, err) => {
    acc[err.severity] = (acc[err.severity] || 0) + 1;
    return acc;
  }, {});
  
  // Top errors by fingerprint
  const fingerprintCounts = recentErrors.reduce((acc, err) => {
    acc[err.fingerprint] = (acc[err.fingerprint] || 0) + 1;
    return acc;
  }, {});
  
  const topErrors = Object.entries(fingerprintCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([fingerprint, count]) => {
      const error = recentErrors.find(e => e.fingerprint === fingerprint);
      return {
        fingerprint,
        count,
        message: error?.message,
        category: error?.category,
        severity: error?.severity,
        lastOccurrence: error?.timestamp
      };
    });
  
  return {
    totalErrors: recentErrors.length,
    timeWindow: '1 hour',
    byCategory,
    bySeverity,
    topErrors,
    errorRate: (recentErrors.length / (errorState.errorWindow / 1000 / 60)).toFixed(2) + ' errors/min'
  };
}

/**
 * Get recent errors
 * 
 * @param {Object} options - Filter options
 * @returns {Array} Recent errors
 */
function getRecentErrors(options = {}) {
  const {
    limit = 50,
    category = null,
    severity = null,
    since = Date.now() - errorState.errorWindow
  } = options;
  
  let filtered = errorState.errors.filter(
    err => new Date(err.timestamp).getTime() > since
  );
  
  if (category) {
    filtered = filtered.filter(err => err.category === category);
  }
  
  if (severity) {
    filtered = filtered.filter(err => err.severity === severity);
  }
  
  return filtered.slice(0, limit);
}

/**
 * Clear old errors (cleanup)
 */
function clearOldErrors() {
  const now = Date.now();
  const cutoff = now - (errorState.errorWindow * 24); // Keep 24 hours
  
  errorState.errors = errorState.errors.filter(
    err => new Date(err.timestamp).getTime() > cutoff
  );
  
  logger.info('Cleared old errors', {
    remaining: errorState.errors.length
  });
}

/**
 * Express error tracking middleware
 */
function errorTrackingMiddleware(err, req, res, next) {
  const context = {
    endpoint: req.originalUrl,
    method: req.method,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    userId: req.user?.id,
    body: req.body,
    query: req.query
  };
  
  trackError(err, context);
  next(err);
}

// Cleanup old errors every hour
const errorCleanupInterval = setInterval(clearOldErrors, 3600000);
if (typeof errorCleanupInterval.unref === 'function') errorCleanupInterval.unref();

module.exports = {
  trackError,
  getErrorStats,
  getRecentErrors,
  errorTrackingMiddleware,
  ErrorSeverity,
  ErrorCategory,
  errorState
};
