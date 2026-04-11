/**
 * Dynamic Division Validator
 * Validates division codes against company_divisions table (NOT hardcoded)
 * 
 * Replaces all hardcoded checks like: if (!['fp', 'sb', 'tf', 'hcm'].includes(division))
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

const authPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: 'ip_auth_database',
  max: 5,
});

// Cache for active division codes
let activeDivisionsCache = null;
let cacheExpiry = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all active division codes from database
 * @returns {Promise<string[]>} Array of active division codes (lowercase)
 */
async function getActiveDivisionCodes() {
  try {
    // Check cache
    if (activeDivisionsCache && cacheExpiry && Date.now() < cacheExpiry) {
      return activeDivisionsCache;
    }

    // Query database
    const result = await authPool.query(`
      SELECT division_code 
      FROM company_divisions 
      WHERE is_active = true
      ORDER BY division_code
    `);

    activeDivisionsCache = result.rows.map(row => row.division_code.toLowerCase());
    cacheExpiry = Date.now() + CACHE_TTL;

    logger.info(`[DivisionValidator] Loaded ${activeDivisionsCache.length} active divisions: ${activeDivisionsCache.join(', ')}`);

    return activeDivisionsCache;

  } catch (error) {
    logger.error('[DivisionValidator] Failed to load divisions:', error.message);
    // Fallback: return empty array (will cause validation to fail, which is safer than allowing invalid divisions)
    return [];
  }
}

/**
 * Validate if a division code is active
 * @param {string} divisionCode - Division code to validate
 * @returns {Promise<boolean>} True if division is active
 */
async function isValidDivision(divisionCode) {
  if (!divisionCode) return false;
  
  const activeDivisions = await getActiveDivisionCodes();
  return activeDivisions.includes(divisionCode.toLowerCase());
}

/**
 * Refresh the divisions cache (call after divisions are added/updated)
 */
async function refreshCache() {
  activeDivisionsCache = null;
  cacheExpiry = null;
  logger.info('[DivisionValidator] Cache cleared, will reload on next request');
}

/**
 * Get first active division (for default fallbacks)
 * @returns {Promise<string|null>} First active division code or null
 */
async function getFirstActiveDivision() {
  const divisions = await getActiveDivisionCodes();
  return divisions.length > 0 ? divisions[0] : null;
}

module.exports = {
  getActiveDivisionCodes,
  isValidDivision,
  refreshCache,
  getFirstActiveDivision
};
