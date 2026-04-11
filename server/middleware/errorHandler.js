const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });
  
  const statusCode = err.statusCode || err.status || 500;
  const errorResponse = {
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'An error occurred. Please try again later.'
      : err.message,
  };
  
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
  }
  
  res.status(statusCode).json(errorResponse);
};

const notFoundHandler = (req, res, next) => {
  logger.warn(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    error: 'Resource not found',
    path: req.url,
  });
};

module.exports = { errorHandler, notFoundHandler };
