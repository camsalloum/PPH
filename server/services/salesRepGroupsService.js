/**
 * Sales Rep Groups Service
 * Centralized service for sales rep group operations
 * Uses database as primary source, with JSON fallback for backward compatibility
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../database/config');
const logger = require('../utils/logger');

const SALES_REP_CONFIG_PATH = path.join(__dirname, '..', 'data', 'sales-reps-config.json');

// Cache for group data (refreshed every 5 minutes)
let groupCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load sales rep config from JSON (fallback)
 */
function loadSalesRepConfigFromJson() {
  try {
    if (fs.existsSync(SALES_REP_CONFIG_PATH)) {
      const data = fs.readFileSync(SALES_REP_CONFIG_PATH, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    logger.error('Error loading sales rep config from JSON', { error: error.message });
    return {};
  }
}

/**
 * Load sales rep groups from database
 */
async function loadGroupsFromDatabase() {
  try {
    const result = await pool.query(`
      SELECT g.group_name, g.division, 
             COALESCE(json_agg(m.member_name ORDER BY m.member_name) FILTER (WHERE m.member_name IS NOT NULL), '[]') as members
      FROM sales_rep_groups g
      LEFT JOIN sales_rep_group_members m ON g.id = m.group_id
      WHERE g.is_active = true
      GROUP BY g.id, g.group_name, g.division
    `);
    
    const config = {};
    result.rows.forEach(row => {
      if (!config[row.division]) {
        config[row.division] = { groups: {} };
      }
      config[row.division].groups[row.group_name] = row.members || [];
    });
    
    return config;
  } catch (error) {
    logger.error('Could not load groups from database', { error: error.message });
    return {};
  }
}

/**
 * Get cached config or refresh from database
 */
async function getConfig() {
  const now = Date.now();
  if (groupCache && (now - cacheTimestamp) < CACHE_TTL) {
    return groupCache;
  }
  
  groupCache = await loadGroupsFromDatabase();
  cacheTimestamp = now;
  return groupCache;
}

/**
 * Invalidate cache (call after modifications)
 */
function invalidateCache() {
  groupCache = null;
  cacheTimestamp = 0;
}

/**
 * Check if a sales rep name is a group
 */
async function isSalesRepGroup(division, salesRepName) {
  const config = await getConfig();
  const divisionConfig = config[division?.toUpperCase()];
  return divisionConfig && divisionConfig.groups && divisionConfig.groups[salesRepName] !== undefined;
}

/**
 * Synchronous version using cached data
 * Returns empty config if cache not yet loaded (server just started)
 */
function isSalesRepGroupSync(division, salesRepName) {
  if (!groupCache) return false;
  const divisionConfig = groupCache[division?.toUpperCase()];
  return divisionConfig && divisionConfig.groups && divisionConfig.groups[salesRepName] !== undefined;
}

/**
 * Get config synchronously (uses cache, falls back to JSON)
 */
function getConfigSync() {
  return groupCache || {};
}

/**
 * Get members of a group
 */
async function getGroupMembers(division, groupName) {
  const config = await getConfig();
  const divisionConfig = config[division?.toUpperCase()];
  return divisionConfig?.groups?.[groupName] || [];
}

/**
 * Synchronous version using cached data
 */
function getGroupMembersSync(division, groupName) {
  if (!groupCache) return [];
  const divisionConfig = groupCache[division?.toUpperCase()];
  return divisionConfig?.groups?.[groupName] || [];
}

/**
 * Get all groups for a division
 */
async function getGroupsForDivision(division) {
  const config = await getConfig();
  const divisionConfig = config[division?.toUpperCase()];
  return divisionConfig?.groups || {};
}

/**
 * Preload cache at startup
 */
async function preloadCache() {
  try {
    await getConfig();
    logger.info('Sales rep groups cache preloaded');
  } catch (error) {
    logger.warn('Could not preload sales rep groups cache', { error: error.message });
  }
}

module.exports = {
  loadSalesRepConfigFromJson,
  loadGroupsFromDatabase,
  getConfig,
  getConfigSync,
  invalidateCache,
  isSalesRepGroup,
  isSalesRepGroupSync,
  getGroupMembers,
  getGroupMembersSync,
  getGroupsForDivision,
  preloadCache,
  // Export path for backward compatibility
  SALES_REP_CONFIG_PATH
};
