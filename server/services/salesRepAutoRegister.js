/**
 * @fileoverview Sales Rep Auto-Registration Service
 * @module services/salesRepAutoRegister
 * @description Automatically registers new sales rep names found in actual/budget data
 *              to the sales_rep_master table. Called after successful file uploads.
 * 
 * Created: June 2025
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database connection for fp_database
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

/**
 * Auto-register new sales reps from actual/budget data to sales_rep_master
 * 
 * This function:
 * 1. Queries distinct salesrepname from division data tables
 * 2. Compares against existing sales_rep_master entries
 * 3. Inserts new sales reps that don't already exist
 * 4. Uses Levenshtein-based fuzzy matching to avoid near-duplicates
 * 
 * @param {string} division - Division code (e.g., 'FP')
 * @param {string} [dataType='Actual'] - Type of data ('Actual' or 'Budget')
 * @returns {Promise<{added: number, skipped: number, errors: string[]}>}
 */
async function autoRegisterSalesReps(division, dataType = 'Actual') {
  const client = await pool.connect();
  const results = {
    added: 0,
    skipped: 0,
    errors: [],
    newNames: [],
    skippedNames: []
  };
  
  try {
    const divCode = division.toUpperCase();
    // Table name is division_code_actualcommon (e.g., fp_actualcommon)
    const tableName = `${divCode.toLowerCase()}_actualcommon`;
    
    logger.info(`🔄 Auto-registering sales reps from ${tableName}...`);
    
    // Step 1: Get all distinct sales rep names from data table
    const salesRepsResult = await client.query(`
      SELECT DISTINCT TRIM(salesrepname) as name
      FROM ${tableName}
      WHERE salesrepname IS NOT NULL 
        AND TRIM(salesrepname) != ''
        AND type = $1
      ORDER BY name
    `, [dataType]);
    
    const dataNames = salesRepsResult.rows.map(r => r.name);
    logger.info(`Found ${dataNames.length} distinct sales reps in ${tableName} (${dataType})`);
    
    if (dataNames.length === 0) {
      logger.info('No sales reps to process');
      return results;
    }
    
    // Step 2: Get existing sales rep master entries
    const masterResult = await client.query(`
      SELECT id, canonical_name, display_name 
      FROM sales_rep_master 
      WHERE division = $1 OR division IS NULL
    `, [divCode]);
    
    const existingMaster = masterResult.rows;
    const existingNamesLower = new Set(existingMaster.map(r => r.canonical_name.toLowerCase().trim()));
    
    logger.info(`Found ${existingMaster.length} existing master entries`);
    
    // Step 3: Also check aliases
    const aliasResult = await client.query(`
      SELECT alias_name FROM sales_rep_aliases
    `);
    const aliasNamesLower = new Set(aliasResult.rows.map(r => r.alias_name.toLowerCase().trim()));
    
    // Step 4: Find new names not in master or aliases
    const newNames = [];
    for (const name of dataNames) {
      const nameLower = name.toLowerCase().trim();
      
      // Skip if already exists in master
      if (existingNamesLower.has(nameLower)) {
        results.skipped++;
        results.skippedNames.push({ name, reason: 'exists in master' });
        continue;
      }
      
      // Skip if exists as alias
      if (aliasNamesLower.has(nameLower)) {
        results.skipped++;
        results.skippedNames.push({ name, reason: 'exists as alias' });
        continue;
      }
      
      // Check for fuzzy match (similar names)
      const fuzzyMatch = findFuzzyMatch(name, existingMaster);
      if (fuzzyMatch) {
        results.skipped++;
        results.skippedNames.push({ name, reason: `fuzzy match: ${fuzzyMatch.canonical_name}` });
        continue;
      }
      
      newNames.push(name);
    }
    
    logger.info(`${newNames.length} new sales reps to register`);
    
    // Step 5: Insert new names
    if (newNames.length > 0) {
      await client.query('BEGIN');
      
      for (const name of newNames) {
        try {
          await client.query(`
            INSERT INTO sales_rep_master (canonical_name, display_name, division, status)
            VALUES ($1, $2, $3, 'active')
            ON CONFLICT (canonical_name, division) DO NOTHING
          `, [name, name, divCode]);
          
          results.added++;
          results.newNames.push(name);
          logger.info(`  ✅ Registered: ${name}`);
        } catch (err) {
          results.errors.push(`Failed to add ${name}: ${err.message}`);
          logger.warn(`  ⚠️ Failed: ${name} - ${err.message}`);
        }
      }
      
      await client.query('COMMIT');
    }
    
    logger.info(`✅ Auto-registration complete: ${results.added} added, ${results.skipped} skipped`);
    return results;
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Auto-registration failed:', error);
    results.errors.push(error.message);
    return results;
  } finally {
    client.release();
  }
}

/**
 * Find fuzzy match in existing master using Levenshtein distance
 * @param {string} name - Name to check
 * @param {Array} masterList - Existing master entries
 * @returns {object|null} - Matching master entry or null
 */
function findFuzzyMatch(name, masterList, threshold = 0.85) {
  const nameLower = name.toLowerCase().trim();
  
  for (const master of masterList) {
    const masterLower = master.canonical_name.toLowerCase().trim();
    const similarity = calculateSimilarity(nameLower, masterLower);
    
    if (similarity >= threshold) {
      return master;
    }
  }
  
  return null;
}

/**
 * Calculate string similarity using Levenshtein distance
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} - Similarity ratio (0-1)
 */
function calculateSimilarity(s1, s2) {
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  return maxLength === 0 ? 1 : 1 - (distance / maxLength);
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} - Edit distance
 */
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  
  // Create matrix
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  // Fill matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return dp[m][n];
}

/**
 * Sync all sales reps from data tables to master
 * Run this to populate master table with all existing sales rep names
 * 
 * @param {string} division - Division code (e.g., 'FP')
 * @returns {Promise<object>} - Results summary
 */
async function syncAllSalesReps(division) {
  logger.info(`🔄 Full sync: Registering ALL sales reps for ${division}...`);
  
  const actualResults = await autoRegisterSalesReps(division, 'Actual');
  const budgetResults = await autoRegisterSalesReps(division, 'Budget');
  
  return {
    actual: actualResults,
    budget: budgetResults,
    total: {
      added: actualResults.added + budgetResults.added,
      skipped: actualResults.skipped + budgetResults.skipped
    }
  };
}

module.exports = {
  autoRegisterSalesReps,
  syncAllSalesReps,
  findFuzzyMatch,
  calculateSimilarity
};
