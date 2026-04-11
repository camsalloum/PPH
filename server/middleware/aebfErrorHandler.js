/**
 * Standardized Error Handler for AEBF Routes
 * Provides consistent error responses across all AEBF endpoints
 */

const logger = require('../utils/logger');

/**
 * Error types
 */
const ErrorTypes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  FILE_ERROR: 'FILE_ERROR',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

/**
 * Standard error response structure
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, errorType = ErrorTypes.INTERNAL_ERROR, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Predefined error creators
 */
const ErrorCreators = {
  validationError: (message, details = null) => 
    new ApiError(message, 400, ErrorTypes.VALIDATION_ERROR, details),
  
  databaseError: (message, details = null) => 
    new ApiError(message, 500, ErrorTypes.DATABASE_ERROR, details),
  
  notFound: (resource, identifier = null) => 
    new ApiError(
      `${resource} not found${identifier ? `: ${identifier}` : ''}`, 
      404, 
      ErrorTypes.NOT_FOUND
    ),
  
  unauthorized: (message = 'Unauthorized access') => 
    new ApiError(message, 401, ErrorTypes.UNAUTHORIZED),
  
  forbidden: (message = 'Access forbidden') => 
    new ApiError(message, 403, ErrorTypes.FORBIDDEN),
  
  fileError: (message, details = null) => 
    new ApiError(message, 400, ErrorTypes.FILE_ERROR, details),
  
  processingError: (message, details = null) => 
    new ApiError(message, 422, ErrorTypes.PROCESSING_ERROR, details),
  
  internalError: (message = 'Internal server error', details = null) => 
    new ApiError(message, 500, ErrorTypes.INTERNAL_ERROR, details)
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Database error handler
 * Converts PostgreSQL errors to friendly messages
 */
const handleDatabaseError = (error) => {
  const code = error.code;
  const message = error.message;

  // PostgreSQL error codes
  const errorMap = {
    '23505': 'Duplicate entry - record already exists',
    '23503': 'Referenced record does not exist',
    '23502': 'Required field is missing',
    '22P02': 'Invalid data format',
    '42P01': 'Table does not exist',
    '42703': 'Column does not exist',
    '28000': 'Database authentication failed',
    '3D000': 'Database does not exist',
    '08006': 'Database connection failed',
    '57P03': 'Database server is not ready'
  };

  const friendlyMessage = errorMap[code] || 'Database operation failed';
  
  return ErrorCreators.databaseError(friendlyMessage, {
    originalError: message,
    code
  });
};

/**
 * File upload error handler
 */
const handleFileError = (error) => {
  if (error.message === 'Only Excel files are allowed') {
    return ErrorCreators.fileError('Invalid file type - only Excel files (.xlsx, .xls) are allowed');
  }
  
  if (error.code === 'LIMIT_FILE_SIZE') {
    return ErrorCreators.fileError('File size exceeds maximum limit of 50MB');
  }
  
  if (error.message.includes('No file uploaded')) {
    return ErrorCreators.fileError('No file uploaded');
  }
  
  return ErrorCreators.fileError('File upload failed', { originalError: error.message });
};

/**
 * Error response formatter
 */
const formatErrorResponse = (error, includeStack = false) => {
  const response = {
    success: false,
    error: error.message,
    errorType: error.errorType || ErrorTypes.INTERNAL_ERROR,
    timestamp: error.timestamp || new Date().toISOString()
  };

  if (error.details) {
    response.details = error.details;
  }

  if (includeStack && error.stack) {
    response.stack = error.stack;
  }

  return response;
};

/**
 * Global error handler middleware for AEBF routes
 */
const aebfErrorHandler = (error, req, res, next) => {
  // Log error
  logger.error('AEBF Error:', {
    url: req.originalUrl,
    method: req.method,
    error: error.message,
    stack: error.stack,
    body: req.body,
    query: req.query
  });

  // Handle specific error types
  let apiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error.code && error.code.startsWith('23') || error.code.startsWith('42')) {
    // PostgreSQL error
    apiError = handleDatabaseError(error);
  } else if (error.name === 'MulterError' || error.message && (error.message.includes('file') || error.code === 'LIMIT_FILE_SIZE')) {
    // File/Multer error
    apiError = handleFileError(error);
  } else if (error.name === 'ValidationError') {
    // Validation error
    apiError = ErrorCreators.validationError(error.message, error.details);
  } else {
    // Generic error
    apiError = ErrorCreators.internalError(error.message);
  }

  // Send response
  const isDevelopment = process.env.NODE_ENV === 'development';
  const response = formatErrorResponse(apiError, isDevelopment);

  res.status(apiError.statusCode).json(response);
};

/**
 * 404 handler for AEBF routes
 */
const aebfNotFoundHandler = (req, res) => {
  const error = ErrorCreators.notFound('Endpoint', req.originalUrl);
  const response = formatErrorResponse(error);
  res.status(404).json(response);
};

/**
 * Success response formatter
 */
const successResponse = (res, data, message = null, statusCode = 200) => {
  const response = {
    success: true,
    timestamp: new Date().toISOString()
  };

  if (message) {
    response.message = message;
  }

  if (data !== undefined) {
    response.data = data;
  }

  res.status(statusCode).json(response);
};

module.exports = {
  ApiError,
  ErrorTypes,
  ErrorCreators,
  asyncHandler,
  handleDatabaseError,
  handleFileError,
  formatErrorResponse,
  aebfErrorHandler,
  aebfNotFoundHandler,
  successResponse
};
