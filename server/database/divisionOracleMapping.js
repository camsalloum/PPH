/**
 * Division Oracle Mapping Helper
 * Gets Oracle division codes that map to an admin division
 * 
 * Example: getDivisionOracleCodes('FP') returns ['FP', 'FB']
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// Auth database pool for company_divisions table
const authPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: 'ip_auth_database', // company_divisions is in auth database
  max: 5,
});

// Cache for division mappings
let divisionMappingCache = null;
let cacheExpiry = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get Oracle division codes that map to an admin division
 * @param {string} divisionCode - Admin division code (e.g., 'FP')
 * @returns {Promise<string[]>} - Array of Oracle codes (e.g., ['FP', 'FB'])
 */
async function getDivisionOracleCodes(divisionCode) {
  try {
    // Check cache
    if (divisionMappingCache && cacheExpiry && Date.now() < cacheExpiry) {
      const mapping = divisionMappingCache[divisionCode];
      if (mapping) {
        return mapping.mapped_oracle_codes || [];
      }
    }

    // Refresh cache
    await refreshDivisionCache();

    const mapping = divisionMappingCache[divisionCode];
    return mapping ? (mapping.mapped_oracle_codes || []) : [];

  } catch (error) {
    logger.error(`Error getting division oracle codes for ${divisionCode}:`, error);
    // Fallback: return just the division code itself
    return [divisionCode];
  }
}

/**
 * Refresh the division mapping cache
 */
async function refreshDivisionCache() {
  try {
    const result = await authPool.query(`
      SELECT 
        division_code,
        division_name,
        mapped_oracle_codes
      FROM company_divisions
      WHERE is_active = true
      ORDER BY display_order, division_code
    `);

    divisionMappingCache = {};
    result.rows.forEach(row => {
      divisionMappingCache[row.division_code] = {
        division_code: row.division_code,
        division_name: row.division_name,
        mapped_oracle_codes: row.mapped_oracle_codes || []
      };
    });

    cacheExpiry = Date.now() + CACHE_TTL;
    logger.info(`Division mapping cache refreshed: ${Object.keys(divisionMappingCache).length} divisions`);

  } catch (error) {
    logger.error('Failed to refresh division mapping cache:', error);
    throw error;
  }
}

/**
 * Get all active divisions
 * @returns {Promise<Object[]>} Array of division objects
 */
async function getAllDivisions() {
  try {
    if (!divisionMappingCache || !cacheExpiry || Date.now() >= cacheExpiry) {
      await refreshDivisionCache();
    }
    return Object.values(divisionMappingCache);
  } catch (error) {
    logger.error('Error getting all divisions:', error);
    return [];
  }
}

module.exports = {
  getDivisionOracleCodes,
  refreshDivisionCache,
  getAllDivisions
};
