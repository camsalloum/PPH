/**
 * Sales Rep Configuration Cache
 * 
 * MIGRATED: Now wraps salesRepGroupsService.js (database-backed)
 * This file is kept for backward compatibility with existing imports.
 * All functions now delegate to the database-backed service.
 * 
 * @deprecated Import from salesRepGroupsService.js directly for new code
 */

const path = require('path');
const logger = require('../utils/logger');
const salesRepGroupsService = require('../services/salesRepGroupsService');

// Keep path for backward compatibility (some files may reference it)
const SALES_REP_CONFIG_PATH = path.join(__dirname, '..', 'data', 'sales-reps-config.json');

/**
 * Load sales rep config - ALWAYS from database cache
 * JSON file is no longer used as a data source
 */
function loadSalesRepConfig() {
  return salesRepGroupsService.getConfigSync();
}

/**
 * Check if a sales rep name is actually a group
 * Delegates to database-backed service
 */
function isSalesRepGroup(division, salesRepName) {
  return salesRepGroupsService.isSalesRepGroupSync(division, salesRepName);
}

/**
 * Get members of a sales rep group
 * Delegates to database-backed service
 */
function getGroupMembers(division, groupName) {
  return salesRepGroupsService.getGroupMembersSync(division, groupName);
}

/**
 * Find which group a sales rep belongs to (if any)
 */
function findGroupForSalesRep(division, salesRepName) {
  const config = loadSalesRepConfig();
  const divisionConfig = config[division?.toUpperCase()];
  
  if (!divisionConfig?.groups) return null;
  
  const normalizedName = String(salesRepName).trim().toUpperCase();
  
  for (const [groupName, members] of Object.entries(divisionConfig.groups)) {
    const normalizedMembers = members.map(m => String(m).trim().toUpperCase());
    if (normalizedMembers.includes(normalizedName)) {
      return groupName;
    }
  }
  
  return null;
}

/**
 * Get all configured sales reps for a division (individuals + groups)
 */
function getAllSalesReps(division) {
  const config = loadSalesRepConfig();
  const divisionConfig = config[division?.toUpperCase()];
  
  if (!divisionConfig) return { defaults: [], groups: {} };
  
  return {
    defaults: divisionConfig.defaults || [],
    groups: divisionConfig.groups || {}
  };
}

/**
 * Invalidate cache - delegates to database-backed service
 */
function invalidateCache() {
  salesRepGroupsService.invalidateCache();
  logger.info('🗑️ Sales rep config cache invalidated (via salesRepGroupsService)');
}

/**
 * Get cache status (for debugging)
 */
function getCacheStatus() {
  return {
    isCached: true,
    source: 'database-backed (salesRepGroupsService)',
    note: 'This wrapper delegates to salesRepGroupsService which uses DB with JSON fallback'
  };
}

module.exports = {
  loadSalesRepConfig,
  isSalesRepGroup,
  getGroupMembers,
  findGroupForSalesRep,
  getAllSalesReps,
  invalidateCache,
  getCacheStatus,
  SALES_REP_CONFIG_PATH
};
