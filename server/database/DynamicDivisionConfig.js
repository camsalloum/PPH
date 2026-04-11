/**
 * Dynamic Division Configuration
 * 
 * Replaces hardcoded divisionDatabaseConfig.js with dynamic loading
 * from company_settings table. Divisions should be managed via
 * Company Info page, not hardcoded.
 * 
 * @version 2.0
 * @date December 27, 2025
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// Cache for divisions
let divisionsCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute cache

// Auth pool for reading company_settings
let authPool = null;

/**
 * Get or create auth pool
 */
function getAuthPool() {
  if (!authPool) {
    authPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.AUTH_DB_NAME || 'ip_auth_database',
      max: 5
    });
  }
  return authPool;
}

/**
 * Get divisions from company_settings (with caching)
 * @returns {Promise<Array>} Array of division objects [{code, name, database?}]
 */
async function getDivisionsFromDB() {
  const now = Date.now();
  
  // Return cached if valid
  if (divisionsCache && (now - lastCacheTime) < CACHE_TTL) {
    return divisionsCache;
  }
  
  try {
    const pool = getAuthPool();
    const result = await pool.query(
      "SELECT setting_value FROM company_settings WHERE setting_key = 'divisions'"
    );
    
    if (result.rows.length > 0 && result.rows[0].setting_value) {
      let divisions = result.rows[0].setting_value;
      
      // Parse if string
      if (typeof divisions === 'string') {
        divisions = JSON.parse(divisions);
      }
      
      // Ensure it's an array
      if (Array.isArray(divisions) && divisions.length > 0) {
        divisionsCache = divisions;
        lastCacheTime = now;
        return divisions;
      }
    }
    
    // Default to FP only if nothing configured
    logger.warn('No divisions found in company_settings, defaulting to FP');
    return [{ code: 'FP', name: 'Flexible Packaging Division' }];
    
  } catch (error) {
    logger.error('Error fetching divisions from DB:', error.message);
    
    // Return cached if available, otherwise default
    if (divisionsCache) {
      return divisionsCache;
    }
    return [{ code: 'FP', name: 'Flexible Packaging Division' }];
  }
}

/**
 * Force refresh the cache
 */
function invalidateCache() {
  divisionsCache = null;
  lastCacheTime = 0;
}

/**
 * Get all active division codes
 * @returns {Promise<string[]>} Array of division codes
 */
async function getActiveDivisions() {
  const divisions = await getDivisionsFromDB();
  return divisions.map(d => d.code);
}

/**
 * Get all divisions with full info
 * @returns {Promise<Array>} Array of division objects
 */
async function getAllDivisions() {
  return getDivisionsFromDB();
}

/**
 * Check if a division exists
 * @param {string} code - Division code
 * @returns {Promise<boolean>}
 */
async function divisionExists(code) {
  const divisions = await getDivisionsFromDB();
  return divisions.some(d => d.code === code || d.code.toUpperCase() === code.toUpperCase());
}

/**
 * Get division info by code
 * @param {string} code - Division code
 * @returns {Promise<object|null>}
 */
async function getDivisionByCode(code) {
  const divisions = await getDivisionsFromDB();
  return divisions.find(d => d.code === code || d.code.toUpperCase() === code.toUpperCase()) || null;
}

/**
 * Get database configuration for a division
 * Database naming convention: {code.toLowerCase()}_database
 * Table naming convention: {code.toLowerCase()}_actualcommon
 * 
 * @param {string} code - Division code
 * @returns {object} Database config
 */
function getDivisionDatabaseConfig(code) {
  const prefix = code.toLowerCase();
  return {
    database: `${prefix}_database`,
    table: `${prefix}_actualcommon`,  // MIGRATED: was _data_excel
    pool: `${prefix}_pool`
  };
}

/**
 * Validate division code
 * @param {string} code - Division code
 * @returns {Promise<boolean>}
 */
async function validateDivision(code) {
  if (!code) {
    throw new Error('Division code is required');
  }
  
  const exists = await divisionExists(code);
  if (!exists) {
    const divisions = await getActiveDivisions();
    throw new Error(`Invalid division: ${code}. Active divisions: ${divisions.join(', ')}`);
  }
  
  return true;
}

module.exports = {
  getDivisionsFromDB,
  getActiveDivisions,
  getAllDivisions,
  divisionExists,
  getDivisionByCode,
  getDivisionDatabaseConfig,
  validateDivision,
  invalidateCache
};
