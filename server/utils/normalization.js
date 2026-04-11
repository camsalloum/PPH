/**
 * Data Normalization Utilities
 * Centralized normalization functions for consistent data handling across the project
 * 
 * STANDARD PATTERNS:
 * - Database queries: UPPER(TRIM(column))
 * - JavaScript comparisons: .toLowerCase().trim()
 * - Display names: toProperCase()
 */

/**
 * Normalize string to UPPERCASE with trimmed whitespace
 * Use this for database operations and storage
 * @param {string|number} str - Value to normalize
 * @returns {string} - Uppercase trimmed string
 */
function normalize(str) {
  if (str === null || str === undefined) return '';
  return str.toString().trim().toUpperCase();
}

/**
 * Normalize string for case-insensitive comparison
 * Use this for JavaScript comparisons (.find, .filter, etc.)
 * @param {string|number} str - Value to normalize
 * @returns {string} - Lowercase trimmed string
 */
function normalizeForCompare(str) {
  if (str === null || str === undefined) return '';
  return str.toString().trim().toLowerCase();
}

/**
 * Validate and parse year parameter
 * Ensures year is a valid integer within acceptable range
 * @param {string|number} year - Year to validate
 * @param {number} minYear - Minimum acceptable year (default: 2000)
 * @param {number} maxYear - Maximum acceptable year (default: 2100)
 * @returns {number} - Validated year as integer
 * @throws {Error} - If year is invalid
 */
function validateYear(year, minYear = 2000, maxYear = 2100) {
  const y = parseInt(year, 10);
  
  if (isNaN(y)) {
    throw new Error(`Invalid year: "${year}" is not a number`);
  }
  
  if (y < minYear || y > maxYear) {
    throw new Error(`Year ${y} is out of range (${minYear}-${maxYear})`);
  }
  
  return y;
}

/**
 * Validate and parse month parameter
 * Ensures month is a valid integer between 1-12
 * @param {string|number} month - Month to validate
 * @returns {number} - Validated month as integer (1-12)
 * @throws {Error} - If month is invalid
 */
function validateMonth(month) {
  const m = parseInt(month, 10);
  
  if (isNaN(m)) {
    throw new Error(`Invalid month: "${month}" is not a number`);
  }
  
  if (m < 1 || m > 12) {
    throw new Error(`Month ${m} is out of range (1-12)`);
  }
  
  return m;
}

/**
 * Convert string to Proper Case (Title Case)
 * Handles spaces, hyphens, slashes, parentheses, and periods for consistent naming
 * Use this ONLY for display purposes, never for storage or comparison
 * FIXED: Now handles parentheses and periods to match INITCAP behavior:
 * - "kabour brothers (hermanos)" -> "Kabour Brothers (Hermanos)"
 * - "al manhal water factory, w.l.l" -> "Al Manhal Water Factory, W.L.L"
 * @param {string} str - String to convert
 * @returns {string} - Proper case string
 */
function toProperCase(str) {
  if (!str) return '';
  
  // Use regex to handle spaces, hyphens, slashes, parentheses, and periods consistently
  return str.toString().trim().toLowerCase()
    .replace(/(?:^|\s|[-/(.])/\w/g, (match) => match.toUpperCase());
}

/**
 * Normalize customer name for merge operations
 * Handles special cases and ensures consistency
 * @param {string} customerName - Customer name to normalize
 * @returns {string} - Normalized customer name
 */
function normalizeCustomerName(customerName) {
  if (!customerName) return '';
  
  return customerName
    .toString()
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .toLowerCase();
}

/**
 * Normalize sales rep name for merge operations
 * @param {string} salesRepName - Sales rep name to normalize
 * @returns {string} - Normalized sales rep name
 */
function normalizeSalesRepName(salesRepName) {
  return normalizeCustomerName(salesRepName); // Same logic as customer names
}

/**
 * Build SQL WHERE clause with normalized comparison
 * @param {string} column - Column name
 * @param {number} paramIndex - Parameter index ($1, $2, etc.)
 * @returns {string} - SQL WHERE clause fragment
 */
function buildNormalizedWhereClause(column, paramIndex) {
  return `UPPER(TRIM(${column})) = UPPER($${paramIndex})`;
}

/**
 * Build SQL LIKE clause with normalized comparison
 * @param {string} column - Column name
 * @param {number} paramIndex - Parameter index ($1, $2, etc.)
 * @returns {string} - SQL LIKE clause fragment
 */
function buildNormalizedLikeClause(column, paramIndex) {
  return `UPPER(${column}) LIKE UPPER($${paramIndex})`;
}

/**
 * Validate division format
 * Expected formats: "FP-UAE", "PP-KSA", "Hygiene-UAE"
 * @param {string} division - Division string to validate
 * @returns {boolean} - True if valid format
 */
function isValidDivisionFormat(division) {
  if (!division || typeof division !== 'string') return false;
  
  // Check for hyphen separator
  if (!division.includes('-')) return false;
  
  const parts = division.split('-');
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}

/**
 * Extract division code from full division name
 * e.g., "FP-UAE" -> "FP", "Hygiene-KSA" -> "HYGIENE"
 * @param {string} division - Full division name
 * @returns {string} - Division code in uppercase
 */
function extractDivisionCode(division) {
  if (!division) return 'FP'; // Default fallback
  
  const code = division.split('-')[0];
  return code.toUpperCase();
}

/**
 * Compare two strings with normalization
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {boolean} - True if strings match after normalization
 */
function areEqual(str1, str2) {
  return normalizeForCompare(str1) === normalizeForCompare(str2);
}

/**
 * Find item in array by normalized name
 * @param {Array} array - Array of objects
 * @param {string} nameKey - Key name to compare (e.g., 'name', 'customer', 'salesRep')
 * @param {string} searchValue - Value to search for
 * @returns {object|undefined} - Found item or undefined
 */
function findByNormalizedName(array, nameKey, searchValue) {
  if (!Array.isArray(array)) return undefined;
  
  const normalized = normalizeForCompare(searchValue);
  return array.find(item => 
    normalizeForCompare(item[nameKey]) === normalized
  );
}

/**
 * Filter array by normalized name
 * @param {Array} array - Array of objects
 * @param {string} nameKey - Key name to compare
 * @param {string} searchValue - Value to search for
 * @returns {Array} - Filtered array
 */
function filterByNormalizedName(array, nameKey, searchValue) {
  if (!Array.isArray(array)) return [];
  
  const normalized = normalizeForCompare(searchValue);
  return array.filter(item => 
    normalizeForCompare(item[nameKey]) === normalized
  );
}

module.exports = {
  // Core normalization
  normalize,
  normalizeForCompare,
  
  // Validation
  validateYear,
  validateMonth,
  
  // Display formatting
  toProperCase,
  
  // Domain-specific normalization
  normalizeCustomerName,
  normalizeSalesRepName,
  
  // SQL helpers
  buildNormalizedWhereClause,
  buildNormalizedLikeClause,
  
  // Division utilities
  isValidDivisionFormat,
  extractDivisionCode,
  
  // Comparison helpers
  areEqual,
  findByNormalizedName,
  filterByNormalizedName
};
