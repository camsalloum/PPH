/**
 * @fileoverview Product Group Service
 * @module services/productGroupService
 * @description Single source of truth for product group resolution and exclusion
 * 
 * Flow: Raw ProductGroup → fp_raw_product_groups → PGCombine
 *       Optional: ItemGroupDescription → fp_item_group_overrides → Override PGCombine
 * 
 * Exclusions: Managed via is_unmapped flag in fp_raw_product_groups table
 *             Admin controls this via Master Data > Raw Product Groups UI
 * 
 * Created: December 2025
 */

const { getDivisionPool } = require('../utils/divisionDatabaseManager');
const logger = require('../utils/logger');

// Cache for product group mappings (refresh on demand)
let pgMappingCache = new Map(); // division -> { rawPG: { pgCombine, isExcluded } }
let itemOverrideCache = new Map(); // division -> { itemDesc: pgCombine }
let cacheTimestamp = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load product group mappings for a division into cache
 */
async function loadPGMappingCache(division = 'FP') {
  try {
    const pool = await getDivisionPool(division);
    const prefix = division.toLowerCase();
    
    // Load raw product group mappings
    const mappingsResult = await pool.query(`
      SELECT raw_product_group, pg_combine, is_unmapped 
      FROM ${prefix}_raw_product_groups
    `);
    
    const mappings = {};
    mappingsResult.rows.forEach(row => {
      const rawLower = row.raw_product_group.toLowerCase().trim();
      mappings[rawLower] = {
        pgCombine: row.pg_combine,
        isExcluded: row.is_unmapped === true
      };
    });
    pgMappingCache.set(division, mappings);
    
    // Load item group description overrides
    const overridesResult = await pool.query(`
      SELECT item_group_description, pg_combine 
      FROM ${prefix}_item_group_overrides
    `);
    
    const overrides = {};
    overridesResult.rows.forEach(row => {
      const itemLower = row.item_group_description.toLowerCase().trim();
      overrides[itemLower] = row.pg_combine;
    });
    itemOverrideCache.set(division, overrides);
    
    cacheTimestamp = Date.now();
    logger.info(`✅ ProductGroupService: Loaded ${Object.keys(mappings).length} mappings, ${Object.keys(overrides).length} overrides for ${division}`);
    
    return { mappings, overrides };
  } catch (error) {
    logger.error(`Failed to load PG mapping cache for ${division}:`, error);
    throw error;
  }
}

/**
 * Ensure cache is loaded and fresh
 */
async function ensureCache(division = 'FP') {
  const now = Date.now();
  if (!pgMappingCache.has(division) || !cacheTimestamp || (now - cacheTimestamp) > CACHE_TTL_MS) {
    await loadPGMappingCache(division);
  }
}

/**
 * Resolve a raw product group to its PGCombine
 * @param {string} division - Division code (FP, HC, etc.)
 * @param {string} rawProductGroup - Raw product group name from data
 * @param {string} [itemGroupDescription] - Optional item group description for override
 * @returns {Promise<{pgCombine: string|null, isExcluded: boolean}>}
 */
async function resolveProductGroup(division, rawProductGroup, itemGroupDescription = null) {
  await ensureCache(division);
  
  const mappings = pgMappingCache.get(division) || {};
  const overrides = itemOverrideCache.get(division) || {};
  
  // Check item override first
  if (itemGroupDescription) {
    const itemLower = itemGroupDescription.toLowerCase().trim();
    if (overrides[itemLower]) {
      return {
        pgCombine: overrides[itemLower],
        isExcluded: false // Item overrides are never excluded
      };
    }
  }
  
  // Fall back to raw product group mapping
  const rawLower = rawProductGroup.toLowerCase().trim();
  const mapping = mappings[rawLower];
  
  if (mapping) {
    return {
      pgCombine: mapping.pgCombine,
      isExcluded: mapping.isExcluded
    };
  }
  
  // No mapping found - treat as unmapped (should show in admin UI)
  return {
    pgCombine: null,
    isExcluded: false
  };
}

/**
 * Check if a product group is excluded
 * @param {string} division - Division code
 * @param {string} rawProductGroup - Raw product group name
 * @returns {Promise<boolean>}
 */
async function isExcluded(division, rawProductGroup) {
  const result = await resolveProductGroup(division, rawProductGroup);
  return result.isExcluded;
}

/**
 * Get all valid (non-excluded) PGCombines for a division
 * @param {string} division - Division code
 * @returns {Promise<string[]>}
 */
async function getValidPGCombines(division = 'FP') {
  await ensureCache(division);
  
  const mappings = pgMappingCache.get(division) || {};
  const validPGs = new Set();
  
  Object.values(mappings).forEach(mapping => {
    if (!mapping.isExcluded && mapping.pgCombine && mapping.pgCombine.trim()) {
      validPGs.add(mapping.pgCombine);
    }
  });
  
  return Array.from(validPGs).sort();
}

/**
 * Get excluded product group names for admin display
 * @param {string} division - Division code
 * @returns {Promise<string[]>}
 */
async function getExcludedProductGroups(division = 'FP') {
  await ensureCache(division);
  
  const mappings = pgMappingCache.get(division) || {};
  const excluded = [];
  
  Object.entries(mappings).forEach(([rawPG, mapping]) => {
    if (mapping.isExcluded) {
      excluded.push(rawPG);
    }
  });
  
  return excluded;
}

/**
 * Build SQL CASE expression for resolving product groups in queries
 * This generates SQL that maps raw product groups to PGCombine and excludes is_unmapped
 * 
 * @param {string} division - Division code
 * @param {string} rawColumn - Column name containing raw product group (e.g., 'd.productgroup')
 * @param {string} itemColumn - Column name containing item group description (e.g., 'd.itemgroupdescription')
 * @returns {string} SQL expression
 */
function buildResolutionSQL(division, rawColumn = 'productgroup', itemColumn = 'itemgroupdescription') {
  const prefix = division.toLowerCase();
  
  // Use COALESCE with LEFT JOINs to prefer item override, then raw mapping
  return `COALESCE(igo.pg_combine, rpg.pg_combine)`;
}

/**
 * Build SQL JOIN clauses for product group resolution
 * @param {string} division - Division code
 * @param {string} dataTableAlias - Alias of the data table (e.g., 'd')
 * @returns {string} SQL JOIN clauses
 */
function buildResolutionJoins(division, dataTableAlias = 'd') {
  const prefix = division.toLowerCase();
  
  return `
    INNER JOIN ${prefix}_raw_product_groups rpg 
      ON LOWER(TRIM(${dataTableAlias}.productgroup)) = LOWER(TRIM(rpg.product_group))
    LEFT JOIN ${prefix}_item_group_overrides igo 
      ON LOWER(TRIM(${dataTableAlias}.itemgroupdescription)) = LOWER(TRIM(igo.item_group_description))
  `;
}

/**
 * Build WHERE clause for excluding unmapped/excluded product groups
 * @param {string} division - Division code
 * @returns {string} SQL WHERE clause condition
 */
function buildExclusionFilter(division) {
  return `
    COALESCE(igo.pg_combine, rpg.pg_combine) IS NOT NULL
    AND LOWER(TRIM(COALESCE(igo.pg_combine, rpg.pg_combine))) != 'not in pg'
  `;
}

/**
 * Clear cache (call after admin makes changes)
 */
function clearCache(division = null) {
  if (division) {
    pgMappingCache.delete(division);
    itemOverrideCache.delete(division);
  } else {
    pgMappingCache.clear();
    itemOverrideCache.clear();
  }
  cacheTimestamp = null;
  logger.info(`🔄 ProductGroupService: Cache cleared ${division ? `for ${division}` : '(all)'}`);
}

/**
 * Get product groups by sales rep with proper resolution and exclusion
 * This replaces the inconsistent getProductGroupsBySalesRep methods
 * 
 * @param {string} division - Division code
 * @param {string|string[]} salesReps - Sales rep name(s)
 * @returns {Promise<string[]>} Array of resolved PGCombine names
 */
async function getProductGroupsBySalesRep(division, salesReps) {
  const pool = await getDivisionPool(division);
  
  // Normalize to array
  const repsArray = Array.isArray(salesReps) ? salesReps : [salesReps];
  const placeholders = repsArray.map((_, i) => `$${i + 1}`).join(', ');
  
  // UNIFIED: Get product groups from BOTH actual AND budget tables
  // This ensures Budget-only product groups are included
  const query = `
    SELECT DISTINCT pgcombine FROM (
      -- Product groups from actual data
      SELECT INITCAP(LOWER(TRIM(d.pgcombine))) as pgcombine
      FROM fp_actualcommon d
      LEFT JOIN fp_product_group_exclusions e
        ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(TRIM(e.division_code)) = UPPER($${repsArray.length + 1})
      WHERE TRIM(UPPER(d.sales_rep_group_name)) IN (${placeholders})
        AND UPPER(d.admin_division_code) = UPPER($${repsArray.length + 1})
        AND e.product_group IS NULL
        AND d.pgcombine IS NOT NULL
        AND TRIM(d.pgcombine) != ''
        AND LOWER(TRIM(d.pgcombine)) != 'not in pg'
      
      UNION
      
      -- Product groups from budget data (for Budget-only PGs)
      SELECT INITCAP(LOWER(TRIM(b.pgcombine))) as pgcombine
      FROM fp_budget_unified b
      LEFT JOIN fp_product_group_exclusions e
        ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(TRIM(e.division_code)) = UPPER($${repsArray.length + 1})
      WHERE TRIM(UPPER(b.sales_rep_group_name)) IN (${placeholders})
        AND UPPER(b.budget_type) = 'SALES_REP'
        AND b.is_budget = true
        AND e.product_group IS NULL
        AND b.pgcombine IS NOT NULL
        AND TRIM(b.pgcombine) != ''
        AND LOWER(TRIM(b.pgcombine)) != 'not in pg'
    ) all_pgs
    ORDER BY pgcombine
  `;
  
  const params = [...repsArray.map(r => String(r).trim().toUpperCase()), division];
  const result = await pool.query(query, params);
  
  return result.rows.map(row => row.pgcombine).filter(Boolean);
}

/**
 * Get all unique product groups for a division with proper resolution
 * FIX 2025-01-26: Use fp_actualcommon directly with pgcombine column
 * @param {string} division - Division code
 * @returns {Promise<string[]>} Array of resolved PGCombine names
 */
async function getAllProductGroups(division) {
  const pool = await getDivisionPool(division);
  
  // FIX 2025-01-26: Use fp_actualcommon directly with pgcombine column
  // Apply LEFT JOIN exclusion pattern (consistent with all other queries)
  const query = `
    SELECT DISTINCT INITCAP(LOWER(TRIM(d.pgcombine))) as pgcombine
    FROM fp_actualcommon d
    LEFT JOIN fp_product_group_exclusions e
      ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
      AND UPPER(TRIM(e.division_code)) = UPPER($1)
    WHERE UPPER(d.admin_division_code) = UPPER($1)
      AND e.product_group IS NULL
      AND d.pgcombine IS NOT NULL
      AND TRIM(d.pgcombine) != ''
      AND LOWER(TRIM(d.pgcombine)) != 'not in pg'
    ORDER BY pgcombine
  `;
  
  const result = await pool.query(query, [division]);
  return result.rows.map(row => row.pgcombine).filter(Boolean);
}

module.exports = {
  // Core resolution
  resolveProductGroup,
  isExcluded,
  getValidPGCombines,
  getExcludedProductGroups,
  
  // SQL builders for use in other services
  buildResolutionSQL,
  buildResolutionJoins,
  buildExclusionFilter,
  
  // Replacement methods for inconsistent queries
  getProductGroupsBySalesRep,
  getAllProductGroups,
  
  // Cache management
  loadPGMappingCache,
  clearCache
};
