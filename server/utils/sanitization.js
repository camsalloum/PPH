/**
 * @fileoverview Input Sanitization Utilities
 * @module utils/sanitization
 * @description Comprehensive input sanitization to prevent injection attacks
 * 
 * Features:
 * - SQL injection prevention
 * - XSS prevention
 * - Path traversal prevention
 * - Command injection prevention
 * - NoSQL injection prevention
 * 
 * @created 2024-12-06
 */

const logger = require('./logger');

/**
 * Sanitize string input for SQL queries
 * Removes or escapes dangerous SQL characters
 * 
 * @param {string} input - User input string
 * @returns {string} Sanitized string
 */
function sanitizeSQLInput(input) {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove SQL comment markers
  let sanitized = input
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/;/g, '');

  // Escape single quotes (but allow them for valid input)
  sanitized = sanitized.replace(/'/g, "''");

  return sanitized;
}

/**
 * Sanitize HTML input to prevent XSS
 * Removes dangerous HTML tags and attributes
 * 
 * @param {string} input - User input with potential HTML
 * @returns {string} Sanitized string
 */
function sanitizeHTML(input) {
  if (typeof input !== 'string') {
    return input;
  }

  const dangerousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers like onclick, onerror
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^>]*>/gi,
    /<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi
  ];

  let sanitized = input;
  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Encode remaining special characters
  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  return sanitized;
}

/**
 * Sanitize file paths to prevent path traversal
 * Removes ../ and absolute path indicators
 * 
 * @param {string} path - User-provided file path
 * @returns {string} Sanitized path
 */
function sanitizeFilePath(path) {
  if (typeof path !== 'string') {
    return path;
  }

  // Remove path traversal attempts
  let sanitized = path
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    .replace(/\.\.$/g, '')
    .replace(/^\//, '') // Remove leading slash (absolute path)
    .replace(/^[A-Za-z]:/g, ''); // Remove Windows drive letters

  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, '/');

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  return sanitized;
}

/**
 * Sanitize command input to prevent command injection
 * Removes shell metacharacters
 * 
 * @param {string} input - User input that might be used in commands
 * @returns {string} Sanitized string
 */
function sanitizeCommandInput(input) {
  if (typeof input !== 'string') {
    return input;
  }

  const dangerousChars = [
    ';', '|', '&', '$', '`', '\n', '\r',
    '>', '<', '(', ')', '{', '}', '[', ']',
    '!', '*', '?', '~'
  ];

  let sanitized = input;
  for (const char of dangerousChars) {
    sanitized = sanitized.replace(new RegExp('\\' + char, 'g'), '');
  }

  return sanitized;
}

/**
 * Sanitize NoSQL query input (MongoDB, etc.)
 * Removes $ operators and other dangerous patterns
 * 
 * @param {any} input - User input for NoSQL query
 * @returns {any} Sanitized input
 */
function sanitizeNoSQLInput(input) {
  if (typeof input === 'string') {
    // Remove NoSQL operators
    return input.replace(/\$/g, '');
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      // Skip keys starting with $
      if (!key.startsWith('$')) {
        sanitized[key] = sanitizeNoSQLInput(value);
      } else {
        logger.warn('Blocked NoSQL injection attempt', { key, value });
      }
    }
    return sanitized;
  }

  return input;
}

/**
 * Validate and sanitize email address
 * 
 * @param {string} email - Email address to validate
 * @returns {string|null} Sanitized email or null if invalid
 */
function sanitizeEmail(email) {
  if (typeof email !== 'string') {
    return null;
  }

  // Basic email regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  const trimmed = email.trim().toLowerCase();
  
  if (!emailRegex.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Sanitize numeric input
 * Ensures input is a valid number within optional range
 * 
 * @param {any} input - Input to sanitize
 * @param {Object} options - Options {min, max, default}
 * @returns {number} Sanitized number
 */
function sanitizeNumber(input, options = {}) {
  const { min = -Infinity, max = Infinity, default: defaultValue = 0 } = options;

  const num = Number(input);

  if (isNaN(num)) {
    return defaultValue;
  }

  if (num < min) {
    return min;
  }

  if (num > max) {
    return max;
  }

  return num;
}

/**
 * Sanitize boolean input
 * Converts various representations to boolean
 * 
 * @param {any} input - Input to sanitize
 * @param {boolean} defaultValue - Default value if invalid
 * @returns {boolean} Sanitized boolean
 */
function sanitizeBoolean(input, defaultValue = false) {
  if (typeof input === 'boolean') {
    return input;
  }

  if (typeof input === 'string') {
    const lower = input.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return true;
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return false;
    }
  }

  if (typeof input === 'number') {
    return input !== 0;
  }

  return defaultValue;
}

/**
 * Sanitize array input
 * Ensures input is an array and sanitizes each element
 * 
 * @param {any} input - Input to sanitize
 * @param {Function} elementSanitizer - Function to sanitize each element
 * @returns {Array} Sanitized array
 */
function sanitizeArray(input, elementSanitizer = (x) => x) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map(elementSanitizer);
}

/**
 * Comprehensive sanitization for request body
 * Applies appropriate sanitization based on field names and values
 * 
 * @param {Object} body - Request body object
 * @param {Object} schema - Schema defining field types and sanitization
 * @returns {Object} Sanitized body
 */
function sanitizeRequestBody(body, schema = {}) {
  if (typeof body !== 'object' || body === null) {
    return {};
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(body)) {
    const fieldSchema = schema[key] || { type: 'string' };

    switch (fieldSchema.type) {
      case 'email':
        sanitized[key] = sanitizeEmail(value);
        break;
      case 'number':
        sanitized[key] = sanitizeNumber(value, fieldSchema.options);
        break;
      case 'boolean':
        sanitized[key] = sanitizeBoolean(value, fieldSchema.default);
        break;
      case 'array':
        sanitized[key] = sanitizeArray(value, fieldSchema.elementSanitizer);
        break;
      case 'html':
        sanitized[key] = sanitizeHTML(value);
        break;
      case 'path':
        sanitized[key] = sanitizeFilePath(value);
        break;
      case 'command':
        sanitized[key] = sanitizeCommandInput(value);
        break;
      case 'sql':
        sanitized[key] = sanitizeSQLInput(value);
        break;
      default:
        sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Log potential security threats
 * 
 * @param {string} type - Type of threat
 * @param {Object} details - Threat details
 */
function logSecurityThreat(type, details) {
  logger.warn(`Security threat detected: ${type}`, {
    type,
    ...details,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  sanitizeSQLInput,
  sanitizeHTML,
  sanitizeFilePath,
  sanitizeCommandInput,
  sanitizeNoSQLInput,
  sanitizeEmail,
  sanitizeNumber,
  sanitizeBoolean,
  sanitizeArray,
  sanitizeRequestBody,
  logSecurityThreat
};
