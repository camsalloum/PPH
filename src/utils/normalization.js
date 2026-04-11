/**
 * Data Normalization Utilities for Frontend
 * Centralized normalization functions for consistent data handling in React components
 * 
 * USAGE:
 * import { normalizeForCompare, findByNormalizedName } from './utils/normalization';
 */

/**
 * Normalize string for case-insensitive comparison
 * Use this for all .find(), .filter(), and === comparisons
 * @param {string|number} str - Value to normalize
 * @returns {string} - Lowercase trimmed string
 */
export const normalizeForCompare = (str) => {
  if (str === null || str === undefined) return '';
  return str.toString().trim().toLowerCase();
};

/**
 * Alias for normalizeForCompare (common shorthand)
 */
export const norm = normalizeForCompare;

/**
 * Convert string to Proper Case (Title Case)
 * Use this ONLY for display purposes
 * Preserves common business abbreviations (LLC, LTD, INC, CO, etc.)
 * @param {string} str - String to convert
 * @returns {string} - Proper case string
 */
export const toProperCase = (str) => {
  if (!str) return '';
  
  // Common business abbreviations that should stay uppercase
  const abbreviations = new Set([
    'llc', 'ltd', 'inc', 'co', 'corp', 'plc', 'llp', 'lp',
    'uae', 'usa', 'uk', 'gcc', 'ksa', 'fzc', 'fze', 'fz',
    'wll', 'est', 'hq', 'bv', 'nv', 'sa', 'ag', 'gmbh',
    'dmcc', 'dip', 'jafza', 'dafza', 'saif', 'rak',
    'pjsc', 'jsc', 'ooo', 'llc.', 'l.l.c', 'l.l.c.'
  ]);
  
  return str
    .toString()
    .toLowerCase()
    .replace(/(?:^|[\s\-\/\(])\w/g, (match) => match.toUpperCase())
    .split(' ')
    .map(word => {
      // Check if word (without punctuation) is an abbreviation
      const cleanWord = word.replace(/[.,]/g, '').toLowerCase();
      if (abbreviations.has(cleanWord)) {
        return word.toUpperCase();
      }
      return word;
    })
    .join(' ');
};

/**
 * Normalize customer name for merge operations
 * @param {string} customerName - Customer name to normalize
 * @returns {string} - Normalized customer name
 */
export const normalizeCustomerName = (customerName) => {
  if (!customerName) return '';
  
  return customerName
    .toString()
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .toLowerCase();
};

/**
 * Normalize sales rep name
 * @param {string} salesRepName - Sales rep name to normalize
 * @returns {string} - Normalized sales rep name
 */
export const normalizeSalesRepName = (salesRepName) => {
  return normalizeCustomerName(salesRepName);
};

/**
 * Compare two strings with normalization
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {boolean} - True if strings match after normalization
 */
export const areEqual = (str1, str2) => {
  return normalizeForCompare(str1) === normalizeForCompare(str2);
};

/**
 * Find item in array by normalized name
 * RECOMMENDED: Use this instead of array.find() for name comparisons
 * @param {Array} array - Array of objects
 * @param {string} nameKey - Key name to compare (e.g., 'name', 'customer', 'salesRep')
 * @param {string} searchValue - Value to search for
 * @returns {object|undefined} - Found item or undefined
 */
export const findByNormalizedName = (array, nameKey, searchValue) => {
  if (!Array.isArray(array)) return undefined;
  
  const normalized = normalizeForCompare(searchValue);
  return array.find(item => 
    normalizeForCompare(item[nameKey]) === normalized
  );
};

/**
 * Filter array by normalized name
 * RECOMMENDED: Use this instead of array.filter() for name comparisons
 * @param {Array} array - Array of objects
 * @param {string} nameKey - Key name to compare
 * @param {string} searchValue - Value to search for
 * @returns {Array} - Filtered array
 */
export const filterByNormalizedName = (array, nameKey, searchValue) => {
  if (!Array.isArray(array)) return [];
  
  const normalized = normalizeForCompare(searchValue);
  return array.filter(item => 
    normalizeForCompare(item[nameKey]) === normalized
  );
};

/**
 * Check if array includes a normalized value
 * @param {Array} array - Array of strings
 * @param {string} searchValue - Value to search for
 * @returns {boolean} - True if array contains value (case-insensitive)
 */
export const includesNormalized = (array, searchValue) => {
  if (!Array.isArray(array)) return false;
  
  const normalized = normalizeForCompare(searchValue);
  return array.some(item => normalizeForCompare(item) === normalized);
};

/**
 * Sort array by normalized name
 * @param {Array} array - Array of objects
 * @param {string} nameKey - Key name to sort by
 * @param {boolean} ascending - Sort direction (default: true)
 * @returns {Array} - Sorted array (does not modify original)
 */
export const sortByNormalizedName = (array, nameKey, ascending = true) => {
  if (!Array.isArray(array)) return [];
  
  return [...array].sort((a, b) => {
    const nameA = normalizeForCompare(a[nameKey]);
    const nameB = normalizeForCompare(b[nameKey]);
    
    if (nameA < nameB) return ascending ? -1 : 1;
    if (nameA > nameB) return ascending ? 1 : -1;
    return 0;
  });
};

/**
 * Extract division code from full division name
 * e.g., "FP-UAE" -> "fp", "Hygiene-KSA" -> "hygiene"
 * @param {string} division - Full division name
 * @returns {string} - Division code in lowercase
 */
export const extractDivisionCode = (division) => {
  if (!division) return 'fp'; // Default fallback
  
  const code = division.split('-')[0];
  return code.toLowerCase();
};

/**
 * Validate division format
 * Expected formats: "FP-UAE", "PP-KSA", "Hygiene-UAE"
 * @param {string} division - Division string to validate
 * @returns {boolean} - True if valid format
 */
export const isValidDivisionFormat = (division) => {
  if (!division || typeof division !== 'string') return false;
  
  // Check for hyphen separator
  if (!division.includes('-')) return false;
  
  const parts = division.split('-');
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
};

/**
 * Create a normalized lookup map for fast access
 * Use this for performance optimization when doing many lookups
 * @param {Array} array - Array of objects
 * @param {string} keyField - Field to use as map key
 * @returns {Map} - Map with normalized keys
 */
export const createNormalizedMap = (array, keyField) => {
  const map = new Map();
  
  if (!Array.isArray(array)) return map;
  
  array.forEach(item => {
    const key = normalizeForCompare(item[keyField]);
    map.set(key, item);
  });
  
  return map;
};

/**
 * Validate year (frontend version)
 * @param {string|number} year - Year to validate
 * @returns {boolean} - True if valid year
 */
export const isValidYear = (year) => {
  const y = parseInt(year, 10);
  return !isNaN(y) && y >= 2000 && y <= 2100;
};

/**
 * Validate month (frontend version)
 * @param {string|number} month - Month to validate
 * @returns {boolean} - True if valid month (1-12)
 */
export const isValidMonth = (month) => {
  const m = parseInt(month, 10);
  return !isNaN(m) && m >= 1 && m <= 12;
};

// Default export for convenient importing
export default {
  normalizeForCompare,
  norm,
  toProperCase,
  normalizeCustomerName,
  normalizeSalesRepName,
  areEqual,
  findByNormalizedName,
  filterByNormalizedName,
  includesNormalized,
  sortByNormalizedName,
  extractDivisionCode,
  isValidDivisionFormat,
  createNormalizedMap,
  isValidYear,
  isValidMonth
};
