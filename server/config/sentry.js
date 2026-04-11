/**
 * Sentry Integration Configuration
 * Production error tracking and performance monitoring
 * 
 * Setup Instructions:
 * 1. Create account at https://sentry.io
 * 2. Create new Node.js project
 * 3. Copy DSN to environment variable SENTRY_DSN
 * 4. npm install @sentry/node (when ready to enable)
 */

// Lazy load Sentry to avoid breaking when not installed
let Sentry = null;
let isInitialized = false;

/**
 * Initialize Sentry error tracking
 * Safe to call multiple times - will only initialize once
 * @param {Object} options - Sentry configuration options
 */
function initSentry(options = {}) {
  if (isInitialized) {
    return;
  }
  
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    console.log('ℹ️  Sentry DSN not configured - error tracking disabled');
    return;
  }
  
  try {
    // Dynamic import to avoid errors when @sentry/node not installed
    Sentry = require('@sentry/node');
    
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.npm_package_version || '1.0.0',
      
      // Performance Monitoring
      tracesSampleRate: options.tracesSampleRate || 0.1, // 10% of transactions
      
      // Error filtering
      beforeSend(event, hint) {
        // Don't send errors in test environment
        if (process.env.NODE_ENV === 'test') {
          return null;
        }
        
        // Filter out known non-critical errors
        const error = hint.originalException;
        if (error?.message?.includes('ECONNREFUSED')) {
          // Database connection errors - log locally, don't flood Sentry
          return null;
        }
        
        return event;
      },
      
      // Sensitive data scrubbing
      beforeBreadcrumb(breadcrumb) {
        // Remove sensitive data from breadcrumbs
        if (breadcrumb.category === 'http') {
          if (breadcrumb.data?.url?.includes('/auth/')) {
            breadcrumb.data.body = '[REDACTED]';
          }
        }
        return breadcrumb;
      },
      
      // Additional options
      maxBreadcrumbs: 50,
      attachStacktrace: true,
      
      ...options
    });
    
    isInitialized = true;
    console.log('✅ Sentry initialized successfully');
    
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('ℹ️  @sentry/node not installed - run: npm install @sentry/node');
    } else {
      console.error('Failed to initialize Sentry:', error.message);
    }
  }
}

/**
 * Capture an exception and send to Sentry
 * @param {Error} error - The error to capture
 * @param {Object} context - Additional context
 */
function captureException(error, context = {}) {
  // Always log locally
  console.error('Error captured:', error.message);
  
  if (!Sentry || !isInitialized) {
    return;
  }
  
  Sentry.withScope((scope) => {
    // Add extra context
    if (context.user) {
      scope.setUser({
        id: context.user.id,
        email: context.user.email,
        role: context.user.role
      });
    }
    
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    
    if (context.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    
    // Set error level
    if (context.level) {
      scope.setLevel(context.level);
    }
    
    Sentry.captureException(error);
  });
}

/**
 * Capture a message (non-error event)
 * @param {string} message - The message to capture
 * @param {string} level - Severity level (info, warning, error)
 */
function captureMessage(message, level = 'info') {
  if (!Sentry || !isInitialized) {
    console.log(`[${level.toUpperCase()}] ${message}`);
    return;
  }
  
  Sentry.captureMessage(message, level);
}

/**
 * Add breadcrumb for debugging
 * @param {Object} breadcrumb - Breadcrumb data
 */
function addBreadcrumb(breadcrumb) {
  if (!Sentry || !isInitialized) {
    return;
  }
  
  Sentry.addBreadcrumb({
    timestamp: Date.now() / 1000,
    ...breadcrumb
  });
}

/**
 * Set user context for error tracking
 * @param {Object} user - User information
 */
function setUser(user) {
  if (!Sentry || !isInitialized) {
    return;
  }
  
  Sentry.setUser(user ? {
    id: user.id,
    email: user.email,
    role: user.role
  } : null);
}

/**
 * Express error handler middleware for Sentry
 * Should be added after all routes but before other error handlers
 */
function sentryErrorHandler() {
  if (!Sentry || !isInitialized) {
    return (err, req, res, next) => next(err);
  }
  
  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Capture all 5xx errors
      if (error.status >= 500) {
        return true;
      }
      // Also capture 4xx errors that might indicate issues
      if (error.status === 401 || error.status === 403) {
        return true;
      }
      return false;
    }
  });
}

/**
 * Express request handler middleware for Sentry
 * Should be added at the beginning of middleware chain
 */
function sentryRequestHandler() {
  if (!Sentry || !isInitialized) {
    return (req, res, next) => next();
  }
  
  return Sentry.Handlers.requestHandler({
    // Options
    request: ['headers', 'method', 'url', 'query_string'],
    user: ['id', 'email', 'role']
  });
}

/**
 * Start a performance transaction
 * @param {string} name - Transaction name
 * @param {string} op - Operation type
 * @returns {Object|null} Transaction object or null
 */
function startTransaction(name, op) {
  if (!Sentry || !isInitialized) {
    return null;
  }
  
  return Sentry.startTransaction({
    name,
    op
  });
}

/**
 * Flush pending events (useful before shutdown)
 * @param {number} timeout - Timeout in milliseconds
 */
async function flush(timeout = 2000) {
  if (!Sentry || !isInitialized) {
    return;
  }
  
  await Sentry.flush(timeout);
}

/**
 * Close Sentry client (for graceful shutdown)
 * @param {number} timeout - Timeout in milliseconds
 */
async function close(timeout = 2000) {
  if (!Sentry || !isInitialized) {
    return;
  }
  
  await Sentry.close(timeout);
}

module.exports = {
  initSentry,
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  sentryErrorHandler,
  sentryRequestHandler,
  startTransaction,
  flush,
  close,
  get isInitialized() {
    return isInitialized;
  }
};
