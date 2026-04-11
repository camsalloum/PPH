/**
 * Product Group Exclusions Cache
 * 
 * Provides in-memory caching for product group exclusions to avoid
 * repeated database queries on every API request.
 * 
 * Cache TTL: 10 minutes (exclusions rarely change)
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cache storage per division
const exclusionsCache = new Map();

/**
 * Get product group exclusions for a division (with caching)
 * @param {string} division - Division code (e.g., 'FP')
 * @returns {Promise<string[]>} - Array of excluded product group names
 */
async function getExcludedProductGroups(division = 'FP') {
  const now = Date.now();
  const cacheKey = division.toUpperCase();
  
  // Check if cache is valid
  if (exclusionsCache.has(cacheKey)) {
    const cached = exclusionsCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_TTL_MS) {
      return cached.exclusions;
    }
  }
  
  // Fetch from database
  try {
    const result = await pool.query(`
      SELECT product_group 
      FROM fp_product_group_exclusions 
      WHERE UPPER(TRIM(division_code)) = $1
    `, [cacheKey]);
    
    const exclusions = result.rows.map(row => row.product_group);
    
    // Update cache
    exclusionsCache.set(cacheKey, {
      exclusions,
      timestamp: now
    });
    
    logger.info(`✅ Product group exclusions cached for ${division}: ${exclusions.length} exclusions`);
    return exclusions;
    
  } catch (error) {
    logger.error('Error loading product group exclusions', { error: error.message, division });
    
    // Return stale cache if available
    if (exclusionsCache.has(cacheKey)) {
      return exclusionsCache.get(cacheKey).exclusions;
    }
    
    return [];
  }
}

/**
 * Check if a product group is excluded
 * @param {string} productGroup - Product group name
 * @param {string} division - Division code
 * @returns {Promise<boolean>}
 */
async function isProductGroupExcluded(productGroup, division = 'FP') {
  const exclusions = await getExcludedProductGroups(division);
  const normalizedPG = String(productGroup).trim().toUpperCase();
  return exclusions.some(exc => exc.toUpperCase() === normalizedPG);
}

/**
 * Build SQL WHERE clause for exclusions (for use in queries)
 * Returns: { clause: string, params: array }
 */
async function buildExclusionClause(pgColumn, division = 'FP', startParamIndex = 1) {
  const exclusions = await getExcludedProductGroups(division);
  
  if (exclusions.length === 0) {
    return { clause: '', params: [] };
  }
  
  const placeholders = exclusions.map((_, i) => `$${startParamIndex + i}`).join(', ');
  return {
    clause: `AND UPPER(TRIM(${pgColumn})) NOT IN (${placeholders})`,
    params: exclusions.map(e => e.toUpperCase())
  };
}

/**
 * Invalidate cache for a division (call when exclusions are updated)
 */
function invalidateCache(division = null) {
  if (division) {
    exclusionsCache.delete(division.toUpperCase());
    logger.info(`🗑️ Product group exclusions cache invalidated for ${division}`);
  } else {
    exclusionsCache.clear();
    logger.info('🗑️ Product group exclusions cache cleared (all divisions)');
  }
}

/**
 * Get cache status (for debugging)
 */
function getCacheStatus() {
  const status = {};
  for (const [key, value] of exclusionsCache) {
    status[key] = {
      exclusions: value.exclusions,
      cacheAge: Date.now() - value.timestamp,
      isExpired: (Date.now() - value.timestamp) > CACHE_TTL_MS
    };
  }
  return status;
}

/**
 * Preload cache for common divisions (call on server startup)
 */
async function preloadCache() {
  const divisions = ['FP', 'SB', 'TF', 'HCM'];
  for (const division of divisions) {
    try {
      await getExcludedProductGroups(division);
    } catch (e) {
      // Ignore errors during preload
    }
  }
  logger.info('✅ Product group exclusions cache preloaded');
}

module.exports = {
  getExcludedProductGroups,
  isProductGroupExcluded,
  buildExclusionClause,
  invalidateCache,
  getCacheStatus,
  preloadCache
};
