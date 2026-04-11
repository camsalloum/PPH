/**
 * Name Standardization Utilities
 *
 * Provides functions to standardize names to Title Case format
 * to prevent duplicate entries with different casings
 */

/**
 * Convert a string to Title Case
 * Examples:
 *   "MOUHCINE FELLAH" -> "Mouhcine Fellah"
 *   "john doe" -> "John Doe"
 *   "ACME CORPORATION LTD" -> "Acme Corporation Ltd"
 *
 * @param {string} str - The string to convert
 * @returns {string} - Title case version of the string
 */
function toTitleCase(str) {
  if (!str || typeof str !== 'string') return '';

  return str
    .toLowerCase()
    .trim()
    .split(/\s+/) // Split on any whitespace
    .map(word => {
      if (word.length === 0) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Standardize a sales rep name
 * @param {string} name - The sales rep name
 * @returns {string} - Standardized name in Title Case
 */
function standardizeSalesRepName(name) {
  return toTitleCase(name);
}

/**
 * Standardize a customer name
 * @param {string} name - The customer name
 * @returns {string} - Standardized name in Title Case
 */
function standardizeCustomerName(name) {
  return toTitleCase(name);
}

/**
 * Standardize a country name
 * @param {string} name - The country name
 * @returns {string} - Standardized name in Title Case
 */
function standardizeCountryName(name) {
  return toTitleCase(name);
}

/**
 * Standardize a product group name
 * @param {string} name - The product group name
 * @returns {string} - Standardized name in Title Case
 */
function standardizeProductGroupName(name) {
  return toTitleCase(name);
}

/**
 * Standardize all name fields in a data object
 * @param {Object} data - The data object containing name fields
 * @returns {Object} - New object with standardized names
 */
function standardizeDataObject(data) {
  const standardized = { ...data };

  if (data.salesrepname) {
    standardized.salesrepname = standardizeSalesRepName(data.salesrepname);
  }

  if (data.customername) {
    standardized.customername = standardizeCustomerName(data.customername);
  }

  if (data.countryname) {
    standardized.countryname = standardizeCountryName(data.countryname);
  }

  if (data.productgroup) {
    standardized.productgroup = standardizeProductGroupName(data.productgroup);
  }

  return standardized;
}

/**
 * Standardize an array of data objects
 * @param {Array} dataArray - Array of data objects
 * @returns {Array} - Array with standardized names
 */
function standardizeDataArray(dataArray) {
  if (!Array.isArray(dataArray)) return [];
  return dataArray.map(data => standardizeDataObject(data));
}

module.exports = {
  toTitleCase,
  standardizeSalesRepName,
  standardizeCustomerName,
  standardizeCountryName,
  standardizeProductGroupName,
  standardizeDataObject,
  standardizeDataArray
};
