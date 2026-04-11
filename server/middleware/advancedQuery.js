/**
 * @fileoverview Advanced Query Middleware
 * @module middleware/advancedQuery
 * @description Provides advanced querying capabilities including full-text search, complex filters, and aggregations
 * 
 * Features:
 * - Full-text search with PostgreSQL tsquery
 * - Complex filter operators (IN, BETWEEN, LIKE, GT, LT, etc.)
 * - Field aggregations (SUM, AVG, COUNT, MIN, MAX)
 * - JSON column querying
 * - Query optimization and security
 * 
 * @created 2024-12-06
 */

const { BadRequestError } = require('./aebfErrorHandler');
const logger = require('../utils/logger');

/**
 * Filter operators configuration
 * Maps URL query operators to SQL operators
 */
const FILTER_OPERATORS = {
  eq: '=',        // Equal
  ne: '!=',       // Not equal
  gt: '>',        // Greater than
  gte: '>=',      // Greater than or equal
  lt: '<',        // Less than
  lte: '<=',      // Less than or equal
  like: 'LIKE',   // Pattern matching
  ilike: 'ILIKE', // Case-insensitive pattern matching
  in: 'IN',       // In array
  nin: 'NOT IN',  // Not in array
  between: 'BETWEEN', // Between two values
  null: 'IS NULL',    // Is null
  notnull: 'IS NOT NULL' // Is not null
};

/**
 * Aggregation functions configuration
 * Supported SQL aggregation functions
 */
const AGGREGATION_FUNCTIONS = {
  sum: 'SUM',
  avg: 'AVG',
  count: 'COUNT',
  min: 'MIN',
  max: 'MAX',
  stddev: 'STDDEV',
  variance: 'VARIANCE'
};

/**
 * Sanitize field name to prevent SQL injection
 * Only allows alphanumeric, underscore, and dot (for table.column)
 * 
 * @param {string} fieldName - Field name to sanitize
 * @param {string[]} allowedFields - Whitelist of allowed field names
 * @returns {string} Sanitized field name
 * @throws {BadRequestError} If field name is invalid or not allowed
 */
function sanitizeFieldName(fieldName, allowedFields = []) {
  if (!fieldName || typeof fieldName !== 'string') {
    throw new BadRequestError('Invalid field name');
  }
  
  // Check against whitelist if provided
  if (allowedFields.length > 0 && !allowedFields.includes(fieldName)) {
    throw new BadRequestError(`Field '${fieldName}' is not allowed`);
  }
  
  // Validate format: only alphanumeric, underscore, and dot
  if (!/^[a-zA-Z0-9_.]+$/.test(fieldName)) {
    throw new BadRequestError(`Invalid field name format: ${fieldName}`);
  }
  
  return fieldName;
}

/**
 * Build WHERE clause from filter object
 * Supports complex operators and multiple conditions
 * 
 * @param {Object} filters - Filter object from query params
 * @param {string[]} allowedFields - Whitelist of allowed field names
 * @returns {Object} { whereClause: string, values: Array, paramIndex: number }
 * 
 * @example
 * // filters = { 'price[gte]': 100, 'price[lte]': 500, 'category[in]': ['A', 'B'] }
 * // Returns: WHERE price >= $1 AND price <= $2 AND category IN ($3, $4)
 */
function buildWhereClause(filters, allowedFields = []) {
  const conditions = [];
  const values = [];
  let paramIndex = 1;
  
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    
    // Parse field and operator: field[operator] or field
    const match = key.match(/^([a-zA-Z0-9_.]+)(?:\[([a-z]+)\])?$/);
    if (!match) {
      logger.warn(`Invalid filter key format: ${key}`);
      continue;
    }
    
    const [, fieldName, operator = 'eq'] = match;
    const sanitizedField = sanitizeFieldName(fieldName, allowedFields);
    const sqlOperator = FILTER_OPERATORS[operator];
    
    if (!sqlOperator) {
      logger.warn(`Unknown operator: ${operator}`);
      continue;
    }
    
    // Handle different operator types
    switch (operator) {
      case 'in':
      case 'nin': {
        // IN/NOT IN: value should be array or comma-separated string
        const arrayValue = Array.isArray(value) ? value : value.split(',');
        if (arrayValue.length === 0) break;
        
        const placeholders = arrayValue.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`${sanitizedField} ${sqlOperator} (${placeholders})`);
        values.push(...arrayValue);
        break;
      }
      
      case 'between': {
        // BETWEEN: value should be array [min, max] or comma-separated "min,max"
        const [min, max] = Array.isArray(value) ? value : value.split(',');
        if (!min || !max) break;
        
        conditions.push(`${sanitizedField} BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
        values.push(min, max);
        paramIndex += 2;
        break;
      }
      
      case 'null':
      case 'notnull': {
        // IS NULL/IS NOT NULL: no parameter needed
        conditions.push(`${sanitizedField} ${sqlOperator}`);
        break;
      }
      
      case 'like':
      case 'ilike': {
        // LIKE/ILIKE: add % wildcards if not present
        const likeValue = value.includes('%') ? value : `%${value}%`;
        conditions.push(`${sanitizedField} ${sqlOperator} $${paramIndex++}`);
        values.push(likeValue);
        break;
      }
      
      default: {
        // Standard comparison operators (=, !=, >, <, >=, <=)
        conditions.push(`${sanitizedField} ${sqlOperator} $${paramIndex++}`);
        values.push(value);
        break;
      }
    }
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  return { whereClause, values, paramIndex };
}

/**
 * Build full-text search clause using PostgreSQL tsquery
 * Searches across multiple text columns with ranking
 * 
 * @param {string} searchQuery - Search query string
 * @param {string[]} searchFields - Fields to search in
 * @param {Object} options - Search options
 * @returns {Object} { searchClause: string, searchValue: string, rankColumn: string }
 * 
 * @example
 * // searchQuery = "budget report"
 * // searchFields = ['description', 'notes']
 * // Returns: WHERE to_tsvector('english', description || ' ' || notes) @@ to_tsquery('english', 'budget & report')
 */
function buildFullTextSearch(searchQuery, searchFields = [], options = {}) {
  if (!searchQuery || searchFields.length === 0) {
    return { searchClause: '', searchValue: null, rankColumn: null };
  }
  
  const {
    language = 'english',
    operator = 'AND',  // AND or OR between terms
    fuzzy = false      // Use prefix matching for partial matches
  } = options;
  
  // Sanitize search fields
  const sanitizedFields = searchFields.map(f => sanitizeFieldName(f));
  
  // Build concatenated search column: field1 || ' ' || field2 || ...
  const searchColumn = sanitizedFields.join(" || ' ' || ");
  
  // Build tsquery: convert "budget report" to "budget & report" or "budget | report"
  const terms = searchQuery.trim().split(/\s+/);
  const tsqueryOperator = operator === 'OR' ? ' | ' : ' & ';
  const tsqueryTerms = terms.map(term => {
    // Escape single quotes
    const escaped = term.replace(/'/g, "''");
    // Add :* for prefix matching (fuzzy)
    return fuzzy ? `${escaped}:*` : escaped;
  }).join(tsqueryOperator);
  
  // Build search clause
  const searchClause = `to_tsvector('${language}', ${searchColumn}) @@ to_tsquery('${language}', '${tsqueryTerms}')`;
  
  // Build rank column for sorting by relevance
  const rankColumn = `ts_rank(to_tsvector('${language}', ${searchColumn}), to_tsquery('${language}', '${tsqueryTerms}'))`;
  
  return { 
    searchClause, 
    searchValue: tsqueryTerms, 
    rankColumn 
  };
}

/**
 * Build aggregation SELECT clause
 * Supports multiple aggregation functions on different fields
 * 
 * @param {Object} aggregations - Aggregation configuration
 * @param {string[]} allowedFields - Whitelist of allowed field names
 * @returns {string} Aggregation SELECT clause
 * 
 * @example
 * // aggregations = { sum: ['amount', 'quantity'], avg: ['price'], count: ['*'] }
 * // Returns: SUM(amount) as sum_amount, SUM(quantity) as sum_quantity, AVG(price) as avg_price, COUNT(*) as count_all
 */
function buildAggregationClause(aggregations, allowedFields = []) {
  const clauses = [];
  
  for (const [func, fields] of Object.entries(aggregations)) {
    const sqlFunc = AGGREGATION_FUNCTIONS[func.toLowerCase()];
    if (!sqlFunc) {
      logger.warn(`Unknown aggregation function: ${func}`);
      continue;
    }
    
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    
    for (const field of fieldArray) {
      // Special case for COUNT(*)
      if (field === '*' && func.toLowerCase() === 'count') {
        clauses.push(`${sqlFunc}(*) as count_all`);
        continue;
      }
      
      const sanitizedField = sanitizeFieldName(field, allowedFields);
      const alias = `${func.toLowerCase()}_${sanitizedField.replace('.', '_')}`;
      clauses.push(`${sqlFunc}(${sanitizedField}) as ${alias}`);
    }
  }
  
  return clauses.length > 0 ? clauses.join(', ') : '*';
}

/**
 * Parse query parameters for advanced filtering
 * Extracts filters, search, aggregations, and options
 * 
 * @param {Object} query - Express req.query object
 * @returns {Object} Parsed query components
 */
function parseAdvancedQuery(query) {
  const {
    search,           // Full-text search query
    searchFields,     // Comma-separated fields to search
    searchOperator,   // AND or OR
    searchFuzzy,      // Enable prefix matching
    aggregate,        // Comma-separated aggregation functions: sum,avg,count
    aggregateFields,  // Fields to aggregate on
    groupBy,          // Comma-separated fields to group by
    ...filters        // Remaining params are filters
  } = query;
  
  // Parse search configuration
  const searchConfig = search ? {
    query: search,
    fields: searchFields ? searchFields.split(',').map(f => f.trim()) : [],
    operator: searchOperator || 'AND',
    fuzzy: searchFuzzy === 'true'
  } : null;
  
  // Parse aggregation configuration
  const aggregationConfig = aggregate ? {
    functions: aggregate.split(',').map(f => f.trim().toLowerCase()),
    fields: aggregateFields ? aggregateFields.split(',').map(f => f.trim()) : ['*'],
    groupBy: groupBy ? groupBy.split(',').map(f => f.trim()) : []
  } : null;
  
  return {
    filters,
    searchConfig,
    aggregationConfig
  };
}

/**
 * Advanced query middleware
 * Attaches parsed query components to req.advancedQuery
 * 
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function advancedQueryMiddleware(options = {}) {
  const {
    allowedFields = [],
    allowedSearchFields = [],
    allowedAggregateFields = [],
    maxSearchFields = 5,
    maxFilters = 20
  } = options;
  
  return (req, res, next) => {
    try {
      const parsed = parseAdvancedQuery(req.query);
      
      // Validate limits
      const filterCount = Object.keys(parsed.filters).length;
      if (filterCount > maxFilters) {
        throw new BadRequestError(`Too many filters (${filterCount}). Maximum is ${maxFilters}`);
      }
      
      if (parsed.searchConfig && parsed.searchConfig.fields.length > maxSearchFields) {
        throw new BadRequestError(`Too many search fields. Maximum is ${maxSearchFields}`);
      }
      
      // Build SQL components
      const whereResult = buildWhereClause(parsed.filters, allowedFields);
      
      const searchResult = parsed.searchConfig 
        ? buildFullTextSearch(
            parsed.searchConfig.query, 
            parsed.searchConfig.fields.filter(f => 
              allowedSearchFields.length === 0 || allowedSearchFields.includes(f)
            ),
            {
              operator: parsed.searchConfig.operator,
              fuzzy: parsed.searchConfig.fuzzy
            }
          )
        : { searchClause: '', searchValue: null, rankColumn: null };
      
      const aggregationClause = parsed.aggregationConfig
        ? buildAggregationClause(
            Object.fromEntries(
              parsed.aggregationConfig.functions.map(f => [f, parsed.aggregationConfig.fields])
            ),
            allowedAggregateFields.length > 0 ? allowedAggregateFields : allowedFields
          )
        : null;
      
      // Attach to request
      req.advancedQuery = {
        filters: parsed.filters,
        where: whereResult,
        search: searchResult,
        aggregation: aggregationClause,
        groupBy: parsed.aggregationConfig?.groupBy || []
      };
      
      logger.debug('Advanced query parsed', {
        filterCount,
        hasSearch: !!parsed.searchConfig,
        hasAggregation: !!parsed.aggregationConfig
      });
      
      next();
    } catch (error) {
      if (error instanceof BadRequestError) {
        next(error);
      } else {
        logger.error('Advanced query parsing error:', error);
        next(new BadRequestError('Invalid query parameters'));
      }
    }
  };
}

module.exports = {
  advancedQueryMiddleware,
  buildWhereClause,
  buildFullTextSearch,
  buildAggregationClause,
  parseAdvancedQuery,
  sanitizeFieldName,
  FILTER_OPERATORS,
  AGGREGATION_FUNCTIONS
};
