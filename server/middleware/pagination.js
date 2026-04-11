/**
 * Pagination Middleware
 * Provides consistent pagination across all AEBF endpoints
 * Supports page-based and cursor-based pagination
 */

const { BadRequestError } = require('./aebfErrorHandler');

/**
 * Default pagination configuration
 */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;
const MIN_LIMIT = 1;

/**
 * Parse and validate pagination parameters
 * @param {Object} req - Express request object
 * @returns {Object} Parsed pagination params
 */
function parsePaginationParams(req) {
  const page = parseInt(req.query.page) || DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || DEFAULT_LIMIT;
  const sortBy = req.query.sortBy || 'id';
  const sortOrder = (req.query.sortOrder || 'ASC').toUpperCase();

  // Validation - return parsed params without throwing
  // Let validation middleware handle errors if needed
  const validatedPage = page < 1 ? DEFAULT_PAGE : page;
  const validatedLimit = (limit < MIN_LIMIT || limit > MAX_LIMIT) ? DEFAULT_LIMIT : limit;
  const validatedSortOrder = ['ASC', 'DESC'].includes(sortOrder) ? sortOrder : 'ASC';

  const offset = (validatedPage - 1) * validatedLimit;

  return {
    page: validatedPage,
    limit: validatedLimit,
    offset,
    sortBy,
    sortOrder: validatedSortOrder
  };
}

/**
 * Build pagination metadata
 * @param {number} total - Total number of records
 * @param {Object} params - Pagination parameters
 * @returns {Object} Pagination metadata
 */
function buildPaginationMeta(total, params) {
  const { page, limit } = params;
  const totalPages = Math.ceil(total / limit);
  
  return {
    currentPage: page,
    pageSize: limit,
    totalRecords: total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    previousPage: page > 1 ? page - 1 : null
  };
}

/**
 * Build SQL pagination clause
 * @param {Object} params - Pagination parameters
 * @param {Array} allowedSortFields - Allowed sort fields for security
 * @returns {string} SQL LIMIT/OFFSET clause
 */
function buildPaginationSQL(params, allowedSortFields = []) {
  const { limit, offset, sortBy, sortOrder } = params;
  
  // Validate sort field against whitelist
  let safeSortBy = sortBy;
  if (allowedSortFields.length > 0) {
    // Check if sortBy is in allowed fields (handle table.column format)
    const fieldName = sortBy.includes('.') ? sortBy.split('.')[1] : sortBy;
    const fullMatch = allowedSortFields.includes(sortBy);
    const fieldMatch = allowedSortFields.includes(fieldName);
    
    if (!fullMatch && !fieldMatch) {
      throw new BadRequestError(`Sort field '${sortBy}' is not allowed. Allowed fields: ${allowedSortFields.join(', ')}`);
    }
  }
  
  return `ORDER BY ${safeSortBy} ${sortOrder} LIMIT ${limit} OFFSET ${offset}`;
}

/**
 * Pagination middleware
 * Parses pagination params and attaches to req.pagination
 */
function paginationMiddleware(req, res, next) {
  try {
    req.pagination = parsePaginationParams(req);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Create paginated response helper
 * Attaches helper method to res object
 */
function paginationHelper(req, res, next) {
  /**
   * Send paginated response
   * @param {Array} data - Array of records
   * @param {number} total - Total number of records
   * @param {string} message - Success message
   */
  res.paginated = function(data, total, message = 'Data retrieved successfully') {
    const pagination = req.pagination || parsePaginationParams(req);
    const meta = buildPaginationMeta(total, pagination);
    
    return res.json({
      success: true,
      message,
      data,
      pagination: meta
    });
  };
  
  next();
}

/**
 * Cursor-based pagination for large datasets
 * More efficient than offset-based for large tables
 */
function parseCursorParams(req) {
  const limit = parseInt(req.query.limit) || DEFAULT_LIMIT;
  const cursor = req.query.cursor || null;
  const sortBy = req.query.sortBy || 'id';
  const sortOrder = (req.query.sortOrder || 'ASC').toUpperCase();

  // Validation with defaults
  const validatedLimit = (limit < MIN_LIMIT || limit > MAX_LIMIT) ? DEFAULT_LIMIT : limit;
  const validatedSortOrder = ['ASC', 'DESC'].includes(sortOrder) ? sortOrder : 'ASC';

  return {
    limit: validatedLimit,
    cursor,
    sortBy,
    sortOrder: validatedSortOrder
  };
}

/**
 * Build cursor pagination SQL
 * @param {Object} params - Cursor parameters
 * @param {string} cursorField - Field to use for cursor (e.g., 'id', 'created_at')
 * @returns {Object} SQL parts { where, orderLimit }
 */
function buildCursorSQL(params, cursorField = 'id') {
  const { limit, cursor, sortOrder } = params;
  
  let whereClause = '';
  if (cursor) {
    const operator = sortOrder === 'ASC' ? '>' : '<';
    // Sanitize cursor value to prevent SQL injection
    const sanitizedCursor = cursor.toString().replace(/'/g, "''");
    whereClause = `${cursorField} ${operator} '${sanitizedCursor}'`;
  }
  
  // Fetch limit + 1 to detect if there are more records
  const orderLimit = `ORDER BY ${cursorField} ${sortOrder} LIMIT ${limit + 1}`;
  
  return { whereClause, orderLimit };
}

/**
 * Build cursor response
 * @param {Array} data - Array of records (limit + 1)
 * @param {number} limit - Requested limit
 * @param {string} cursorField - Field used for cursor
 * @returns {Object} Response with data and cursor
 */
function buildCursorResponse(data, limit, cursorField = 'id') {
  const hasMore = data.length > limit;
  const records = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? records[records.length - 1][cursorField] : null;
  
  return {
    data: records,
    pagination: {
      hasMore,
      nextCursor,
      count: records.length
    }
  };
}

module.exports = {
  paginationMiddleware,
  paginationHelper,
  parsePaginationParams,
  buildPaginationMeta,
  buildPaginationSQL,
  parseCursorParams,
  buildCursorSQL,
  buildCursorResponse,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT
};
