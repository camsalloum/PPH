/**
 * Division-Level Customer Merge Rules API Routes
 *
 * Endpoints for managing AI-powered customer merge rules
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { pool } = require('../database/config');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

// Lazy-load heavy AI module (loads NLP deps like 'natural').
// This avoids adding several seconds to backend startup when routes mount.
let _customerMergingAI;
function getCustomerMergingAI() {
  if (!_customerMergingAI) {
    // eslint-disable-next-line global-require
    _customerMergingAI = require('../services/CustomerMergingAI');
  }
  return _customerMergingAI;
}

// Lazy-load AI Learning Service
let _aiLearningService;
function getAILearningService() {
  if (!_aiLearningService) {
    // eslint-disable-next-line global-require
    _aiLearningService = require('../services/AILearningService');
  }
  return _aiLearningService;
}

const VALID_DIVISION_CODES = new Set(['fp', 'hc']);

/**
 * Helper function to extract division code from full division name
 * e.g., "FP-UAE" -> "fp", "FP" -> "fp"
 */
function extractDivisionCode(division) {
  if (!division) return 'fp';
  const rawCode = String(division).trim().split('-')[0].toLowerCase();
  const safeCode = rawCode.replace(/[^a-z]/g, '');

  if (VALID_DIVISION_CODES.has(safeCode)) {
    return safeCode;
  }

  logger.warn(`Invalid division code received in divisionMergeRules route: "${division}". Defaulting to fp.`);
  return 'fp';
}

/**
 * Helper function to get the correct database pool for a division
 */
function getPoolForDivision(division) {
  const divisionCode = extractDivisionCode(division);
  return getDivisionPool(divisionCode.toUpperCase());
}

/**
 * Helper function to get division-specific table names
 */
function getTableNames(division) {
  const code = extractDivisionCode(division);
  return {
    divisionMergeRules: `${code}_division_customer_merge_rules`,
    mergeRuleSuggestions: `${code}_merge_rule_suggestions`,
    mergeRuleNotifications: `${code}_merge_rule_notifications`,
    mergeRuleRejections: `${code}_merge_rule_rejections`,
    // DEPRECATED: dataExcel removed - use actualcommon
    actualcommon: `${code}_actualcommon`,
    budgetUnified: `${code}_budget_unified`,
    prospects: `${code}_prospects`
  };
}

/**
 * Helper function to deduplicate and clean customer array
 * Removes duplicates (case-insensitive, trim whitespace)
 * @param {string[]} customers - Array of customer names
 * @returns {string[]} - Deduplicated array with trimmed names
 */
function deduplicateCustomers(customers) {
  if (!Array.isArray(customers)) return [];
  const seen = new Map();
  customers.forEach(customer => {
    if (!customer) return;
    const trimmed = customer.toString().trim();
    if (!trimmed) return;
    const normalized = trimmed.toLowerCase();
    if (!seen.has(normalized)) {
      seen.set(normalized, trimmed);
    }
  });
  return Array.from(seen.values());
}

/**
 * Helper function to check if any customer in a list already exists in another active merge rule
 * Also checks if the merged_customer_name already exists as a rule (prevents duplicates)
 * @param {object} divisionPool - Database pool
 * @param {object} tables - Table names
 * @param {string} division - Division name
 * @param {string[]} customers - Array of customer names to check
 * @param {number|null} excludeRuleId - Rule ID to exclude from check (for updates)
 * @param {string|null} mergedName - The merged customer name to check for duplicates
 * @returns {Promise<{hasConflict: boolean, conflictingCustomer: string|null, conflictingRule: string|null, isDuplicateRule: boolean}>}
 */
async function checkCustomerConflicts(divisionPool, tables, division, customers, excludeRuleId = null, mergedName = null) {
  // Get all active rules
  let query = `
    SELECT id, merged_customer_name, original_customers
    FROM ${tables.divisionMergeRules}
    WHERE division = $1 AND is_active = true
  `;
  const params = [division];
  
  if (excludeRuleId) {
    query += ` AND id != $2`;
    params.push(excludeRuleId);
  }
  
  const result = await divisionPool.query(query, params);
  
  // Build a map of normalized customer names to their merge rule
  const customerToRule = new Map();
  const existingMergedNames = new Set();
  
  result.rows.forEach(rule => {
    // Track existing merged names to prevent duplicate rules
    if (rule.merged_customer_name) {
      existingMergedNames.add(rule.merged_customer_name.toLowerCase().trim());
    }
    
    const originals = Array.isArray(rule.original_customers)
      ? rule.original_customers
      : JSON.parse(rule.original_customers || '[]');
    
    originals.forEach(orig => {
      if (orig) {
        const normalized = orig.toLowerCase().trim();
        customerToRule.set(normalized, rule.merged_customer_name);
      }
    });
  });
  
  // CRITICAL: Check if merged name already exists as another rule (prevents duplicates!)
  if (mergedName && existingMergedNames.has(mergedName.toLowerCase().trim())) {
    return {
      hasConflict: true,
      conflictingCustomer: mergedName,
      conflictingRule: mergedName,
      isDuplicateRule: true
    };
  }
  
  // Check if any of the provided customers already exist in another rule
  for (const customer of customers) {
    if (!customer) continue;
    const normalized = customer.toLowerCase().trim();
    if (customerToRule.has(normalized)) {
      return {
        hasConflict: true,
        conflictingCustomer: customer,
        conflictingRule: customerToRule.get(normalized),
        isDuplicateRule: false
      };
    }
  }
  
  return { hasConflict: false, conflictingCustomer: null, conflictingRule: null, isDuplicateRule: false };
}

// ========================================================================
// BASE ENDPOINT - List rules directly (backwards compatibility)
// ========================================================================

/**
 * GET /api/division-merge-rules
 * List all merge rules for a division (called without /rules suffix)
 */
router.get('/', async (req, res) => {
  try {
    const { division } = req.query;
    
    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }
    
    const DivisionMergeRulesService = require('../database/DivisionMergeRulesService');
    const rules = await DivisionMergeRulesService.listRules(division);
    res.json({ success: true, data: rules });
  } catch (error) {
    logger.error('Error listing division merge rules', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================================
// AI SUGGESTIONS ENDPOINTS
// ========================================================================

/**
 * POST /api/division-merge-rules/scan
 * Run AI scan to find duplicate customers
 */
router.post('/scan', async (req, res) => {
  try {
    const { division, minConfidence, maxGroupSize } = req.body;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    logger.info(`🤖 Running AI scan for division: ${division}`);

    const CustomerMergingAI = getCustomerMergingAI();
    const result = await CustomerMergingAI.scanAndSuggestMerges(division, {
      minConfidence: minConfidence || 0.75,
      maxGroupSize: maxGroupSize || 5
    });

    res.json({
      success: true,
      data: result.suggestions,
      count: result.savedCount  // Actual number saved, not filtered count
    });

  } catch (error) {
    logger.error('AI scan error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/division-merge-rules/customer-master-view
 * Get complete customer master view with merge rules applied
 * Returns all unique customers (merged and unmerged) with:
 * - Country, Sales Rep (grouped), Total Sales, Last Transaction Date
 */
router.get('/customer-master-view', async (req, res) => {
  try {
    const { division, search } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const divisionCode = extractDivisionCode(division);
    const budgetTable = `${divisionCode}_sales_rep_budget`;

    logger.info(`📊 Building customer master view for division: ${division}`);

    // Get all merge rules
    const mergeRulesResult = await divisionPool.query(`
      SELECT merged_customer_name, original_customers
      FROM ${tables.divisionMergeRules}
      WHERE division = $1 AND is_active = true
    `, [division]);

    // Build merge lookup: original_name -> merged_name
    const mergeMap = new Map();
    mergeRulesResult.rows.forEach(rule => {
      const originals = rule.original_customers || [];
      originals.forEach(original => {
        mergeMap.set(original.toLowerCase().trim(), rule.merged_customer_name);
      });
    });

    // Get all customer data from fp_actualcommon with aggregation
    // Use customer_name_unified if available, otherwise fall back to customer_name
    const customerNameColumnResult = await divisionPool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name IN ('customer_name_unified', 'customer_name')
    `, [tables.actualcommon]);

    const hasUnifiedCustomerName = customerNameColumnResult.rows.some(
      row => row.column_name === 'customer_name_unified'
    );
    const customerNameColumn = hasUnifiedCustomerName ? 'customer_name_unified' : 'customer_name';

    const excelQuery = `
      SELECT 
        ${customerNameColumn} as customer_name,
        sales_rep_name as sales_rep,
        country as country,
        SUM(amount) as total_sales,
        MAX(CONCAT(year, '-', LPAD(month_no::text, 2, '0'), '-01'))::date as last_transaction_date
      FROM fp_actualcommon
      WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
        AND ${customerNameColumn} IS NOT NULL 
        AND ${customerNameColumn} != ''
        AND TRIM(${customerNameColumn}) != ''
      GROUP BY ${customerNameColumn}, sales_rep_name, country
    `;

    const [excelResult, budgetResult, prospectsResult] = await Promise.all([
      divisionPool.query(excelQuery, [division]),
      divisionPool.query(`
        SELECT 
          customer_name as customer_name,
          sales_rep_name as sales_rep,
          country as country,
          MAX(CONCAT(budget_year, '-', LPAD(month_no::text, 2, '0'), '-01'))::date as last_activity_date
        FROM ${tables.budgetUnified}
        WHERE UPPER(TRIM(division_code)) = UPPER($1)
          AND customer_name IS NOT NULL
          AND customer_name != ''
          AND TRIM(customer_name) != ''
        GROUP BY customer_name, sales_rep_name, country
      `, [division]).catch(() => ({ rows: [] })),
      // Also get prospects from fp_prospects table
      divisionPool.query(`
        SELECT 
          customer_name,
          country,
          sales_rep_group as sales_rep,
          budget_year,
          created_at as last_activity_date
        FROM ${tables.prospects}
        WHERE UPPER(TRIM(division)) = UPPER($1)
      `, [division]).catch(() => ({ rows: [] }))
    ]);

    // Get sales rep groupings if available
    let salesRepGroups = new Map();
    try {
      const groupsResult = await divisionPool.query(`
        SELECT raw_sales_rep_name, grouped_sales_rep_name
        FROM ${divisionCode}_sales_rep_groups
        WHERE is_active = true
      `);
      groupsResult.rows.forEach(g => {
        salesRepGroups.set(g.raw_sales_rep_name?.toLowerCase(), g.grouped_sales_rep_name);
      });
    } catch (e) {
      // Table might not exist, ignore
    }

    // Aggregate by customer (applying merge rules)
    const customerMap = new Map();

    for (const row of excelResult.rows) {
      const rawName = row.customer_name;
      // Apply merge rule if exists
      const mergedName = mergeMap.get(rawName.toLowerCase().trim()) || rawName;
      const key = mergedName.toLowerCase().trim();

      // Apply sales rep grouping
      const groupedSalesRep = salesRepGroups.get(row.sales_rep?.toLowerCase()) || row.sales_rep;

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customer_name: mergedName,
          is_merged: mergeMap.has(rawName.toLowerCase().trim()),
          is_prospect: false,
          original_names: new Set(),
          countries: new Set(),
          sales_reps: new Set(),
          total_sales: 0,
          last_transaction_date: null
        });
      }

      const customer = customerMap.get(key);
      customer.original_names.add(rawName);
      if (row.country) customer.countries.add(row.country);
      if (groupedSalesRep) customer.sales_reps.add(groupedSalesRep);
      customer.total_sales += parseFloat(row.total_sales) || 0;
      
      const txnDate = row.last_transaction_date;
      if (txnDate && (!customer.last_transaction_date || txnDate > customer.last_transaction_date)) {
        customer.last_transaction_date = txnDate;
      }
    }

    // Add budget-only customers (no sales totals, but complete customer coverage)
    for (const row of budgetResult.rows) {
      const rawName = row.customer_name;
      const mergedName = mergeMap.get(rawName.toLowerCase().trim()) || rawName;
      const key = mergedName.toLowerCase().trim();

      const groupedSalesRep = salesRepGroups.get(row.sales_rep?.toLowerCase()) || row.sales_rep;

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customer_name: mergedName,
          is_merged: mergeMap.has(rawName.toLowerCase().trim()),
          is_prospect: false,
          original_names: new Set(),
          countries: new Set(),
          sales_reps: new Set(),
          total_sales: 0,
          last_transaction_date: null
        });
      }

      const customer = customerMap.get(key);
      customer.original_names.add(rawName);
      if (row.country) customer.countries.add(row.country);
      if (groupedSalesRep) customer.sales_reps.add(groupedSalesRep);

      const budgetDate = row.last_activity_date;
      if (budgetDate && (!customer.last_transaction_date || budgetDate > customer.last_transaction_date)) {
        customer.last_transaction_date = budgetDate;
      }
    }

    // Add prospects from fp_prospects table ONLY (the authoritative source)
    // Build a Set of prospect customer names for quick lookup
    const prospectNames = new Set();
    for (const row of prospectsResult.rows) {
      prospectNames.add(row.customer_name.toLowerCase().trim());
    }
    
    for (const row of prospectsResult.rows) {
      const rawName = row.customer_name;
      const mergedName = mergeMap.get(rawName.toLowerCase().trim()) || rawName;
      const key = mergedName.toLowerCase().trim();

      const groupedSalesRep = salesRepGroups.get(row.sales_rep?.toLowerCase()) || row.sales_rep;

      if (!customerMap.has(key)) {
        // This is a new prospect not in actual sales or budget
        customerMap.set(key, {
          customer_name: mergedName,
          is_merged: mergeMap.has(rawName.toLowerCase().trim()),
          is_prospect: true,  // From fp_prospects, so definitely a prospect
          original_names: new Set([rawName]),
          countries: row.country ? new Set([row.country]) : new Set(),
          sales_reps: groupedSalesRep ? new Set([groupedSalesRep]) : new Set(),
          total_sales: 0,
          last_transaction_date: row.last_activity_date
        });
      } else {
        // Customer exists - update their info
        const customer = customerMap.get(key);
        customer.original_names.add(rawName);
        if (row.country) customer.countries.add(row.country);
        if (groupedSalesRep) customer.sales_reps.add(groupedSalesRep);
        
        // Mark as prospect ONLY if:
        // 1. They're in fp_prospects table AND
        // 2. They have no actual sales (total_sales = 0)
        // If they have actual sales, they've already converted!
        if (customer.total_sales === 0 && prospectNames.has(rawName.toLowerCase().trim())) {
          customer.is_prospect = true;
        }
      }
    }

    // Convert to array
    let customers = Array.from(customerMap.values()).map(c => ({
      customer_name: c.customer_name,
      is_merged: c.is_merged,
      is_prospect: c.is_prospect || false,
      merged_from_count: c.original_names.size > 1 ? c.original_names.size : 0,
      countries: Array.from(c.countries),
      sales_reps: Array.from(c.sales_reps),
      total_sales: c.total_sales,
      last_transaction_date: c.last_transaction_date
    }));

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      customers = customers.filter(c => 
        c.customer_name.toLowerCase().includes(searchLower) ||
        c.countries.some(co => co.toLowerCase().includes(searchLower)) ||
        c.sales_reps.some(sr => sr.toLowerCase().includes(searchLower))
      );
    }

    // Sort by customer name
    customers.sort((a, b) => a.customer_name.localeCompare(b.customer_name));

    // Get company currency
    let companyCurrency = 'AED';
    try {
      const { authPool } = require('../database/config');
      const currResult = await authPool.query(`
        SELECT setting_value FROM company_settings WHERE setting_key = 'company_currency'
      `);
      if (currResult.rows[0]?.setting_value) {
        const curr = currResult.rows[0].setting_value;
        companyCurrency = typeof curr === 'string' ? JSON.parse(curr).code : curr.code;
      }
    } catch (e) {
      // Use default
    }

    const prospectsCount = customers.filter(c => c.is_prospect).length;
    logger.info(`📊 Customer master view: ${customers.length} unique customers (${prospectsCount} prospects)`);

    res.json({
      success: true,
      data: {
        customers: customers,
        totalCustomers: customers.length,
        mergedCount: customers.filter(c => c.is_merged).length,
        prospectsCount: prospectsCount,
        currency: companyCurrency
      }
    });

  } catch (error) {
    logger.error('Customer master view error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/division-merge-rules/scan-with-source
 * Scan customers and return with source data (table, raw sales rep, country)
 * NEW: Redesigned scan that shows where data comes from
 */
router.post('/scan-with-source', async (req, res) => {
  try {
    const { division } = req.body;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const divisionCode = extractDivisionCode(division);

    logger.info(`📊 Scanning customers with source data for division: ${division}`);

    // Get raw_divisions array from divisions table (e.g., ['FP', 'BF'] for FP division)
    const divisionConfigResult = await pool.query(
      `SELECT raw_divisions FROM divisions WHERE UPPER(division_code) = UPPER($1)`,
      [divisionCode]
    );
    
    // Use raw_divisions if found, otherwise fall back to just the division code
    let rawDivisions = [divisionCode.toUpperCase()];
    if (divisionConfigResult.rows.length > 0 && divisionConfigResult.rows[0].raw_divisions) {
      rawDivisions = divisionConfigResult.rows[0].raw_divisions.map(d => d.toUpperCase());
    }
    
    logger.info(`📊 Using raw_divisions filter: ${rawDivisions.join(', ')}`);

    // Get all unique customers from fp_actualcommon (SOURCE OF TRUTH)
    // This contains all actual transaction data
    // Use ANY($1) to match any of the raw_divisions (e.g., FP or BF)
    const actualCustomersQuery = `
      SELECT DISTINCT
        customer_name as customer_name,
        'fp_actualcommon' as source_table,
        sales_rep_name as raw_sales_rep,
        country as country,
        year,
        month_no as month,
        COUNT(*) as transaction_count,
        SUM(amount) as total_sales,
        SUM(qty_kgs) as total_kgs
      FROM ${tables.actualcommon}
      WHERE customer_name IS NOT NULL 
        AND customer_name != ''
        AND TRIM(customer_name) != ''
        AND UPPER(admin_division_code) = ANY($1)
      GROUP BY customer_name, sales_rep_name, country, year, month_no
      ORDER BY customer_name
    `;

    // Get all unique customers from fp_budget_unified (SOURCE OF TRUTH)
    // This is the unified budget table for all years
    const budgetCustomersQuery = `
      SELECT DISTINCT
        customer_name as customer_name,
        'fp_budget_unified' as source_table,
        sales_rep_name as raw_sales_rep,
        country as country,
        budget_year as year,
        month_no as month,
        COUNT(*) as transaction_count,
        SUM(amount) as total_budget
      FROM ${tables.budgetUnified}
      WHERE customer_name IS NOT NULL 
        AND customer_name != ''
        AND TRIM(customer_name) != ''
        AND UPPER(division_code) = ANY($1)
      GROUP BY customer_name, sales_rep_name, country, budget_year, month_no
      ORDER BY customer_name
    `;

    const [actualResult, budgetResult] = await Promise.all([
      divisionPool.query(actualCustomersQuery, [rawDivisions]),
      divisionPool.query(budgetCustomersQuery, [rawDivisions]).catch(() => ({ rows: [] })) // Budget table might not exist
    ]);

    // Combine and enrich data
    const customerMap = new Map();
    
    // Add actual customers (from fp_actualcommon)
    for (const row of actualResult.rows) {
      const key = row.customer_name.toLowerCase().trim();
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customer_name: row.customer_name,
          sources: [],
          total_transactions: 0,
          total_sales: 0,
          total_kgs: 0,
          countries: new Set(),
          raw_sales_reps: new Set()
        });
      }
      const customer = customerMap.get(key);
      customer.sources.push({
        table: row.source_table,
        raw_sales_rep: row.raw_sales_rep,
        country: row.country,
        transaction_count: parseInt(row.transaction_count),
        total_sales: parseFloat(row.total_sales || 0),
        total_kgs: parseFloat(row.total_kgs || 0)
      });
      customer.total_transactions += parseInt(row.transaction_count);
      customer.total_sales += parseFloat(row.total_sales || 0);
      customer.total_kgs += parseFloat(row.total_kgs || 0);
      if (row.country) customer.countries.add(row.country);
      if (row.raw_sales_rep) customer.raw_sales_reps.add(row.raw_sales_rep);
    }

    // Add budget customers
    for (const row of budgetResult.rows) {
      const key = row.customer_name.toLowerCase().trim();
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customer_name: row.customer_name,
          sources: [],
          total_transactions: 0,
          total_budget: 0,
          countries: new Set(),
          raw_sales_reps: new Set()
        });
      }
      const customer = customerMap.get(key);
      customer.sources.push({
        table: row.source_table,
        raw_sales_rep: row.raw_sales_rep,
        country: row.country,
        transaction_count: parseInt(row.transaction_count),
        total_budget: parseFloat(row.total_budget || 0)
      });
      customer.total_transactions += parseInt(row.transaction_count);
      customer.total_budget = (customer.total_budget || 0) + parseFloat(row.total_budget || 0);
      if (row.country) customer.countries.add(row.country);
      if (row.raw_sales_rep) customer.raw_sales_reps.add(row.raw_sales_rep);
    }

    // Convert to array and format
    const customers = Array.from(customerMap.values()).map(customer => ({
      customer_name: customer.customer_name,
      sources: customer.sources,
      source_tables: [...new Set(customer.sources.map(s => s.table))],
      countries: Array.from(customer.countries),
      raw_sales_reps: Array.from(customer.raw_sales_reps),
      total_transactions: customer.total_transactions,
      total_sales: customer.total_sales || 0,
      total_kgs: customer.total_kgs || 0,
      total_budget: customer.total_budget || 0
    }));

    // Calculate unique customer counts
    const actualCustomerNames = new Set();
    const budgetCustomerNames = new Set();
    
    actualResult.rows.forEach(row => {
      if (row.customer_name) {
        actualCustomerNames.add(row.customer_name.toLowerCase().trim());
      }
    });
    
    budgetResult.rows.forEach(row => {
      if (row.customer_name) {
        budgetCustomerNames.add(row.customer_name.toLowerCase().trim());
      }
    });
    
    // Count customers ONLY in budget (not in actual) - this is "budget-only"
    const budgetOnlyCustomerNames = new Set(
      [...budgetCustomerNames].filter(name => !actualCustomerNames.has(name))
    );
    
    // Get the REAL prospects count from fp_prospects table
    let prospectsCount = 0;
    try {
      const prospectsResult = await divisionPool.query(`
        SELECT COUNT(*) as count FROM ${tables.prospects}
        WHERE UPPER(TRIM(division)) = UPPER($1)
          AND status IN ('lead', 'prospect')
          AND converted_to_customer = false
      `, [division]);
      prospectsCount = parseInt(prospectsResult.rows[0]?.count || 0);
    } catch (e) {
      // Table might not exist, use 0
      prospectsCount = 0;
    }
    
    logger.info(`📊 Found ${customers.length} unique customers from ${actualResult.rows.length} actual records (fp_actualcommon) and ${budgetResult.rows.length} budget records (fp_budget_unified)`);
    logger.info(`   - ${actualCustomerNames.size} unique in actualcommon (before any merge)`);
    logger.info(`   - ${budgetCustomerNames.size} unique in budget`);
    logger.info(`   - ${budgetOnlyCustomerNames.size} budget-only (no actual sales)`);
    logger.info(`   - ${prospectsCount} prospects (from fp_prospects table)`);
    logger.info(`   - Expected in customer_unified: ${actualCustomerNames.size + budgetOnlyCustomerNames.size}`);

    res.json({
      success: true,
      data: {
        customers: customers,
        totalCustomers: customers.length,
        actualRecords: actualResult.rows.length,
        budgetRecords: budgetResult.rows.length,
        // NEW: Unique customer counts
        uniqueInActual: actualCustomerNames.size,
        uniqueInBudget: budgetCustomerNames.size,
        budgetOnlyCustomers: prospectsCount,  // Use REAL prospects count from fp_prospects
        expectedInUnified: actualCustomerNames.size + budgetOnlyCustomerNames.size,
        // Legacy field names for backward compatibility
        excelRecords: actualResult.rows.length
      }
    });

  } catch (error) {
    logger.error('Scan with source error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/division-merge-rules/suggestions
 * Get all AI suggestions for a division (DEDUPLICATED)
 * Also checks for overlaps with existing active rules
 */
router.get('/suggestions', async (req, res) => {
  try {
    const { division, status } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    // Get division-specific pool and tables
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    // First, get all active merge rules to check for overlaps
    const activeRulesResult = await divisionPool.query(`
      SELECT id, merged_customer_name, original_customers
      FROM ${tables.divisionMergeRules}
      WHERE division = $1 AND is_active = true AND status = 'ACTIVE'
    `, [division]);

    // Build a map of normalized customer names to their rule info
    const customerToRuleMap = new Map();
    activeRulesResult.rows.forEach(rule => {
      const originals = Array.isArray(rule.original_customers)
        ? rule.original_customers
        : JSON.parse(rule.original_customers || '[]');
      
      originals.forEach(orig => {
        if (orig) {
          const normalized = orig.toLowerCase().trim();
          customerToRuleMap.set(normalized, {
            ruleId: rule.id,
            ruleName: rule.merged_customer_name,
            originalCustomers: originals
          });
        }
      });
    });

    let query = `
      SELECT
        id,
        suggested_merge_name,
        customer_group,
        confidence_score,
        match_details,
        admin_action,
        suggested_at,
        reviewed_at,
        reviewed_by
      FROM ${tables.mergeRuleSuggestions}
      WHERE division = $1
    `;

    const params = [division];

    if (status) {
      // CRITICAL FIX: 'PENDING' status means admin_action IS NULL (new suggestions)
      // because saveSuggestions() doesn't set admin_action, leaving it NULL
      // Also include 'EDITED' so users can see suggestions they've modified but not yet approved
      if (status === 'PENDING') {
        query += ` AND (admin_action IS NULL OR admin_action = 'PENDING' OR admin_action = 'EDITED')`;
      } else {
        query += ` AND admin_action = $2`;
        params.push(status);
      }
    }

    query += ` ORDER BY confidence_score DESC, suggested_at DESC`;

    const result = await divisionPool.query(query, params);

    // DEDUPLICATE: Remove suggestions with same customer_group (keep first/highest confidence)
    const seenGroups = new Map();
    const deduplicatedRows = [];
    
    for (const row of result.rows) {
      // Normalize customer group for comparison
      const customerGroup = Array.isArray(row.customer_group) 
        ? row.customer_group 
        : JSON.parse(row.customer_group || '[]');
      
      const groupKey = customerGroup
        .map(c => c.toLowerCase().trim())
        .sort()
        .join('||');
      
      if (!seenGroups.has(groupKey)) {
        seenGroups.set(groupKey, row.id);
        
        // Check for overlaps with active rules
        const overlappingRules = [];
        const overlappingCustomers = [];
        
        customerGroup.forEach(customer => {
          const normalized = customer.toLowerCase().trim();
          if (customerToRuleMap.has(normalized)) {
            const ruleInfo = customerToRuleMap.get(normalized);
            overlappingCustomers.push(customer);
            
            // Avoid duplicating rule info
            if (!overlappingRules.find(r => r.ruleId === ruleInfo.ruleId)) {
              overlappingRules.push({
                ruleId: ruleInfo.ruleId,
                ruleName: ruleInfo.ruleName,
                customerCount: ruleInfo.originalCustomers.length
              });
            }
          }
        });
        
        // Calculate which customers are NEW (not in any rule)
        const newCustomers = customerGroup.filter(customer => {
          const normalized = customer.toLowerCase().trim();
          return !customerToRuleMap.has(normalized);
        });
        
        // Determine overlap type
        const isFullyMerged = overlappingCustomers.length === customerGroup.length; // ALL customers already in rules
        const hasPartialOverlap = overlappingRules.length > 0 && newCustomers.length > 0; // Some new, some existing
        
        // Add overlap info to row
        const enrichedRow = {
          ...row,
          hasOverlap: overlappingRules.length > 0,
          isFullyMerged: isFullyMerged,           // All customers already merged - just reject
          hasPartialOverlap: hasPartialOverlap,   // Some new customers to add
          overlappingRules: overlappingRules,
          overlappingCustomers: overlappingCustomers,
          newCustomers: newCustomers              // Customers that could be added to existing rules
        };
        
        deduplicatedRows.push(enrichedRow);
      }
    }
    
    // Log if duplicates were found
    if (deduplicatedRows.length < result.rows.length) {
      logger.info(`📊 Deduplicated suggestions: ${result.rows.length} → ${deduplicatedRows.length}`);
    }
    
    // Log overlap info
    const overlappingSuggestions = deduplicatedRows.filter(r => r.hasOverlap);
    if (overlappingSuggestions.length > 0) {
      logger.info(`⚠️ Found ${overlappingSuggestions.length} suggestions with overlapping active rules`);
    }

    // Fetch country and sales rep info for each customer in suggestions
    // Check fp_actualcommon AND fp_budget_unified to cover all data sources
    const allCustomers = new Set();
    deduplicatedRows.forEach(row => {
      const customers = Array.isArray(row.customer_group) ? row.customer_group : [];
      customers.forEach(c => allCustomers.add(c));
    });
    
    // Query country and sales rep for each customer name
    const customerInfoMap = new Map();
    const divisionCode = extractDivisionCode(division);
    
    if (allCustomers.size > 0) {
      try {
        // FIXED: Query from fp_actualcommon (current source of truth) instead of old view
        const actualResult = await divisionPool.query(`
          SELECT DISTINCT customer_name as customername, country as countryname, sales_rep_name as salesrepname
          FROM ${tables.actualcommon}
          WHERE customer_name = ANY($1)
        `, [Array.from(allCustomers)]);
        
        actualResult.rows.forEach(row => {
          if (row.customername) {
            customerInfoMap.set(row.customername, {
              country: row.countryname || null,
              salesRep: row.salesrepname || null,
              source: 'Actual Data'
            });
          }
        });
        
        // Then, check fp_budget_unified for customers not found in actualcommon
        // This catches budget-only customers (prospects)
        const missingCustomers = Array.from(allCustomers).filter(c => !customerInfoMap.has(c));
        if (missingCustomers.length > 0) {
          try {
            const budgetResult = await divisionPool.query(`
              SELECT DISTINCT customer_name as customername, country as countryname, sales_rep_name as salesrepname
              FROM ${tables.budgetUnified}
              WHERE customer_name = ANY($1)
            `, [missingCustomers]);
            
            budgetResult.rows.forEach(row => {
              if (row.customername && !customerInfoMap.has(row.customername)) {
                customerInfoMap.set(row.customername, {
                  country: row.countryname || null,
                  salesRep: row.salesrepname || null,
                  source: 'Budget Data'
                });
              }
            });
            
            logger.info(`📊 Found ${budgetResult.rows.length} customer(s) in budget table`);
          } catch (budgetErr) {
            // Budget table might not exist
            logger.warn(`Budget table query failed: ${budgetErr.message}`);
          }
        }
      } catch (infoErr) {
        logger.warn('Failed to fetch customer info:', infoErr.message);
      }
    }
    
    // Enrich rows with country/salesRep info AND map to frontend expected field names
    const enrichedWithDetails = deduplicatedRows.map(row => {
      const customers = Array.isArray(row.customer_group) ? row.customer_group : [];
      const customerDetails = customers.map(c => {
        const info = customerInfoMap.get(c) || {};
        return {
          name: c,
          country: info.country || null,
          salesRep: info.salesRep || null,
          source: info.source || null
        };
      });
      
      // Check if there are mixed countries (warning flag)
      const uniqueCountries = [...new Set(customerDetails.map(c => c.country).filter(Boolean))];
      const hasMixedCountries = uniqueCountries.length > 1;
      
      // Check if there are mixed sales reps
      const uniqueSalesReps = [...new Set(customerDetails.map(c => c.salesRep).filter(Boolean))];
      const hasMixedSalesReps = uniqueSalesReps.length > 1;
      
      return {
        ...row,
        // Map database column names to frontend expected names
        original_customer: customers[0] || '',  // First customer in group
        suggested_target: row.suggested_merge_name,  // The unified name
        confidence: parseFloat(row.confidence_score) || 0,
        customerDetails,       // Full details: name, country, salesRep, source
        customerCountries: customerDetails, // Keep for backward compat
        uniqueCountries,
        hasMixedCountries,
        uniqueSalesReps,
        hasMixedSalesReps
      };
    });

    res.json({
      success: true,
      data: enrichedWithDetails
    });

  } catch (error) {
    logger.error('Error fetching suggestions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/division-merge-rules/suggestions/cleanup-duplicates
 * Remove duplicate suggestions from database (keeps oldest/first)
 */
router.delete('/suggestions/cleanup-duplicates', async (req, res) => {
  try {
    const { division } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    // Find and delete duplicates (keep the one with lowest ID = oldest)
    // Include EDITED status since edited suggestions are still pending approval
    const result = await divisionPool.query(`
      DELETE FROM ${tables.mergeRuleSuggestions}
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM ${tables.mergeRuleSuggestions}
        WHERE division = $1
        AND (admin_action IS NULL OR admin_action = 'PENDING' OR admin_action = 'EDITED')
        GROUP BY customer_group
      )
      AND division = $1
      AND (admin_action IS NULL OR admin_action = 'PENDING' OR admin_action = 'EDITED')
    `, [division]);

    logger.info(`🧹 Cleaned up ${result.rowCount} duplicate suggestions for ${division}`);

    res.json({
      success: true,
      message: `Removed ${result.rowCount} duplicate suggestions`,
      removedCount: result.rowCount
    });

  } catch (error) {
    logger.error('Error cleaning up duplicates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/division-merge-rules/suggestions/:id/approve
 * Approve an AI suggestion and create active rule
 * Can optionally modify the merge name, add additional customers, or remove customers
 */
router.post('/suggestions/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approvedBy, division, modifiedName, additionalCustomers, removedCustomers } = req.body;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const divisionCode = division.split('-')[0].toLowerCase();
    const client = await divisionPool.connect();

    try {
      await client.query('BEGIN');

      // 1. Get suggestion
      const suggestionResult = await client.query(
        `SELECT * FROM ${tables.mergeRuleSuggestions} WHERE id = $1`,
        [id]
      );

      if (suggestionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Suggestion not found'
        });
      }

      const suggestion = suggestionResult.rows[0];

      // CRITICAL: Check if suggestion was already approved/modified
      if (suggestion.admin_action === 'APPROVED' || suggestion.admin_action === 'MODIFIED') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: `This suggestion has already been ${suggestion.admin_action.toLowerCase()}. Please refresh the page.`
        });
      }

      // Use modified name if provided, otherwise use AI suggestion
      const mergedName = modifiedName && modifiedName.trim() ? modifiedName.trim() : suggestion.suggested_merge_name;
      const wasModified = modifiedName && modifiedName.trim() && modifiedName.trim() !== suggestion.suggested_merge_name;

      // 2. Parse and deduplicate customer group
      const rawCustomers = (() => {
        const cg = suggestion.customer_group;
        if (Array.isArray(cg)) return cg;
        try {
          if (typeof cg === 'string') return JSON.parse(cg);
        } catch (_) {}
        return [cg].filter(Boolean);
      })();
      
      // Handle removed customers: filter them out from raw customers
      let allCustomers = [...rawCustomers];
      if (removedCustomers && Array.isArray(removedCustomers) && removedCustomers.length > 0) {
        const removedSet = new Set(removedCustomers.map(c => c.toLowerCase().trim()));
        allCustomers = allCustomers.filter(c => !removedSet.has(c.toLowerCase().trim()));
        logger.info(`   User removed ${removedCustomers.length} customers from suggestion`);
      }
      
      // Add any additional customers provided by user
      if (additionalCustomers && Array.isArray(additionalCustomers)) {
        allCustomers = [...allCustomers, ...additionalCustomers];
      }
      
      // Validate: must have at least 2 customers for a merge rule
      if (allCustomers.length < 2) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'A merge rule requires at least 2 customers. Cannot approve with fewer customers.'
        });
      }
      
      // CRITICAL: Deduplicate customers to prevent internal duplicates
      const originalCustomers = deduplicateCustomers(allCustomers);
      const originalCustomersJson = JSON.stringify(originalCustomers);
      
      // Log if user added/removed customers or modified name
      if (wasModified || (additionalCustomers && additionalCustomers.length > 0) || (removedCustomers && removedCustomers.length > 0)) {
        logger.info(`   User modified suggestion: name=${wasModified ? 'YES' : 'NO'}, addedCustomers=${additionalCustomers?.length || 0}, removedCustomers=${removedCustomers?.length || 0}`);
      }

      // 2b. Check if any customer already exists in another active merge rule
      // Also check if merged_customer_name already exists (prevents duplicate rules)
      const conflict = await checkCustomerConflicts(divisionPool, tables, division, originalCustomers, null, mergedName);
      if (conflict.hasConflict) {
        await client.query('ROLLBACK');
        
        if (conflict.isDuplicateRule) {
          return res.status(409).json({
            success: false,
            error: `A merge rule for "${mergedName}" already exists. This suggestion is a duplicate.`
          });
        };
        return res.status(409).json({
          success: false,
          error: `Customer "${conflict.conflictingCustomer}" is already part of merge rule "${conflict.conflictingRule}". Cannot approve this suggestion.`
        });
      }

      // 3. Check if Customer Master table exists (optional feature)
      let masterCustomerCode = null;
      const customerMasterTable = `${divisionCode}_customer_master`;
      const customerAliasesTable = `${divisionCode}_customer_aliases`;
      
      // Check if customer master table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = $1
        ) as exists
      `, [customerMasterTable]);
      const customerMasterExists = tableCheck.rows[0].exists;

      // 2c. Get country from fp_actualcommon for the original customers
      // Use the most common country among the customers being merged
      let customerCountry = null;
      try {
        // Use fp_actualcommon with customer_name_unified for merged customer names
        const countryResult = await client.query(`
          SELECT country, COUNT(*) as cnt
          FROM fp_actualcommon
          WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
          AND customer_name_unified = ANY($2)
          AND country IS NOT NULL AND country != ''
          GROUP BY country
          ORDER BY cnt DESC
          LIMIT 1
        `, [division, originalCustomers]);
        
        if (countryResult.rows.length > 0) {
          customerCountry = countryResult.rows[0].country;
          logger.info(`   Determined country from sales data: ${customerCountry}`);
        }
      } catch (countryErr) {
        logger.warn('Failed to determine country:', countryErr.message);
      }

      // Only use customer master if table exists
      if (customerMasterExists) {
        // Check if customer already exists in master
        try {
          const existingMaster = await client.query(`
            SELECT customer_code, country, customer_name FROM ${customerMasterTable}
            WHERE customer_name_normalized = LOWER($1)
               OR customer_name_normalized = ${divisionCode}_normalize_customer_name($1)
               OR LOWER(customer_name) = LOWER($1)
               OR LOWER(customer_name) = ANY($2::text[])
            LIMIT 1
          `, [mergedName, originalCustomers.map(c => c.toLowerCase())]);

          if (existingMaster.rows.length > 0) {
            masterCustomerCode = existingMaster.rows[0].customer_code;
            logger.info(`   Using existing customer master: ${masterCustomerCode} (${existingMaster.rows[0].customer_name})`);
          
            // Update country if it was missing or wrong
            if (customerCountry && (!existingMaster.rows[0].country || existingMaster.rows[0].country === 'United Arab Emirates')) {
              await client.query(`
                UPDATE ${customerMasterTable} SET country = $1, updated_at = NOW() WHERE customer_code = $2
              `, [customerCountry, masterCustomerCode]);
              logger.info(`   Updated country to: ${customerCountry}`);
            }
          } else {
            // Create new customer master entry WITH country
            const newMaster = await client.query(`
              INSERT INTO ${customerMasterTable} (customer_name, division, country, notes, created_by)
              VALUES ($1, $2, $3, $4, $5)
              RETURNING customer_code
            `, [mergedName, divisionCode.toUpperCase(), customerCountry, `Created from AI suggestion #${id}`, approvedBy || 'Admin']);
            masterCustomerCode = newMaster.rows[0].customer_code;
            logger.info(`   Created customer master: ${masterCustomerCode} with country: ${customerCountry}`);
          }
        } catch (masterError) {
          // If customer master operations fail, generate a simple code and continue
          logger.warn(`Customer master operation failed, using fallback: ${masterError.message}`);
          masterCustomerCode = `${divisionCode.toUpperCase()}-${Date.now()}`;
        }

        // 4. Add aliases for all original customers
        for (const alias of originalCustomers) {
          if (alias && alias.trim()) {
            try {
              await client.query(`
                INSERT INTO ${customerAliasesTable} 
                (customer_code, alias_name, source_system, is_primary, created_by)
                VALUES ($1, $2, 'AI_SUGGESTION', $3, $4)
                ON CONFLICT (customer_code, alias_name_normalized) DO NOTHING
              `, [masterCustomerCode, alias.trim(), alias.trim() === mergedName, approvedBy || 'Admin']);
            } catch (e) {
              // Ignore duplicate alias errors
            }
          }
        }
      } else {
        // Customer master table doesn't exist - generate a simple code
        masterCustomerCode = `${divisionCode.toUpperCase()}-${Date.now()}`;
        logger.info(`   Customer master table not found, using generated code: ${masterCustomerCode}`);
      }

      // 5. Generate merge code (only if function exists)
      // Use SAVEPOINT to allow recovery if function doesn't exist
      let mergeCode = null;
      try {
        await client.query('SAVEPOINT merge_code_check');
        const mergeCodeResult = await client.query(`
          SELECT ${divisionCode}_generate_merge_code($1) as merge_code
        `, [divisionCode.toUpperCase()]);
        mergeCode = mergeCodeResult.rows[0].merge_code;
        await client.query('RELEASE SAVEPOINT merge_code_check');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT merge_code_check');
        mergeCode = `M-${Date.now()}`;
        logger.warn(`Merge code function not found, using: ${mergeCode}`);
      }

      // 6. Create active merge rule with Customer Master link
      const ruleResult = await client.query(`
        INSERT INTO ${tables.divisionMergeRules} (
          division,
          merged_customer_name,
          original_customers,
          rule_source,
          confidence_score,
          status,
          created_by,
          approved_by,
          approved_at,
          validation_status,
          merge_code,
          master_customer_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10, $11)
        RETURNING id
      `, [
        suggestion.division,
        mergedName,
        originalCustomersJson,
        'AI_SUGGESTED',
        suggestion.confidence_score,
        'ACTIVE',
        'AI_ENGINE',
        approvedBy || 'Admin',
        'VALID',
        mergeCode,
        masterCustomerCode
      ]);

      const createdRuleId = ruleResult.rows[0].id;

      // Determine if this was modified by user
      const adminAction = wasModified || (additionalCustomers && additionalCustomers.length > 0) ? 'MODIFIED' : 'APPROVED';

      // 7. Update suggestion status
      await client.query(`
        UPDATE ${tables.mergeRuleSuggestions}
        SET
          admin_action = $1,
          reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by = $2,
          was_correct = true,
          created_rule_id = $3
        WHERE id = $4
      `, [adminAction, approvedBy || 'Admin', createdRuleId, id]);

      // 8. Mark all customers in customer_master as merged (only if table exists)
      if (customerMasterExists) {
        for (const customerName of originalCustomers) {
          try {
            await client.query(`
              UPDATE ${customerMasterTable}
              SET is_merged = true, merged_into_code = $1, updated_at = NOW()
              WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($2))
            `, [masterCustomerCode, customerName]);
          } catch (updateErr) {
            logger.warn(`Failed to mark customer as merged: ${customerName}`, updateErr.message);
          }
        }
        logger.info(`   Marked ${originalCustomers.length} customers as merged -> ${masterCustomerCode}`);
      }

      await client.query('COMMIT');

      logger.info(`✅ Suggestion #${id} approved, created rule #${createdRuleId} with master ${masterCustomerCode}`);

      // Release the connection BEFORE doing post-commit operations
      client.release();

      // 8. LEARNING: Record this decision for AI training (uses its own connection)
      try {
        const AILearningService = getAILearningService();
        await AILearningService.recordSuggestionDecision(division, suggestion, 'APPROVED', {
          source: 'SUGGESTION_APPROVE',
          decidedBy: approvedBy || 'Admin',
          suggestionId: parseInt(id),
          ruleId: createdRuleId
        });
        logger.info(`📊 Learning data recorded for suggestion #${id}`);
      } catch (learnErr) {
        // Don't fail the request if learning fails
        logger.warn('Failed to record learning data:', learnErr.message);
      }

      // 9. SYNC: Update unified customer table with new merge (get new connection)
      try {
        const syncClient = await divisionPool.connect();
        try {
          await syncClient.query('SELECT * FROM sync_customer_merges_to_unified()');
          logger.info('🔄 Unified customer table synced with new merge');
        } finally {
          syncClient.release();
        }
      } catch (syncErr) {
        // Don't fail the request if sync fails - can be run manually later
        logger.warn('Failed to sync unified table (run POST /api/unified/sync-merges):', syncErr.message);
      }

      // 10. SYNC: Update budget unified table with new merge (get new connection)
      try {
        const budgetClient = await divisionPool.connect();
        try {
          await budgetClient.query('SELECT refresh_budget_unified_stats()');
          logger.info('🔄 Budget unified table synced with new merge');
        } finally {
          budgetClient.release();
        }
      } catch (syncErr) {
        logger.warn('Failed to sync budget unified table (non-critical):', syncErr.message);
      }

      res.json({
        success: true,
        message: 'Suggestion approved, rule created, and customer master updated',
        ruleId: createdRuleId,
        masterCustomerCode,
        mergeCode
      });

    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      logger.error('Error approving suggestion:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } catch (outerError) {
    logger.error('Error in approve suggestion endpoint:', outerError);
    res.status(500).json({
      success: false,
      error: outerError.message
    });
  }
});

/**
 * POST /api/division-merge-rules/suggestions/:id/reject
 * Reject an AI suggestion
 */
router.post('/suggestions/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectedBy, reason, division } = req.body;

    logger.info(`🔍 Reject request: id=${id}, division=${division}`);

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    const client = await divisionPool.connect();

    try {
      await client.query('BEGIN');

      // Get the suggestion to extract customer pairs for feedback loop
      const suggestionResult = await client.query(
        `SELECT * FROM ${tables.mergeRuleSuggestions} WHERE id = $1`,
        [id]
      );

      if (suggestionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Suggestion not found'
        });
      }

      const suggestion = suggestionResult.rows[0];

      // CRITICAL: Check if suggestion was already actioned
      if (suggestion.admin_action === 'APPROVED' || suggestion.admin_action === 'MODIFIED' || suggestion.admin_action === 'REJECTED') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: `This suggestion has already been ${suggestion.admin_action.toLowerCase()}. Please refresh the page.`
        });
      }

      const customers = suggestion.customer_group;

      // Update suggestion status
      await client.query(`
        UPDATE ${tables.mergeRuleSuggestions}
        SET
          admin_action = 'REJECTED',
          reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by = $1,
          feedback_notes = $2,
          was_correct = false
        WHERE id = $3
      `, [rejectedBy || 'Admin', reason || '', id]);

      // Save rejected customer pairs to feedback loop table
      // This prevents the AI from suggesting these pairs again
      // Use SAVEPOINT so that if this fails, it doesn't abort the main transaction
      if (Array.isArray(customers) && customers.length >= 2) {
        try {
          await client.query('SAVEPOINT rejection_pairs');
          for (let i = 0; i < customers.length; i++) {
            for (let j = i + 1; j < customers.length; j++) {
              await client.query(`
                INSERT INTO ${tables.mergeRuleRejections} (
                  division, customer1, customer2, confidence_score, rejection_reason, rejected_by
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
              `, [
                division,
                customers[i].toLowerCase(),
                customers[j].toLowerCase(),
                suggestion.confidence_score || 0,
                reason || '',
                rejectedBy || 'Admin'
              ]);
            }
          }
          await client.query('RELEASE SAVEPOINT rejection_pairs');
        } catch (insertError) {
          // Table might not exist or have wrong schema, rollback to savepoint and continue
          logger.warn('Could not save rejection pairs (rolling back savepoint):', insertError.message);
          await client.query('ROLLBACK TO SAVEPOINT rejection_pairs');
        }
      }

      await client.query('COMMIT');

      logger.info(`❌ Suggestion #${id} rejected (${customers.length} customers)`);

      // LEARNING: Record this rejection for AI training
      try {
        const AILearningService = getAILearningService();
        await AILearningService.recordSuggestionDecision(division, suggestion, 'REJECTED', {
          source: 'SUGGESTION_REJECT',
          decidedBy: rejectedBy || 'Admin',
          suggestionId: parseInt(id)
        });
        logger.info(`📊 Learning data recorded for rejected suggestion #${id}`);
      } catch (learnErr) {
        // Don't fail the request if learning fails
        logger.warn('Failed to record learning data:', learnErr.message);
      }

      res.json({
        success: true,
        message: 'Suggestion rejected'
      });
    } catch (innerError) {
      await client.query('ROLLBACK');
      throw innerError;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Error rejecting suggestion:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/division-merge-rules/suggestions/:id
 * Update a suggestion (without approving it)
 * This allows editing the merged name and customer list before final approval
 */
router.put('/suggestions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { mergedName, customers, division, editedBy } = req.body;

    logger.info(`📝 Update suggestion request: id=${id}, division=${division}`);

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    if (!mergedName?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Merged name is required'
      });
    }

    if (!Array.isArray(customers) || customers.filter(c => c?.trim()).length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 customers are required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const client = await divisionPool.connect();

    try {
      await client.query('BEGIN');

      // Get original suggestion
      const suggestionResult = await client.query(
        `SELECT * FROM ${tables.mergeRuleSuggestions} WHERE id = $1`,
        [id]
      );

      if (suggestionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Suggestion not found'
        });
      }

      const suggestion = suggestionResult.rows[0];

      // Check if already actioned
      if (suggestion.admin_action === 'APPROVED' || suggestion.admin_action === 'MODIFIED') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: `This suggestion has already been ${suggestion.admin_action.toLowerCase()}. Please refresh the page.`
        });
      }

      // Clean customers array
      const cleanCustomers = customers.filter(c => c?.trim()).map(c => c.trim());

      // Update the suggestion
      await client.query(`
        UPDATE ${tables.mergeRuleSuggestions}
        SET
          suggested_merge_name = $1,
          customer_group = $2,
          admin_action = 'EDITED',
          feedback_notes = COALESCE(feedback_notes, '') || $3
        WHERE id = $4
      `, [
        mergedName.trim(),
        JSON.stringify(cleanCustomers),
        `\n[Edited by ${editedBy || 'Admin'} at ${new Date().toISOString()}]`,
        id
      ]);

      await client.query('COMMIT');

      logger.info(`✏️ Suggestion #${id} updated (not approved yet)`);

      res.json({
        success: true,
        message: 'Suggestion updated successfully',
        suggestion: {
          id,
          suggested_merge_name: mergedName.trim(),
          customer_group: cleanCustomers
        }
      });
    } catch (innerError) {
      await client.query('ROLLBACK');
      throw innerError;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Error updating suggestion:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/division-merge-rules/suggestions/:id/edit-approve
 * Edit and approve a suggestion
 */
router.post('/suggestions/:id/edit-approve', async (req, res) => {
  const { id } = req.params;
  const { mergedName, originalCustomers, approvedBy, division } = req.body;

  if (!division) {
    return res.status(400).json({
      success: false,
      error: 'Division is required'
    });
  }

  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  const divisionCode = division.split('-')[0].toLowerCase();
  const client = await divisionPool.connect();

  try {
    await client.query('BEGIN');

    // Get original suggestion
    const suggestionResult = await client.query(
      `SELECT * FROM ${tables.mergeRuleSuggestions} WHERE id = $1`,
      [id]
    );

    if (suggestionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Suggestion not found'
      });
    }

    const suggestion = suggestionResult.rows[0];

    // CRITICAL: Check if suggestion was already approved/modified
    if (suggestion.admin_action === 'APPROVED' || suggestion.admin_action === 'MODIFIED') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `This suggestion has already been ${suggestion.admin_action.toLowerCase()}. Please refresh the page.`
      });
    }

    // Check if a rule with this name already exists
    const existingRule = await client.query(
      `SELECT id FROM ${tables.divisionMergeRules} WHERE division = $1 AND merged_customer_name = $2 AND is_active = true`,
      [suggestion.division, mergedName]
    );

    if (existingRule.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `A merge rule with the name "${mergedName}" already exists. Please choose a different name.`
      });
    }

    // CRITICAL: Check if any of the edited customers are already in another rule
    const conflict = await checkCustomerConflicts(divisionPool, tables, division, originalCustomers);
    if (conflict.hasConflict) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `Customer "${conflict.conflictingCustomer}" is already part of merge rule "${conflict.conflictingRule}". Cannot approve this suggestion.`
      });
    }

    // Check if Customer Master table exists (optional feature)
    let masterCustomerCode = null;
    const customerMasterTable = `${divisionCode}_customer_master`;
    const customerAliasesTable = `${divisionCode}_customer_aliases`;

    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = $1
      ) as exists
    `, [customerMasterTable]);
    const customerMasterExists = tableCheck.rows[0].exists;

    // Get country from fp_actualcommon for the original customers (most common country)
    // Use fp_actualcommon with customer_name_unified for merged customer names
    const countryResult = await client.query(`
      SELECT country, COUNT(*) as cnt
      FROM fp_actualcommon
      WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
      AND customer_name_unified = ANY($2) AND country IS NOT NULL AND country != ''
      GROUP BY country
      ORDER BY cnt DESC
      LIMIT 1
    `, [division, originalCustomers]);
    const customerCountry = countryResult.rows.length > 0 ? countryResult.rows[0].country : null;
    logger.info(`   Determined country from sales data: ${customerCountry}`);

    // Only use customer master if table exists
    if (customerMasterExists) {
      // Check if customer already exists in master
      const existingMaster = await client.query(`
        SELECT customer_code, country, customer_name FROM ${customerMasterTable}
        WHERE customer_name_normalized = LOWER($1)
           OR customer_name_normalized = ${divisionCode}_normalize_customer_name($1)
           OR LOWER(customer_name) = LOWER($1)
           OR LOWER(customer_name) = ANY($2::text[])
        LIMIT 1
      `, [mergedName, originalCustomers.map(c => c.toLowerCase())]);

      if (existingMaster.rows.length > 0) {
        masterCustomerCode = existingMaster.rows[0].customer_code;
        logger.info(`   Using existing customer master: ${masterCustomerCode} (${existingMaster.rows[0].customer_name})`);
        
        // Update country if it was missing or wrong
        if (customerCountry && (!existingMaster.rows[0].country || existingMaster.rows[0].country === 'UAE')) {
          await client.query(`
            UPDATE ${customerMasterTable}
            SET country = $1
            WHERE customer_code = $2
          `, [customerCountry, masterCustomerCode]);
          logger.info(`   Updated country to: ${customerCountry}`);
        }
      } else {
        // Create new customer master entry WITH country
        const newMaster = await client.query(`
          INSERT INTO ${customerMasterTable} (customer_name, division, country, notes, created_by)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING customer_code
        `, [mergedName, divisionCode.toUpperCase(), customerCountry, `Created from edited AI suggestion #${id}`, approvedBy || 'Admin']);
        masterCustomerCode = newMaster.rows[0].customer_code;
        logger.info(`   Created customer master with country ${customerCountry}: ${masterCustomerCode}`);
      }

      // Add aliases for all original customers
      for (const alias of originalCustomers) {
        if (alias && alias.trim()) {
          try {
            await client.query(`
              INSERT INTO ${customerAliasesTable} 
              (customer_code, alias_name, source_system, is_primary, created_by)
              VALUES ($1, $2, 'AI_SUGGESTION_EDITED', $3, $4)
              ON CONFLICT (customer_code, alias_name_normalized) DO NOTHING
            `, [masterCustomerCode, alias.trim(), alias.trim() === mergedName, approvedBy || 'Admin']);
          } catch (e) {
            // Ignore duplicate alias errors
          }
        }
      }
    } else {
      // Customer master table doesn't exist - generate a simple code
      masterCustomerCode = `${divisionCode.toUpperCase()}-${Date.now()}`;
      logger.info(`   Customer master table not found, using generated code: ${masterCustomerCode}`);
    }

    // Generate merge code (only if function exists)
    let mergeCode = null;
    try {
      const mergeCodeResult = await client.query(`
        SELECT ${divisionCode}_generate_merge_code($1) as merge_code
      `, [divisionCode.toUpperCase()]);
      mergeCode = mergeCodeResult.rows[0].merge_code;
    } catch (e) {
      mergeCode = `M-${Date.now()}`;
      logger.warn(`Merge code function not found, using: ${mergeCode}`);
    }

    // Create rule with edited values and Customer Master link
    const ruleResult = await client.query(`
      INSERT INTO ${tables.divisionMergeRules} (
        division,
        merged_customer_name,
        original_customers,
        rule_source,
        confidence_score,
        status,
        created_by,
        approved_by,
        approved_at,
        validation_status,
        merge_code,
        master_customer_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10, $11)
      RETURNING id
    `, [
      suggestion.division,
      mergedName,
      JSON.stringify(originalCustomers),
      'ADMIN_EDITED',
      suggestion.confidence_score,
      'ACTIVE',
      'AI_ENGINE',
      approvedBy || 'Admin',
      'VALID',
      mergeCode,
      masterCustomerCode
    ]);

    const createdRuleId = ruleResult.rows[0].id;

    // Update suggestion as modified
    await client.query(`
      UPDATE ${tables.mergeRuleSuggestions}
      SET
        admin_action = 'MODIFIED',
        reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by = $1,
        was_correct = false,
        created_rule_id = $2,
        feedback_notes = 'Admin edited before approval'
      WHERE id = $3
    `, [approvedBy || 'Admin', createdRuleId, id]);

    await client.query('COMMIT');

    logger.info(`✏️ Suggestion #${id} edited and approved, created rule #${createdRuleId} with master ${masterCustomerCode}`);

    // SYNC: Update unified customer table with new merge
    try {
      await client.query('SELECT * FROM sync_customer_merges_to_unified()');
      logger.info('🔄 Unified customer table synced with edited merge');
    } catch (syncErr) {
      logger.warn('Failed to sync unified table:', syncErr.message);
    }

    res.json({
      success: true,
      message: 'Suggestion edited and approved, customer master updated',
      ruleId: createdRuleId,
      masterCustomerCode,
      mergeCode
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error editing suggestion:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/division-merge-rules/suggestions/manual
 * Create a manual suggestion from user-selected customers
 */
router.post('/suggestions/manual', async (req, res) => {
  try {
    const { division, mergedName, customerGroup, createdBy } = req.body;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    if (!Array.isArray(customerGroup) || customerGroup.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least two customers are required to create a suggestion'
      });
    }

    // Clean and deduplicate customer names (case-insensitive)
    const cleanedCustomersMap = new Map();
    customerGroup.forEach(customer => {
      if (!customer) return;
      const trimmed = customer.toString().trim();
      if (!trimmed) return;
      const normalized = trimmed.toLowerCase();
      if (!cleanedCustomersMap.has(normalized)) {
        cleanedCustomersMap.set(normalized, trimmed);
      }
    });

    const cleanedCustomers = Array.from(cleanedCustomersMap.values());

    if (cleanedCustomers.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'After removing duplicates, at least two unique customers are required'
      });
    }

    const suggestedMergeName = (mergedName || cleanedCustomers[0] || '').toString().trim();

    if (!suggestedMergeName) {
      return res.status(400).json({
        success: false,
        error: 'A merged customer name is required'
      });
    }

    // Get division-specific pool and tables
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    // Ensure no active rule already exists with this merged name
    const existingRule = await divisionPool.query(
      `
        SELECT id
        FROM ${tables.divisionMergeRules}
        WHERE division = $1
          AND merged_customer_name = $2
          AND is_active = true
      `,
      [division, suggestedMergeName]
    );

    if (existingRule.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: `A merge rule named "${suggestedMergeName}" already exists`
      });
    }

    // Insert manual suggestion
    const insertResult = await divisionPool.query(
      `
        INSERT INTO ${tables.mergeRuleSuggestions} (
          division,
          suggested_merge_name,
          customer_group,
          confidence_score,
          matching_algorithm,
          match_details,
          admin_action,
          feedback_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)
        RETURNING id
      `,
      [
        division,
        suggestedMergeName,
        JSON.stringify(cleanedCustomers),
        null,
        'MANUAL',
        JSON.stringify({
          source: 'MANUAL',
          createdBy: createdBy || 'Admin',
          createdAt: new Date().toISOString()
        }),
        createdBy ? `Manual suggestion provided by ${createdBy}` : 'Manual suggestion created via UI'
      ]
    );

    res.json({
      success: true,
      message: 'Manual suggestion created successfully',
      suggestionId: insertResult.rows[0]?.id
    });
  } catch (error) {
    logger.error('Error creating manual suggestion:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create manual suggestion'
    });
  }
});

// ========================================================================
// ACTIVE RULES ENDPOINTS
// ========================================================================

/**
 * GET /api/division-merge-rules/rules
 * Get all active merge rules for a division
 */
router.get('/rules', async (req, res) => {
  try {
    const { division } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
  const divisionCode = extractDivisionCode(division);

    const result = await divisionPool.query(`
      SELECT
        id,
        merged_customer_name,
        original_customers,
        rule_source,
        status,
        validation_status
      FROM ${tables.divisionMergeRules}
      WHERE division = $1 AND is_active = true
      ORDER BY merged_customer_name
    `, [division]);

    // Build a single lookup for customer -> { salesReps, countries }
    // using the Customer Management source-of-truth tables.
    const customerInfo = new Map();

    const actualInfoQuery = `
      SELECT DISTINCT customer_name, sales_rep_name, country
      FROM ${tables.actualcommon}
      WHERE customer_name IS NOT NULL
        AND customer_name != ''
        AND TRIM(customer_name) != ''
        AND UPPER(admin_division_code) = UPPER($1)
    `;

    const budgetInfoQuery = `
      SELECT DISTINCT customer_name, sales_rep_name, country
      FROM ${tables.budgetUnified}
      WHERE customer_name IS NOT NULL
        AND customer_name != ''
        AND TRIM(customer_name) != ''
        AND UPPER(division_code) = UPPER($1)
    `;

    const [actualInfoResult, budgetInfoResult] = await Promise.all([
      divisionPool.query(actualInfoQuery, [divisionCode]),
      divisionPool.query(budgetInfoQuery, [divisionCode]).catch(() => ({ rows: [] }))
    ]);

    const addRowToInfo = (row) => {
      const name = row.customer_name;
      if (!name) return;
      const key = name.toLowerCase().trim();
      if (!customerInfo.has(key)) {
        customerInfo.set(key, { salesReps: new Set(), countries: new Set() });
      }
      const info = customerInfo.get(key);
      if (row.sales_rep_name) info.salesReps.add(row.sales_rep_name);
      if (row.country) info.countries.add(row.country);
    };

    actualInfoResult.rows.forEach(addRowToInfo);
    budgetInfoResult.rows.forEach(addRowToInfo);

    const enrichedRules = result.rows.map((rule) => {
      const originals = Array.isArray(rule.original_customers)
        ? rule.original_customers
        : JSON.parse(rule.original_customers || '[]');

      const customerDetails = (originals || []).map((customerName) => {
        const key = (customerName || '').toLowerCase().trim();
        const info = customerInfo.get(key);
        return {
          name: customerName,
          sales_reps: info ? Array.from(info.salesReps) : [],
          countries: info ? Array.from(info.countries) : []
        };
      });

      return {
        ...rule,
        original_customers: originals,
        customer_details: customerDetails
      };
    });

    res.json({
      success: true,
      data: enrichedRules
    });

  } catch (error) {
    logger.error('Error fetching rules:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/division-merge-rules/rules/needs-validation
 * Get rules that need validation
 */
router.get('/rules/needs-validation', async (req, res) => {
  try {
    const { division } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    const result = await divisionPool.query(`
      SELECT
        id,
        merged_customer_name,
        original_customers,
        validation_status,
        validation_notes,
        last_validated_at
      FROM ${tables.divisionMergeRules}
      WHERE division = $1
      AND is_active = true
      AND validation_status IN ('NEEDS_UPDATE', 'ORPHANED', 'NOT_VALIDATED')
      ORDER BY
        CASE validation_status
          WHEN 'ORPHANED' THEN 1
          WHEN 'NEEDS_UPDATE' THEN 2
          WHEN 'NOT_VALIDATED' THEN 3
        END
    `, [division]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    logger.error('Error fetching rules needing validation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/division-merge-rules/rules/:id/apply-fix
 * Apply AI suggestion to fix a broken rule
 */
router.post('/rules/:id/apply-fix', async (req, res) => {
  try {
    const { id } = req.params;
    const { suggestionIndex, approvedBy, division } = req.body;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    // Get rule with validation notes
    const ruleResult = await divisionPool.query(
      `SELECT * FROM ${tables.divisionMergeRules} WHERE id = $1`,
      [id]
    );

    if (ruleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found'
      });
    }

    const rule = ruleResult.rows[0];
    const validationNotes = rule.validation_notes;

    if (!validationNotes || !validationNotes.suggestions || !validationNotes.suggestions[suggestionIndex]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid suggestion index'
      });
    }

    const suggestion = validationNotes.suggestions[suggestionIndex];

    // Update rule with new customer name
    const updatedCustomers = rule.original_customers.map(c =>
      c === suggestion.missing ? suggestion.replacement : c
    );

    await divisionPool.query(`
      UPDATE ${tables.divisionMergeRules}
      SET
        original_customers = $1,
        validation_status = 'VALID',
        last_validated_at = CURRENT_TIMESTAMP,
        validation_notes = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [JSON.stringify(updatedCustomers), id]);

    logger.info(`🔧 Rule #${id} fixed: "${suggestion.missing}" → "${suggestion.replacement}"`);

    res.json({
      success: true,
      message: 'Rule updated successfully'
    });

  } catch (error) {
    logger.error('Error applying fix:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/division-merge-rules/rules/manual
 * Create a manual merge rule
 */
router.post('/rules/manual', async (req, res) => {
  try {
    const { division, mergedName, originalCustomers, createdBy } = req.body;

    if (!division || !mergedName || !originalCustomers || originalCustomers.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request. Division, mergedName, and at least 2 customers required.'
      });
    }

    // CRITICAL: Deduplicate customer names to prevent internal duplicates
    const cleanedCustomers = deduplicateCustomers(originalCustomers);
    
    if (cleanedCustomers.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'After removing duplicates, at least 2 unique customers are required.'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    // CRITICAL: Check if any customer already exists in another active merge rule
    const conflict = await checkCustomerConflicts(divisionPool, tables, division, cleanedCustomers);
    if (conflict.hasConflict) {
      return res.status(409).json({
        success: false,
        error: `Customer "${conflict.conflictingCustomer}" is already part of merge rule "${conflict.conflictingRule}". A customer can only be in one merge rule.`
      });
    }

    const result = await divisionPool.query(`
      INSERT INTO ${tables.divisionMergeRules} (
        division,
        merged_customer_name,
        original_customers,
        rule_source,
        status,
        created_by,
        validation_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      division,
      mergedName.trim(),
      JSON.stringify(cleanedCustomers),
      'ADMIN_CREATED',
      'ACTIVE',
      createdBy || 'Admin',
      'VALID'
    ]);

    // Mark all customers in customer_master as merged (only if table exists)
    const divisionCode = extractDivisionCode(division);
    const customerMasterTable = `${divisionCode}_customer_master`;
    
    const tableCheck = await divisionPool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = $1
      ) as exists
    `, [customerMasterTable]);
    
    if (tableCheck.rows[0].exists) {
      for (const customerName of cleanedCustomers) {
        try {
          await divisionPool.query(`
            UPDATE ${customerMasterTable}
            SET is_merged = true, updated_at = NOW()
            WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))
          `, [customerName]);
        } catch (updateErr) {
          logger.warn(`Failed to mark customer as merged: ${customerName}`, updateErr.message);
        }
      }
    }

    logger.info(`✨ Manual rule created: "${mergedName}" (${cleanedCustomers.length} customers)`);

    // Sync to unified table
    try {
      await divisionPool.query('SELECT * FROM sync_customer_merges_to_unified()');
    } catch (syncErr) {
      logger.warn('Failed to sync unified table:', syncErr.message);
    }

    res.json({
      success: true,
      message: 'Manual rule created successfully',
      ruleId: result.rows[0].id
    });

  } catch (error) {
    logger.error('Error creating manual rule:', error);

    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        error: 'A rule with this merged customer name already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/division-merge-rules/rules/manual-multi
 * Create a manual merge rule with multiple customers and unified name
 * Frontend-friendly endpoint that accepts: originalCustomers[], mergedCustomerName
 */
router.post('/rules/manual-multi', async (req, res) => {
  try {
    const { division, originalCustomers, mergedCustomerName, reason, createdBy } = req.body;

    if (!division || !mergedCustomerName || !originalCustomers || originalCustomers.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request. Division, mergedCustomerName, and at least 2 customers required.'
      });
    }

    // CRITICAL: Deduplicate customer names to prevent internal duplicates
    const cleanedCustomers = deduplicateCustomers(originalCustomers);
    
    if (cleanedCustomers.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'After removing duplicates, at least 2 unique customers are required.'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    // CRITICAL: Check for duplicate merged_customer_name
    const existingRule = await divisionPool.query(`
      SELECT id, merged_customer_name FROM ${tables.divisionMergeRules}
      WHERE LOWER(TRIM(merged_customer_name)) = LOWER(TRIM($1)) AND is_active = true AND division = $2
    `, [mergedCustomerName.trim(), division]);

    if (existingRule.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: `A merge rule for "${mergedCustomerName}" already exists.`,
        isDuplicateRule: true
      });
    }

    // CRITICAL: Check if any customer already exists in another active merge rule
    const conflict = await checkCustomerConflicts(divisionPool, tables, division, cleanedCustomers, mergedCustomerName.trim());
    if (conflict.hasConflict) {
      return res.status(409).json({
        success: false,
        error: `Customer "${conflict.conflictingCustomer}" is already part of merge rule "${conflict.conflictingRule}". A customer can only be in one merge rule.`
      });
    }

    const result = await divisionPool.query(`
      INSERT INTO ${tables.divisionMergeRules} (
        division,
        merged_customer_name,
        original_customers,
        rule_source,
        status,
        created_by,
        validation_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      division,
      mergedCustomerName.trim(),
      JSON.stringify(cleanedCustomers),
      'ADMIN_CREATED',
      'ACTIVE',
      createdBy || 'Admin',
      'VALID'
    ]);

    // Mark all customers in customer_master as merged (only if table exists)
    const divisionCode = extractDivisionCode(division);
    const customerMasterTable = `${divisionCode}_customer_master`;
    
    const tableCheck = await divisionPool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = $1
      ) as exists
    `, [customerMasterTable]);
    
    if (tableCheck.rows[0].exists) {
      for (const customerName of cleanedCustomers) {
        try {
          await divisionPool.query(`
            UPDATE ${customerMasterTable}
            SET is_merged = true, updated_at = NOW()
            WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))
          `, [customerName]);
        } catch (updateErr) {
          logger.warn(`Failed to mark customer as merged: ${customerName}`, updateErr.message);
        }
      }
    }

    logger.info(`✨ Manual multi-customer rule created: "${mergedCustomerName}" (${cleanedCustomers.length} customers)`);

    // Sync to unified table
    try {
      await divisionPool.query('SELECT * FROM sync_customer_merges_to_unified()');
    } catch (syncErr) {
      logger.warn('Failed to sync unified table:', syncErr.message);
    }

    res.json({
      success: true,
      message: 'Manual merge rule created successfully',
      ruleId: result.rows[0].id
    });

  } catch (error) {
    logger.error('Error creating manual multi-customer rule:', error);

    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        error: 'A rule with this merged customer name already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/division-merge-rules/rules/:id
 * Update an existing rule
 */
router.put('/rules/:id', async (req, res) => {
  const { id } = req.params;
  const { mergedInto, mergedName, originalCustomers, updatedBy, division } = req.body;
  
  // Support both mergedInto and mergedName
  const targetName = mergedInto || mergedName;

  if (!division) {
    return res.status(400).json({
      success: false,
      error: 'Division is required'
    });
  }

  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  const client = await divisionPool.connect();

  try {
    await client.query('BEGIN');

    // Get the current rule
    const currentRule = await client.query(
      `SELECT division, merged_customer_name, original_customers FROM ${tables.divisionMergeRules} WHERE id = $1`,
      [id]
    );

    if (currentRule.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Rule not found'
      });
    }

    const ruleDivision = currentRule.rows[0].division;
    const oldName = currentRule.rows[0].merged_customer_name;
    const existingCustomers = currentRule.rows[0].original_customers || [];
    
    // Use provided originalCustomers or keep existing
    const customersToUse = originalCustomers && originalCustomers.length > 0 
      ? originalCustomers 
      : existingCustomers;
    
    // Use provided target name or keep existing
    const mergedName = targetName || oldName;

    // CRITICAL: Deduplicate customer names to prevent internal duplicates
    const cleanedCustomers = deduplicateCustomers(customersToUse);
    
    if (cleanedCustomers.length < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'At least 1 customer is required in the merge rule.'
      });
    }

    // If name is changing, check if new name already exists
    if (mergedName !== oldName) {
      const existingRule = await client.query(
        `SELECT id FROM ${tables.divisionMergeRules} WHERE division = $1 AND merged_customer_name = $2 AND is_active = true AND id != $3`,
        [ruleDivision, mergedName, id]
      );

      if (existingRule.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: `A merge rule with the name "${mergedName}" already exists. Please choose a different name.`
        });
      }
    }

    // CRITICAL: Check if any NEW customer already exists in another active merge rule
    // Only check customers that weren't already in this rule
    const newCustomers = cleanedCustomers.filter(c => 
      !existingCustomers.map(e => e.toLowerCase()).includes(c.toLowerCase())
    );
    
    if (newCustomers.length > 0) {
      const conflict = await checkCustomerConflicts(divisionPool, tables, ruleDivision, newCustomers, parseInt(id));
      if (conflict.hasConflict) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: `Customer "${conflict.conflictingCustomer}" is already part of merge rule "${conflict.conflictingRule}". A customer can only be in one merge rule.`
        });
      }
    }

    // Update the rule
    await client.query(`
      UPDATE ${tables.divisionMergeRules}
      SET
        merged_customer_name = $1,
        original_customers = $2,
        rule_source = 'ADMIN_EDITED',
        validation_status = 'VALID',
        last_validated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [mergedName.trim(), JSON.stringify(cleanedCustomers), id]);

    await client.query('COMMIT');

    logger.info(`✏️ Rule #${id} updated by ${updatedBy || 'Admin'}`);

    res.json({
      success: true,
      message: 'Rule updated successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating rule:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/division-merge-rules/rules/all
 * Delete ALL merge rules for a division (hard reset)
 */
router.delete('/rules/all', async (req, res) => {
  try {
    const { division } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const divisionCode = extractDivisionCode(division);
    const customerMasterTable = `${divisionCode}_customer_master`;

    // Check if customer master table exists
    const tableCheck = await divisionPool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = $1
      ) as exists
    `, [customerMasterTable]);
    const customerMasterExists = tableCheck.rows[0].exists;

    // Get count of active rules (scoped to division)
    const countResult = await divisionPool.query(
      `SELECT COUNT(*) as count FROM ${tables.divisionMergeRules} WHERE division = $1 AND is_active = true`,
      [division]
    );
    const activeCount = parseInt(countResult.rows[0].count);

    // Get all original customer names before deleting
    const customersResult = await divisionPool.query(
      `SELECT original_customers FROM ${tables.divisionMergeRules} WHERE division = $1 AND is_active = true`,
      [division]
    );

    // Collect all customer names that need to be un-merged
    const allCustomerNames = new Set();
    for (const row of customersResult.rows) {
      const originals = row.original_customers || [];
      originals.forEach(name => allCustomerNames.add(name));
    }

    // Deactivate all merge rules (scoped to division)
    await divisionPool.query(
      `UPDATE ${tables.divisionMergeRules} SET is_active = false WHERE division = $1 AND is_active = true`,
      [division]
    );

    // Un-merge all customers in customer_master (only if table exists)
    let unmergedCount = 0;
    if (customerMasterExists) {
      for (const customerName of allCustomerNames) {
        try {
          const result = await divisionPool.query(`
            UPDATE ${customerMasterTable}
            SET is_merged = false, merged_into_code = NULL
            WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))
          `, [customerName]);
          unmergedCount += result.rowCount;
        } catch (e) {
          // Ignore errors
        }
      }
    }

    // Sync to unified table
    try {
      await divisionPool.query('SELECT * FROM sync_customer_merges_to_unified()');
    } catch (syncErr) {
      logger.warn('Failed to sync unified table:', syncErr.message);
    }

    logger.info(`🗑️ Deleted ALL ${activeCount} merge rules for division ${division}`);

    res.json({
      success: true,
      message: `All ${activeCount} merge rules deleted`,
      deletedRules: activeCount
    });

  } catch (error) {
    logger.error('Error deleting all rules:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/division-merge-rules/reset/all
 * Global reset for Customer Management for a division:
 * - Deactivate all merge rules
 * - Clear ALL AI suggestions (pending/approved/rejected)
 * - Clear notifications + rejection feedback (best-effort)
 */
router.delete('/reset/all', async (req, res) => {
  try {
    const { division, purgeRules } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const divisionCode = extractDivisionCode(division);
    const customerMasterTable = `${divisionCode}_customer_master`;
    const shouldPurgeRules = purgeRules === '1' || purgeRules === 'true' || purgeRules === 'yes';

    // Counts (best-effort)
    const counts = {
      activeRules: 0,
      suggestions: 0,
      notifications: 0,
      rejections: 0
    };

    try {
      const r = await divisionPool.query(
        `SELECT COUNT(*) as count FROM ${tables.divisionMergeRules} WHERE division = $1 AND is_active = true`,
        [division]
      );
      counts.activeRules = parseInt(r.rows[0].count);
    } catch (e) {
      // ignore
    }

    const safeCount = async (tableName) => {
      try {
        const r = await divisionPool.query(
          `SELECT COUNT(*) as count FROM ${tableName} WHERE division = $1`,
          [division]
        );
        return parseInt(r.rows[0].count);
      } catch (e) {
        return 0;
      }
    };

    counts.suggestions = await safeCount(tables.mergeRuleSuggestions);
    counts.notifications = await safeCount(tables.mergeRuleNotifications);
    counts.rejections = await safeCount(tables.mergeRuleRejections);

    // Check if customer master table exists
    const tableCheck = await divisionPool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = $1
      ) as exists`,
      [customerMasterTable]
    );
    const customerMasterExists = tableCheck.rows[0].exists;

    // Get all original customer names before deactivating rules
    let allCustomerNames = new Set();
    try {
      const customersResult = await divisionPool.query(
        `SELECT original_customers FROM ${tables.divisionMergeRules} WHERE division = $1 AND is_active = true`,
        [division]
      );
      for (const row of customersResult.rows) {
        const originals = row.original_customers || [];
        originals.forEach(name => allCustomerNames.add(name));
      }
    } catch (e) {
      allCustomerNames = new Set();
    }

    // 1) Deactivate all merge rules (scoped to division)
    try {
      await divisionPool.query(
        `UPDATE ${tables.divisionMergeRules} SET is_active = false WHERE division = $1 AND is_active = true`,
        [division]
      );
    } catch (e) {
      // ignore
    }

    // Optional: hard-delete all rules rows for this division
    if (shouldPurgeRules) {
      try {
        const totalRulesResult = await divisionPool.query(
          `SELECT COUNT(*) as count FROM ${tables.divisionMergeRules} WHERE division = $1`,
          [division]
        );
        counts.totalRules = parseInt(totalRulesResult.rows[0].count);
        await divisionPool.query(
          `DELETE FROM ${tables.divisionMergeRules} WHERE division = $1`,
          [division]
        );
      } catch (e) {
        // ignore
      }
    }

    // 2) Un-merge all customers in customer_master (best-effort)
    if (customerMasterExists && allCustomerNames.size > 0) {
      for (const customerName of allCustomerNames) {
        try {
          await divisionPool.query(
            `UPDATE ${customerMasterTable}
             SET is_merged = false, merged_into_code = NULL
             WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))`,
            [customerName]
          );
        } catch (e) {
          // ignore
        }
      }
    }

    // 3) Clear suggestions/notifications/rejections (best-effort)
    const safeDelete = async (tableName) => {
      try {
        await divisionPool.query(
          `DELETE FROM ${tableName} WHERE division = $1`,
          [division]
        );
        return true;
      } catch (e) {
        return false;
      }
    };

    await safeDelete(tables.mergeRuleSuggestions);
    await safeDelete(tables.mergeRuleNotifications);
    await safeDelete(tables.mergeRuleRejections);

    // 4) Sync to unified table
    try {
      await divisionPool.query('SELECT * FROM sync_customer_merges_to_unified()');
    } catch (syncErr) {
      logger.warn('Failed to sync unified table:', syncErr.message);
    }

    logger.info(`🧹 Global reset complete for division ${division}`, counts);

    res.json({
      success: true,
      message: shouldPurgeRules
        ? `Reset complete for ${division}: purged rules + cleared ${counts.suggestions} suggestion(s)`
        : `Reset complete for ${division}: cleared ${counts.activeRules} active rule(s) and ${counts.suggestions} suggestion(s)`,
      cleared: counts
    });
  } catch (error) {
    logger.error('Error running global reset:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/division-merge-rules/rules/:id
 * Delete a merge rule and sync customer master
 */
router.delete('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { division } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    // Get the rule details before deleting (for customer names)
    const ruleResult = await divisionPool.query(
      `SELECT merged_customer_name, original_customers, master_customer_code 
       FROM ${tables.divisionMergeRules} 
       WHERE id = $1`,
      [id]
    );

    if (ruleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Merge rule not found'
      });
    }

    const rule = ruleResult.rows[0];
    const originalCustomers = rule.original_customers || [];

    // Actually DELETE the merge rule (not just deactivate)
    await divisionPool.query(
      `DELETE FROM ${tables.divisionMergeRules} WHERE id = $1`,
      [id]
    );

    // CRITICAL: Sync customer master table - un-merge the customers
    // For each customer name in the rule, find matching customers and un-merge them
    for (const customerName of originalCustomers) {
      await divisionPool.query(`
        UPDATE ${extractDivisionCode(division)}_customer_master
        SET is_merged = false, merged_into_code = NULL
        WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))
      `, [customerName]);
    }

    logger.info(`🗑️ Rule #${id} deleted and ${originalCustomers.length} customers un-merged`);

    res.json({
      success: true,
      message: 'Rule deleted successfully and customers un-merged',
      unmergedCustomerNames: originalCustomers.length
    });

  } catch (error) {
    logger.error('Error deleting rule:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================================================
// VALIDATION ENDPOINTS
// ========================================================================

/**
 * POST /api/division-merge-rules/validate
 * Validate all merge rules for a division
 */
router.post('/validate', async (req, res) => {
  try {
    const { division } = req.body;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    logger.info(`🔍 Validating merge rules for ${division}...`);

    // Get current customers
    const CustomerMergingAI = getCustomerMergingAI();
    const customers = await CustomerMergingAI.getAllCustomers(division);

    // Validate all rules
    const validationResults = await CustomerMergingAI.validateMergeRules(division, customers);

    res.json({
      success: true,
      data: validationResults,
      summary: {
        total: validationResults.length,
        valid: validationResults.filter(r => r.status === 'VALID').length,
        needsUpdate: validationResults.filter(r => r.status === 'NEEDS_UPDATE').length,
        orphaned: validationResults.filter(r => r.status === 'ORPHANED').length
      }
    });

  } catch (error) {
    logger.error('Error validating rules:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/division-merge-rules/stats
 * Get statistics for division merge rules
 */
router.get('/stats', async (req, res) => {
  try {
    const { division } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    const stats = await divisionPool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND validation_status = 'VALID') as active_rules,
        COUNT(*) FILTER (WHERE validation_status = 'NEEDS_UPDATE') as needs_update,
        COUNT(*) FILTER (WHERE validation_status = 'ORPHANED') as orphaned,
        COUNT(*) FILTER (WHERE validation_status = 'NOT_VALIDATED') as not_validated
      FROM ${tables.divisionMergeRules}
      WHERE division = $1 AND is_active = true
    `, [division]);

    const suggestions = await divisionPool.query(`
      SELECT
        COUNT(*) FILTER (WHERE admin_action IS NULL OR admin_action = 'PENDING' OR admin_action = 'EDITED') as pending,
        COUNT(*) FILTER (WHERE admin_action = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE admin_action = 'REJECTED') as rejected,
        COUNT(*) FILTER (WHERE admin_action = 'EDITED') as edited
      FROM ${tables.mergeRuleSuggestions}
      WHERE division = $1
    `, [division]);

    res.json({
      success: true,
      data: {
        rules: stats.rows[0],
        suggestions: suggestions.rows[0]
      }
    });

  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================================================
// CUSTOMER LIST ENDPOINTS
// ========================================================================

/**
 * GET /api/customers/list
 * Get all unique customers for a division
 */
router.get('/customers/list', async (req, res) => {
  try {
    const { division } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const CustomerMergingAI = getCustomerMergingAI();
    const customers = await CustomerMergingAI.getAllCustomers(division);

    res.json({
      success: true,
      customers: customers,
      count: customers.length
    });

  } catch (error) {
    logger.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================================================
// AI LEARNING ENDPOINTS
// ========================================================================

/**
 * GET /api/division-merge-rules/ai/stats
 * Get AI learning statistics for a division
 */
router.get('/ai/stats', async (req, res) => {
  try {
    const { division } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const AILearningService = getAILearningService();
    const stats = await AILearningService.getLearningStats(division);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Error fetching AI stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/division-merge-rules/ai/train
 * Trigger AI model training
 */
router.post('/ai/train', async (req, res) => {
  try {
    const { division, triggeredBy } = req.body;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const AILearningService = getAILearningService();
    const result = await AILearningService.trainModel(division, {
      triggeredBy: triggeredBy || 'MANUAL',
      triggerReason: 'MANUAL'
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Error training AI model:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/division-merge-rules/ai/weights
 * Get current AI weights for a division
 */
router.get('/ai/weights', async (req, res) => {
  try {
    const { division } = req.query;

    if (!division) {
      return res.status(400).json({
        success: false,
        error: 'Division is required'
      });
    }

    const AILearningService = getAILearningService();
    const weights = await AILearningService.getActiveWeights(division);

    res.json({
      success: true,
      data: weights
    });

  } catch (error) {
    logger.error('Error fetching AI weights:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/division-merge-rules/ai/similarity
 * Calculate combined similarity (name + transaction) for two customers
 */
router.post('/ai/similarity', async (req, res) => {
  try {
    const { division, customer1, customer2 } = req.body;

    if (!division || !customer1 || !customer2) {
      return res.status(400).json({
        success: false,
        error: 'Division, customer1, and customer2 are required'
      });
    }

    const AILearningService = getAILearningService();
    const similarity = await AILearningService.getCombinedSimilarity(division, customer1, customer2);

    res.json({
      success: true,
      data: similarity
    });

  } catch (error) {
    logger.error('Error calculating similarity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/division-merge-rules/ai/config
 * Get AI configuration
 */
router.get('/ai/config', async (req, res) => {
  try {
    const AILearningService = getAILearningService();
    
    const config = {
      autoRetrainEnabled: await AILearningService.getConfig('auto_retrain_enabled') === 'true',
      autoRetrainThreshold: parseInt(await AILearningService.getConfig('auto_retrain_threshold') || '50'),
      minTrainingSamples: parseInt(await AILearningService.getConfig('min_training_samples') || '20'),
      minImprovementThreshold: parseFloat(await AILearningService.getConfig('min_improvement_threshold') || '0.02'),
      transactionSimilarityWeight: parseFloat(await AILearningService.getConfig('transaction_similarity_weight') || '0.15'),
      lastTrainingDate: await AILearningService.getConfig('last_training_date'),
      pendingDecisionsCount: parseInt(await AILearningService.getConfig('pending_decisions_count') || '0')
    };

    res.json({
      success: true,
      data: config
    });

  } catch (error) {
    logger.error('Error fetching AI config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/division-merge-rules/ai/config
 * Update AI configuration
 */
router.put('/ai/config', async (req, res) => {
  try {
    const { key, value, updatedBy } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Key and value are required'
      });
    }

    const AILearningService = getAILearningService();
    await AILearningService.setConfig(key, value, updatedBy || 'Admin');

    res.json({
      success: true,
      message: 'Configuration updated'
    });

  } catch (error) {
    logger.error('Error updating AI config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
