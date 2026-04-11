/**
 * @fileoverview Sales Rep Name Resolution Service
 * @module services/salesRepResolver
 * @description Resolves sales rep names to their canonical form using aliases
 * Used in aggregation queries to group data by canonical sales rep name
 * 
 * Created: June 2025
 */

const logger = require('../utils/logger');

// Cache for alias lookups
let aliasCache = new Map(); // alias -> canonical_name
let reverseLookup = new Map(); // canonical_name -> [aliases]
let cacheLoaded = false;

/**
 * Load all aliases into memory cache
 * Call this at server startup or periodically refresh
 * @param {Pool} pool - PostgreSQL pool
 */
async function loadAliasCache(pool) {
  try {
    const result = await pool.query(`
      SELECT m.canonical_name, a.alias_name
      FROM sales_rep_master m
      JOIN sales_rep_aliases a ON m.id = a.sales_rep_id
    `);
    
    aliasCache.clear();
    reverseLookup.clear();
    
    result.rows.forEach(row => {
      const canonicalLower = row.canonical_name.toLowerCase().trim();
      const aliasLower = row.alias_name.toLowerCase().trim();
      
      aliasCache.set(aliasLower, row.canonical_name);
      
      if (!reverseLookup.has(canonicalLower)) {
        reverseLookup.set(canonicalLower, []);
      }
      reverseLookup.get(canonicalLower).push(row.alias_name);
    });
    
    cacheLoaded = true;
    logger.info(`✅ SalesRepResolver: Loaded ${aliasCache.size} aliases into cache`);
    
  } catch (error) {
    logger.error('Failed to load alias cache:', error);
    cacheLoaded = false;
  }
}

/**
 * Clear the alias cache
 */
function clearCache() {
  aliasCache.clear();
  reverseLookup.clear();
  cacheLoaded = false;
}

/**
 * Get the canonical name for a sales rep
 * If the name is an alias, return the canonical name
 * Otherwise return the input name
 * 
 * @param {string} name - Sales rep name (may be alias)
 * @returns {string} Canonical name
 */
function resolveToCanonical(name) {
  if (!name) return name;
  
  const nameLower = name.toLowerCase().trim();
  
  // Check if it's an alias
  if (aliasCache.has(nameLower)) {
    return aliasCache.get(nameLower);
  }
  
  // Not an alias, return original
  return name.trim();
}

/**
 * Get all aliases for a canonical sales rep name
 * @param {string} canonicalName - Canonical sales rep name
 * @returns {Array<string>} List of aliases
 */
function getAliases(canonicalName) {
  if (!canonicalName) return [];
  
  const nameLower = canonicalName.toLowerCase().trim();
  return reverseLookup.get(nameLower) || [];
}

/**
 * Build a SQL CASE expression that resolves sales rep names to canonical form
 * Use this in SELECT and GROUP BY clauses
 * 
 * @param {string} columnName - The column to resolve (default: 'salesrepname')
 * @returns {string} SQL CASE expression
 */
function buildResolutionSQL(columnName = 'salesrepname') {
  if (!cacheLoaded || aliasCache.size === 0) {
    // No aliases loaded, just use the column directly
    return `TRIM(${columnName})`;
  }
  
  // Build CASE WHEN expression for alias resolution
  const cases = [];
  aliasCache.forEach((canonical, alias) => {
    // Escape single quotes in names
    const escapedAlias = alias.replace(/'/g, "''");
    const escapedCanonical = canonical.replace(/'/g, "''");
    cases.push(`WHEN LOWER(TRIM(${columnName})) = '${escapedAlias}' THEN '${escapedCanonical}'`);
  });
  
  if (cases.length === 0) {
    return `TRIM(${columnName})`;
  }
  
  return `CASE ${cases.join(' ')} ELSE TRIM(${columnName}) END`;
}

/**
 * Build SQL that groups all name variations together
 * Returns a subquery that can be used as a CTE or derived table
 * 
 * Example usage:
 *   WITH resolved_names AS (${buildNameResolutionCTE('fp_data_excel', 'salesrepname')})
 *   SELECT resolved_name, SUM(values) FROM resolved_names GROUP BY resolved_name
 * 
 * @param {string} tableName - Table to resolve
 * @param {string} columnName - Column with sales rep names
 * @returns {string} SQL subquery
 */
function buildNameResolutionCTE(tableName, columnName = 'salesrepname') {
  const resolutionExpr = buildResolutionSQL(columnName);
  return `SELECT *, ${resolutionExpr} AS resolved_salesrep FROM ${tableName}`;
}

/**
 * Check if the cache is loaded
 * @returns {boolean}
 */
function isCacheLoaded() {
  return cacheLoaded;
}

/**
 * Get statistics about the cache
 * @returns {Object}
 */
function getCacheStats() {
  return {
    loaded: cacheLoaded,
    aliasCount: aliasCache.size,
    canonicalCount: reverseLookup.size
  };
}

module.exports = {
  loadAliasCache,
  clearCache,
  resolveToCanonical,
  getAliases,
  buildResolutionSQL,
  buildNameResolutionCTE,
  isCacheLoaded,
  getCacheStats
};
