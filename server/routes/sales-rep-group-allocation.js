/**
 * Sales Rep Group Budget Allocation API Routes
 * 
 * Management allocates budgets at SALES REP GROUP + PRODUCT GROUP level
 * NOT at individual sales rep level!
 * 
 * Version: 3.1
 * Created: 2025-01-16
 * Updated: 2026-01-17 - Added auto-create table, fixed div-budget query
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { pool, authPool } = require('../database/config');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

// Month names for display
const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Helper: Get division-specific pool
 */
function getPoolForDivision(divisionCode) {
  return getDivisionPool(divisionCode.toUpperCase());
}

/**
 * Helper: Get table names for division
 */
function getTableNames(divisionCode) {
  const code = divisionCode.toLowerCase();
  return {
    allocation: `${code}_sales_rep_group_budget_allocation`,
    actualcommon: `${code}_actualcommon`,
    budgetUnified: `${code}_budget_unified`,
    pricingRounding: `${code}_product_group_pricing_rounding`,
    productGroupExclusions: `${code}_product_group_exclusions`
  };
}

/**
 * Ensure allocation table exists - auto-create if missing
 */
async function ensureAllocationTableExists(divisionPool, divisionCode) {
  const tables = getTableNames(divisionCode);
  const tableName = tables.allocation;

  try {
    // Check if table exists
    const check = await divisionPool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    `, [tableName]);

    if (check.rows.length === 0) {
      logger.info(`📊 Creating missing table: ${tableName}`);

      // Create the table
      await divisionPool.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          division_name VARCHAR(255) NOT NULL DEFAULT 'Flexible Packaging',
          division_code VARCHAR(50) NOT NULL DEFAULT '${divisionCode.toUpperCase()}',
          budget_year INTEGER NOT NULL,
          month_no INTEGER NOT NULL CHECK (month_no >= 1 AND month_no <= 12),
          month_name VARCHAR(20),
          sales_rep_group_id INTEGER REFERENCES sales_rep_groups(id) ON DELETE RESTRICT,
          sales_rep_group_name VARCHAR(255) NOT NULL,
          pgcombine VARCHAR(255) NOT NULL,
          qty_kgs NUMERIC(15,2) NOT NULL DEFAULT 0,
          amount NUMERIC(15,2) DEFAULT 0,
          morm NUMERIC(15,2) DEFAULT 0,
          budget_status VARCHAR(20) NOT NULL DEFAULT 'draft',
          version INTEGER NOT NULL DEFAULT 1,
          revision_reason TEXT,
          actual_prev_year_total NUMERIC(15,2),
          rep_submitted_total NUMERIC(15,2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by VARCHAR(255),
          submitted_at TIMESTAMP,
          submitted_by VARCHAR(255),
          CONSTRAINT uk_${divisionCode.toLowerCase()}_group_budget_allocation_unique
            UNIQUE (division_code, budget_year, month_no, sales_rep_group_id, pgcombine)
        )
      `);

      // Create indexes
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${divisionCode.toLowerCase()}_grp_alloc_division_year ON ${tableName}(division_code, budget_year)`);
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${divisionCode.toLowerCase()}_grp_alloc_group_id ON ${tableName}(sales_rep_group_id)`);
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${divisionCode.toLowerCase()}_grp_alloc_status ON ${tableName}(budget_status)`);

      logger.info(`✅ Created table: ${tableName}`);
    } else {
      // Table exists - ensure version column exists (for existing installations)
      const versionCheck = await divisionPool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'version'
      `, [tableName]);
      
      if (versionCheck.rows.length === 0) {
        logger.info(`📊 Adding version columns to existing table: ${tableName}`);
        await divisionPool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`);
        await divisionPool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS revision_reason TEXT`);
        logger.info(`✅ Added version columns to: ${tableName}`);
      }
    }
  } catch (error) {
    logger.error(`Error ensuring table exists: ${error.message}`);
    // Don't throw - allow endpoint to continue and fail naturally if table missing
  }
}

/**
 * Ensure budget history table exists - for audit trail
 */
async function ensureHistoryTableExists(divisionPool, divisionCode) {
  const historyTableName = `${divisionCode.toLowerCase()}_sales_rep_group_budget_history`;

  try {
    const check = await divisionPool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    `, [historyTableName]);

    if (check.rows.length === 0) {
      logger.info(`📊 Creating history table: ${historyTableName}`);

      await divisionPool.query(`
        CREATE TABLE IF NOT EXISTS ${historyTableName} (
          id SERIAL PRIMARY KEY,
          allocation_id INTEGER,
          division_code VARCHAR(50) NOT NULL,
          budget_year INTEGER NOT NULL,
          sales_rep_group_id INTEGER,
          sales_rep_group_name VARCHAR(255) NOT NULL,
          pgcombine VARCHAR(255) NOT NULL,
          month_no INTEGER NOT NULL,
          old_qty_kgs NUMERIC(15,2),
          new_qty_kgs NUMERIC(15,2),
          old_status VARCHAR(20),
          new_status VARCHAR(20),
          version INTEGER NOT NULL,
          revision_reason TEXT,
          changed_by VARCHAR(255),
          changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          change_type VARCHAR(20) NOT NULL DEFAULT 'update'
        )
      `);

      // Create indexes for faster queries
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${divisionCode.toLowerCase()}_budget_hist_group ON ${historyTableName}(sales_rep_group_id, budget_year)`);
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${divisionCode.toLowerCase()}_budget_hist_date ON ${historyTableName}(changed_at)`);

      logger.info(`✅ Created history table: ${historyTableName}`);
    }
  } catch (error) {
    logger.error(`Error ensuring history table exists: ${error.message}`);
  }
}

// ============================================================================
// ENDPOINT 0: Get Sales Rep Groups
// ============================================================================

/**
 * GET /api/sales-rep-group-allocation/groups
 * 
 * Returns all active sales rep groups for a division with member counts
 */
router.get('/groups', async (req, res) => {
  logger.info('📋 Get sales rep groups request:', req.query);
  
  try {
    const { divisionCode = 'FP' } = req.query;
    const divisionPool = getPoolForDivision(divisionCode);
    
    // Get groups with member counts
    const result = await divisionPool.query(`
      SELECT 
        g.id,
        g.group_name,
        g.division,
        g.is_active,
        COUNT(m.id) as member_count,
        ARRAY_AGG(m.member_name ORDER BY m.member_name) FILTER (WHERE m.member_name IS NOT NULL) as members
      FROM sales_rep_groups g
      LEFT JOIN sales_rep_group_members m ON m.group_id = g.id
      WHERE UPPER(g.division) = $1 AND g.is_active = true
      GROUP BY g.id, g.group_name, g.division, g.is_active
      ORDER BY g.group_name
    `, [divisionCode.toUpperCase()]);
    
    logger.info(`✅ Found ${result.rows.length} groups for ${divisionCode}`);
    
    res.json({
      success: true,
      groups: result.rows.map(g => ({
        id: g.id,
        group_name: g.group_name,
        division: g.division,
        member_count: parseInt(g.member_count) || 0,
        members: g.members || []
      }))
    });
    
  } catch (error) {
    logger.error('❌ Error getting groups:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ENDPOINT 0.5: Get Divisional Budget Summary
// ============================================================================

/**
 * GET /api/sales-rep-group-allocation/div-budget-remaining
 *
 * Returns REMAINING divisional budget by product group
 * Formula: Div Budget Total - Sum of All Groups Already Allocated
 *
 * This helps management see how much budget is left to allocate
 * NOTE: Not a hard limit - users can allocate more as a buffer
 */
router.get('/div-budget-remaining', async (req, res) => {
  logger.info('📊 Get remaining divisional budget request:', req.query);

  try {
    const { divisionCode = 'FP', budgetYear = 2026, excludeGroupId } = req.query;
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);

    // 1. Get total divisional budget per product group
    let divBudgetMap = {};

    // Try fp_budget_unified first
    const divResult = await divisionPool.query(`
      SELECT
        pgcombine,
        SUM(qty_kgs) as total_kgs
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1
        AND UPPER(budget_type) IN ('DIVISION', 'DIVISIONAL')
        AND (sales_rep_name IS NULL OR sales_rep_name = '')
        AND UPPER(division_code) = $2
      GROUP BY pgcombine
    `, [parseInt(budgetYear), divisionCode.toUpperCase()]);

    divResult.rows.forEach(r => {
      divBudgetMap[r.pgcombine] = parseFloat(r.total_kgs) || 0;
    });

    // Fallback to legacy table if needed
    if (Object.keys(divBudgetMap).length === 0) {
      try {
        const legacyResult = await divisionPool.query(`
          SELECT product_group as pgcombine, SUM(kgs) as total_kgs
          FROM fp_divisional_budget
          WHERE year = $1 AND UPPER(division_code) = $2
          GROUP BY product_group
        `, [parseInt(budgetYear), divisionCode.toUpperCase()]);

        legacyResult.rows.forEach(r => {
          divBudgetMap[r.pgcombine] = parseFloat(r.total_kgs) || 0;
        });
      } catch (e) {
        logger.warn('Could not query legacy divisional budget:', e.message);
      }
    }

    // 2. Get sum of all groups already allocated (excluding current group if specified)
    let allocatedMap = {};

    try {
      let allocQuery = `
        SELECT
          pgcombine,
          SUM(qty_kgs) as allocated_kgs
        FROM ${tables.allocation}
        WHERE division_code = $1
          AND budget_year = $2
      `;
      const params = [divisionCode.toUpperCase(), parseInt(budgetYear)];

      // Exclude current group if editing (so we don't subtract our own allocation)
      if (excludeGroupId) {
        allocQuery += ` AND sales_rep_group_id != $3`;
        params.push(parseInt(excludeGroupId));
      }

      allocQuery += ` GROUP BY pgcombine`;

      const allocResult = await divisionPool.query(allocQuery, params);

      allocResult.rows.forEach(r => {
        allocatedMap[r.pgcombine] = parseFloat(r.allocated_kgs) || 0;
      });
    } catch (e) {
      logger.warn('Could not query allocation table:', e.message);
    }

    // 3. Calculate remaining: divBudget - allocated
    const remainingMap = {};
    const allPGs = new Set([...Object.keys(divBudgetMap), ...Object.keys(allocatedMap)]);

    allPGs.forEach(pg => {
      const divTotal = divBudgetMap[pg] || 0;
      const allocated = allocatedMap[pg] || 0;
      remainingMap[pg] = {
        divBudgetTotal: divTotal,
        alreadyAllocated: allocated,
        remaining: divTotal - allocated
      };
    });

    logger.info(`✅ Calculated remaining budget for ${Object.keys(remainingMap).length} product groups`);

    res.json({
      success: true,
      data: remainingMap,
      budgetYear: parseInt(budgetYear),
      divisionCode
    });

  } catch (error) {
    logger.error('❌ Error getting remaining divisional budget:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sales-rep-group-allocation/div-budget-summary
 * 
 * Returns divisional budget totals by product group for a given year
 */
router.get('/div-budget-summary', async (req, res) => {
  logger.info('📊 Get divisional budget summary request:', req.query);
  
  try {
    const { divisionCode = 'FP', budgetYear = 2026 } = req.query;
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    
    let divBudgetMap = {};

    // Try 1: Get from fp_budget_unified (DIVISION type, no sales_rep_name)
    try {
      const result = await divisionPool.query(`
        SELECT
          pgcombine,
          SUM(qty_kgs) as total_kgs
        FROM ${tables.budgetUnified}
        WHERE budget_year = $1
          AND UPPER(budget_type) IN ('DIVISION', 'DIVISIONAL')
          AND (sales_rep_name IS NULL OR sales_rep_name = '')
          AND UPPER(division_code) = $2
        GROUP BY pgcombine
        ORDER BY pgcombine
      `, [parseInt(budgetYear), divisionCode.toUpperCase()]);

      result.rows.forEach(r => {
        divBudgetMap[r.pgcombine] = parseFloat(r.total_kgs) || 0;
      });

      logger.info(`📊 Found ${Object.keys(divBudgetMap).length} product groups from fp_budget_unified`);
    } catch (e) {
      logger.warn('Could not query fp_budget_unified for divisional budget:', e.message);
    }

    // Try 2: Fallback to fp_divisional_budget table (legacy) if no data found
    if (Object.keys(divBudgetMap).length === 0) {
      logger.info('📊 Falling back to fp_divisional_budget table...');
      try {
        const legacyResult = await divisionPool.query(`
          SELECT
            product_group as pgcombine,
            SUM(kgs) as total_kgs
          FROM fp_divisional_budget
          WHERE year = $1
            AND UPPER(division_code) = $2
          GROUP BY product_group
          ORDER BY product_group
        `, [parseInt(budgetYear), divisionCode.toUpperCase()]);

        legacyResult.rows.forEach(r => {
          divBudgetMap[r.pgcombine] = parseFloat(r.total_kgs) || 0;
        });

        logger.info(`📊 Found ${Object.keys(divBudgetMap).length} product groups from fp_divisional_budget`);
      } catch (e) {
        logger.warn('Could not query fp_divisional_budget:', e.message);
      }
    }

    logger.info(`✅ Found divisional budget for ${Object.keys(divBudgetMap).length} product groups`);
    
    res.json({
      success: true,
      data: divBudgetMap,
      budgetYear: parseInt(budgetYear),
      divisionCode
    });
    
  } catch (error) {
    logger.error('❌ Error getting divisional budget:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ENDPOINT 1: Load Allocation Data for a Group
// ============================================================================

/**
 * POST /api/sales-rep-group-allocation/load-data
 * 
 * Loads aggregated actuals and submitted budgets for a GROUP
 * Also returns existing draft allocations if any
 */
router.post('/load-data', async (req, res) => {
  logger.info('📥 Load allocation data request:', req.body);
  
  try {
    const { 
      divisionCode = 'FP', 
      budgetYear = 2026,
      actualYear,
      salesRepGroupId,
      salesRepGroupName
    } = req.body;
    
    if (!salesRepGroupId) {
      return res.status(400).json({
        success: false,
        error: 'salesRepGroupId is required'
      });
    }
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    // Use actualYear if provided, otherwise budgetYear - 1
    const prevYear = actualYear ? parseInt(actualYear) : budgetYear - 1;
    
    // Ensure allocation table exists
    await ensureAllocationTableExists(divisionPool, divisionCode);

    // 1. Get group members
    const membersResult = await divisionPool.query(`
      SELECT member_name 
      FROM sales_rep_group_members 
      WHERE group_id = $1
      ORDER BY member_name
    `, [salesRepGroupId]);
    
    const members = membersResult.rows.map(r => r.member_name);
    logger.info(`📋 Group ${salesRepGroupName} has ${members.length} members:`, members);
    
    if (members.length === 0) {
      return res.json({
        success: true,
        data: {
          groupMembers: [],
          productGroups: [],
          monthlyData: [],
          message: 'No members in this group'
        }
      });
    }
    
    // Include group name in search (bulk imports for groups use group name as sales_rep)
    const searchNames = [...members, salesRepGroupName];
    
    // 2. Get actuals aggregated by GROUP (sum of all members)
    const actualsResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as actual_kgs,
        SUM(amount) as actual_amount,
        SUM(morm) as actual_morm
      FROM ${tables.actualcommon}
      WHERE year = $1 
        AND sales_rep_name = ANY($2)
      GROUP BY pgcombine
      ORDER BY pgcombine
    `, [prevYear, members]);
    
    const actualsMap = {};
    actualsResult.rows.forEach(r => {
      actualsMap[r.pgcombine] = {
        actual_kgs: parseFloat(r.actual_kgs) || 0,
        actual_amount: parseFloat(r.actual_amount) || 0,
        actual_morm: parseFloat(r.actual_morm) || 0
      };
    });
    
    logger.info(`📊 Found actuals for ${Object.keys(actualsMap).length} product groups`);
    
    // 3. Get rep submitted budgets aggregated by GROUP
    // Search by both individual member names AND the group name (bulk imports use group name)
    const submittedResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as submitted_kgs,
        SUM(amount) as submitted_amount,
        SUM(morm) as submitted_morm
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1 
        AND budget_type = 'SALES_REP'
        AND sales_rep_name = ANY($2)
      GROUP BY pgcombine
      ORDER BY pgcombine
    `, [budgetYear, searchNames]);
    
    const submittedMap = {};
    submittedResult.rows.forEach(r => {
      submittedMap[r.pgcombine] = {
        submitted_kgs: parseFloat(r.submitted_kgs) || 0,
        submitted_amount: parseFloat(r.submitted_amount) || 0,
        submitted_morm: parseFloat(r.submitted_morm) || 0
      };
    });
    
    logger.info(`📊 Found submitted budgets for ${Object.keys(submittedMap).length} product groups (searched: ${searchNames.join(', ')})`);
    
    // 4. Get pricing data (note: pricing table uses 'product_group' column)
    // Budget pricing = budget year - 1 (e.g., Budget 2026 uses 2025 prices)
    const pricingResult = await divisionPool.query(`
      SELECT product_group as pgcombine, asp_round, morm_round
      FROM ${tables.pricingRounding}
      WHERE year = $1 AND UPPER(division) = $2
    `, [prevYear, divisionCode.toUpperCase()]);
    
    const pricingMap = {};
    pricingResult.rows.forEach(r => {
      pricingMap[r.pgcombine] = {
        asp_round: parseFloat(r.asp_round) || 0,
        morm_round: parseFloat(r.morm_round) || 0
      };
    });
    
    // 5. Get existing draft allocations (yearly totals)
    const draftResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as draft_kgs,
        SUM(amount) as draft_amount,
        SUM(morm) as draft_morm,
        MAX(budget_status) as status,
        MAX(version) as version,
        MAX(revision_reason) as revision_reason,
        MAX(actual_prev_year_total) as actual_prev_year_total,
        MAX(rep_submitted_total) as rep_submitted_total
      FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2 
        AND sales_rep_group_id = $3
      GROUP BY pgcombine
      ORDER BY pgcombine
    `, [divisionCode.toUpperCase(), budgetYear, salesRepGroupId]);
    
    const draftMap = {};
    let draftStatus = null;
    let budgetVersion = 1;
    let revisionReason = null;
    draftResult.rows.forEach(r => {
      draftMap[r.pgcombine] = {
        draft_kgs: parseFloat(r.draft_kgs) || 0,
        draft_amount: parseFloat(r.draft_amount) || 0,
        draft_morm: parseFloat(r.draft_morm) || 0
      };
      draftStatus = r.status;
      budgetVersion = Math.max(budgetVersion, r.version || 1);
      revisionReason = r.revision_reason || revisionReason;
    });
    
    // 6. Get all product groups (from pricing table - note: uses 'product_group' column)
    // Budget pricing = budget year - 1 (e.g., Budget 2026 uses 2025 prices)
    // Exclude 'Services Charges' and any product groups in the exclusions table
    const allPGs = await divisionPool.query(`
      SELECT DISTINCT product_group as pgcombine 
      FROM ${tables.pricingRounding}
      WHERE year = $1 AND UPPER(division) = $2
        AND UPPER(TRIM(product_group)) != 'SERVICES CHARGES'
        AND product_group NOT IN (
          SELECT product_group FROM ${tables.productGroupExclusions}
          WHERE UPPER(division_code) = $2
        )
      ORDER BY product_group
    `, [prevYear, divisionCode.toUpperCase()]);
    
    // 7. Combine into product groups array
    const productGroups = allPGs.rows.map(pg => {
      const pgName = pg.pgcombine;
      return {
        pgcombine: pgName,
        actual_prev_year_kgs: actualsMap[pgName]?.actual_kgs || 0,
        actual_prev_year_amount: actualsMap[pgName]?.actual_amount || 0,
        actual_prev_year_morm: actualsMap[pgName]?.actual_morm || 0,
        rep_submitted_kgs: submittedMap[pgName]?.submitted_kgs || 0,
        rep_submitted_amount: submittedMap[pgName]?.submitted_amount || 0,
        rep_submitted_morm: submittedMap[pgName]?.submitted_morm || 0,
        draft_kgs: draftMap[pgName]?.draft_kgs || null,
        draft_amount: draftMap[pgName]?.draft_amount || null,
        draft_morm: draftMap[pgName]?.draft_morm || null,
        pricing: pricingMap[pgName] || { asp_round: 0, morm_round: 0 }
      };
    });
    
    // 8. Get monthly data if draft exists
    let monthlyData = [];
    if (Object.keys(draftMap).length > 0) {
      const monthlyResult = await divisionPool.query(`
        SELECT 
          pgcombine,
          month_no,
          month_name,
          qty_kgs,
          amount,
          morm
        FROM ${tables.allocation}
        WHERE division_code = $1 
          AND budget_year = $2 
          AND sales_rep_group_id = $3
        ORDER BY pgcombine, month_no
      `, [divisionCode.toUpperCase(), budgetYear, salesRepGroupId]);
      
      monthlyData = monthlyResult.rows.map(r => ({
        pgcombine: r.pgcombine,
        month_no: r.month_no,
        month_name: r.month_name,
        qty_kgs: parseFloat(r.qty_kgs) || 0,
        amount: parseFloat(r.amount) || 0,
        morm: parseFloat(r.morm) || 0
      }));
    }
    
    res.json({
      success: true,
      data: {
        groupMembers: members,
        groupName: salesRepGroupName,
        productGroups,
        monthlyData,
        draftStatus,
        version: budgetVersion,
        revisionReason,
        budgetYear,
        prevYear
      }
    });
    
  } catch (error) {
    logger.error('❌ Error loading allocation data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ENDPOINT 1.5: Load ALL Groups Combined Data (Read-Only Summary)
// ============================================================================

/**
 * POST /api/sales-rep-group-allocation/load-all-data
 * 
 * Loads combined data for ALL sales rep groups with per-group breakdown
 * Shows totals across all groups per product group
 * Includes per-group breakdown for expandable rows editing
 */
router.post('/load-all-data', async (req, res) => {
  logger.info('📥 Load ALL groups data request:', req.body);
  
  try {
    const { 
      divisionCode = 'FP', 
      budgetYear = 2026,
      actualYear
    } = req.body;
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    const prevYear = actualYear ? parseInt(actualYear) : budgetYear - 1;
    
    // 1. Get all groups with their members
    const groupsResult = await divisionPool.query(`
      SELECT 
        g.id,
        g.group_name,
        ARRAY_AGG(m.member_name ORDER BY m.member_name) FILTER (WHERE m.member_name IS NOT NULL) as members
      FROM sales_rep_groups g
      LEFT JOIN sales_rep_group_members m ON m.group_id = g.id
      WHERE UPPER(g.division) = $1 AND g.is_active = true
      GROUP BY g.id, g.group_name
      ORDER BY g.group_name
    `, [divisionCode.toUpperCase()]);
    
    const groups = groupsResult.rows;
    const allMembers = [];
    const allSearchNames = [];
    const groupMembersMap = {}; // Map of group_id -> members array
    groups.forEach(g => {
      groupMembersMap[g.id] = g.members || [];
      if (g.members) {
        allMembers.push(...g.members);
        allSearchNames.push(...g.members);
      }
      allSearchNames.push(g.group_name); // Include group names for bulk imports
    });
    
    logger.info(`📋 Found ${groups.length} groups with ${allMembers.length} total members`);
    
    // 2. Get actuals aggregated (ALL sales reps) - TOTAL
    const actualsResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as actual_kgs,
        SUM(amount) as actual_amount,
        SUM(morm) as actual_morm
      FROM ${tables.actualcommon}
      WHERE year = $1 
        AND sales_rep_name = ANY($2)
      GROUP BY pgcombine
      ORDER BY pgcombine
    `, [prevYear, allMembers]);
    
    const actualsMap = {};
    actualsResult.rows.forEach(r => {
      actualsMap[r.pgcombine] = {
        actual_kgs: parseFloat(r.actual_kgs) || 0,
        actual_amount: parseFloat(r.actual_amount) || 0,
        actual_morm: parseFloat(r.actual_morm) || 0
      };
    });
    
    // 2b. Get actuals PER GROUP (for breakdown)
    const actualsPerGroupResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        sales_rep_name,
        SUM(qty_kgs) as actual_kgs
      FROM ${tables.actualcommon}
      WHERE year = $1 
        AND sales_rep_name = ANY($2)
      GROUP BY pgcombine, sales_rep_name
      ORDER BY pgcombine, sales_rep_name
    `, [prevYear, allMembers]);
    
    // Map sales rep actuals to their group
    const actualsPerGroupMap = {}; // { pgcombine: { groupId: actual_kgs } }
    actualsPerGroupResult.rows.forEach(r => {
      const pgName = r.pgcombine;
      const repName = r.sales_rep_name;
      // Find which group this rep belongs to
      for (const g of groups) {
        if (g.members && g.members.includes(repName)) {
          if (!actualsPerGroupMap[pgName]) actualsPerGroupMap[pgName] = {};
          actualsPerGroupMap[pgName][g.id] = (actualsPerGroupMap[pgName][g.id] || 0) + (parseFloat(r.actual_kgs) || 0);
          break;
        }
      }
    });
    
    logger.info(`📊 Found actuals for ${Object.keys(actualsMap).length} product groups`);
    
    // 3. Get ALL submitted budgets aggregated
    const submittedResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as submitted_kgs,
        SUM(amount) as submitted_amount,
        SUM(morm) as submitted_morm
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1 
        AND budget_type = 'SALES_REP'
        AND sales_rep_name = ANY($2)
      GROUP BY pgcombine
      ORDER BY pgcombine
    `, [budgetYear, allSearchNames]);
    
    const submittedMap = {};
    submittedResult.rows.forEach(r => {
      submittedMap[r.pgcombine] = {
        submitted_kgs: parseFloat(r.submitted_kgs) || 0,
        submitted_amount: parseFloat(r.submitted_amount) || 0,
        submitted_morm: parseFloat(r.submitted_morm) || 0
      };
    });
    
    // 3b. Get submitted PER GROUP (for breakdown)
    const submittedPerGroupResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        sales_rep_name,
        SUM(qty_kgs) as submitted_kgs
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1 
        AND budget_type = 'SALES_REP'
        AND sales_rep_name = ANY($2)
      GROUP BY pgcombine, sales_rep_name
      ORDER BY pgcombine, sales_rep_name
    `, [budgetYear, allSearchNames]);
    
    // Map to groups
    const submittedPerGroupMap = {}; // { pgcombine: { groupId: submitted_kgs } }
    submittedPerGroupResult.rows.forEach(r => {
      const pgName = r.pgcombine;
      const repName = r.sales_rep_name;
      // Find which group - check members and group names
      for (const g of groups) {
        const isGroupMatch = g.group_name.toUpperCase() === repName.toUpperCase();
        const isMemberMatch = g.members && g.members.some(m => m.toUpperCase() === repName.toUpperCase());
        if (isGroupMatch || isMemberMatch) {
          if (!submittedPerGroupMap[pgName]) submittedPerGroupMap[pgName] = {};
          submittedPerGroupMap[pgName][g.id] = (submittedPerGroupMap[pgName][g.id] || 0) + (parseFloat(r.submitted_kgs) || 0);
          break;
        }
      }
    });
    
    logger.info(`📊 Found submitted budgets for ${Object.keys(submittedMap).length} product groups`);
    
    // 4. Get ALL management allocations aggregated
    const allocationsResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as allocated_kgs,
        SUM(amount) as allocated_amount,
        SUM(morm) as allocated_morm
      FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2
      GROUP BY pgcombine
      ORDER BY pgcombine
    `, [divisionCode.toUpperCase(), budgetYear]);
    
    const allocatedMap = {};
    allocationsResult.rows.forEach(r => {
      allocatedMap[r.pgcombine] = {
        allocated_kgs: parseFloat(r.allocated_kgs) || 0,
        allocated_amount: parseFloat(r.allocated_amount) || 0,
        allocated_morm: parseFloat(r.allocated_morm) || 0
      };
    });
    
    // 4b. Get allocations PER GROUP (for breakdown editing)
    const allocationsPerGroupResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        sales_rep_group_id,
        SUM(qty_kgs) as allocated_kgs
      FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2
      GROUP BY pgcombine, sales_rep_group_id
      ORDER BY pgcombine, sales_rep_group_id
    `, [divisionCode.toUpperCase(), budgetYear]);
    
    const allocatedPerGroupMap = {}; // { pgcombine: { groupId: allocated_kgs } }
    allocationsPerGroupResult.rows.forEach(r => {
      const pgName = r.pgcombine;
      const groupId = r.sales_rep_group_id;
      if (!allocatedPerGroupMap[pgName]) allocatedPerGroupMap[pgName] = {};
      allocatedPerGroupMap[pgName][groupId] = parseFloat(r.allocated_kgs) || 0;
    });
    
    logger.info(`📊 Found allocations for ${Object.keys(allocatedMap).length} product groups`);
    
    // 5. Get all product groups from pricing (prevYear)
    const allPGs = await divisionPool.query(`
      SELECT DISTINCT product_group as pgcombine 
      FROM ${tables.pricingRounding}
      WHERE year = $1 AND UPPER(division) = $2
        AND UPPER(TRIM(product_group)) != 'SERVICES CHARGES'
        AND product_group NOT IN (
          SELECT product_group FROM ${tables.productGroupExclusions}
          WHERE UPPER(division_code) = $2
        )
      ORDER BY product_group
    `, [prevYear, divisionCode.toUpperCase()]);
    
    // 6. Combine into product groups array with per-group breakdown
    const productGroups = allPGs.rows.map(pg => {
      const pgName = pg.pgcombine;
      
      // Build per-group breakdown for this product group
      const groupBreakdown = groups.map(g => ({
        groupId: g.id,
        groupName: g.group_name,
        members: g.members || [],
        actual_kgs: actualsPerGroupMap[pgName]?.[g.id] || 0,
        submitted_kgs: submittedPerGroupMap[pgName]?.[g.id] || 0,
        allocated_kgs: allocatedPerGroupMap[pgName]?.[g.id] || 0
      }));
      
      return {
        pgcombine: pgName,
        actual_prev_year_kgs: actualsMap[pgName]?.actual_kgs || 0,
        rep_submitted_kgs: submittedMap[pgName]?.submitted_kgs || 0,
        allocated_kgs: allocatedMap[pgName]?.allocated_kgs || 0,
        groupBreakdown // Per-group data for expandable rows
      };
    });
    
    res.json({
      success: true,
      data: {
        groupCount: groups.length,
        memberCount: allMembers.length,
        groups: groups.map(g => ({ id: g.id, name: g.group_name, members: g.members || [] })),
        productGroups,
        budgetYear,
        prevYear,
        isAllGroups: true
      }
    });
    
  } catch (error) {
    logger.error('❌ Error loading all groups data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ENDPOINT 1.6: Save Bulk Allocations from "All Groups" View
// ============================================================================

/**
 * POST /api/sales-rep-group-allocation/save-bulk-allocations
 * 
 * Saves multiple group allocations at once from the "All Groups" view
 * Used when editing per-group allocations in the expanded rows
 */
router.post('/save-bulk-allocations', async (req, res) => {
  logger.info('📥 Save bulk allocations request:', req.body);
  
  try {
    const { 
      divisionCode = 'FP', 
      budgetYear = 2026,
      allocations // Array of { groupId, groupName, pgcombine, qty_kgs }
    } = req.body;
    
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ success: false, error: 'No allocations provided' });
    }
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    
    // Get pricing data for the budget year
    const prevYear = budgetYear - 1;
    const pricingResult = await divisionPool.query(`
      SELECT 
        LOWER(TRIM(product_group)) as product_group,
        COALESCE(asp_round, 0) as asp,
        COALESCE(morm_round, 0) as morm
      FROM ${tables.pricingRounding}
      WHERE year = $1 AND UPPER(division) = $2
    `, [prevYear, divisionCode.toUpperCase()]);
    
    const pricingMap = {};
    pricingResult.rows.forEach(r => {
      pricingMap[r.product_group] = { asp: r.asp, morm: r.morm };
    });
    
    // Process each allocation
    let savedCount = 0;
    let updatedCount = 0;
    
    for (const alloc of allocations) {
      const { groupId, groupName, pgcombine, qty_kgs } = alloc;
      
      if (!groupId || !pgcombine) continue;
      
      const pgLower = pgcombine.toLowerCase().trim();
      const pricing = pricingMap[pgLower] || { asp: 0, morm: 0 };
      const amount = (qty_kgs / 1000) * pricing.asp; // Convert KGS to MT then multiply
      const morm = (qty_kgs / 1000) * pricing.morm;
      
      // Check if record exists
      const existsResult = await divisionPool.query(`
        SELECT id FROM ${tables.allocation}
        WHERE division_code = $1 
          AND budget_year = $2 
          AND sales_rep_group_id = $3 
          AND pgcombine = $4
      `, [divisionCode.toUpperCase(), budgetYear, groupId, pgcombine]);
      
      if (existsResult.rows.length > 0) {
        // Update existing
        if (qty_kgs > 0) {
          await divisionPool.query(`
            UPDATE ${tables.allocation}
            SET qty_kgs = $1, amount = $2, morm = $3, 
                budget_status = 'draft', updated_at = NOW()
            WHERE division_code = $4 
              AND budget_year = $5 
              AND sales_rep_group_id = $6 
              AND pgcombine = $7
          `, [qty_kgs, amount, morm, divisionCode.toUpperCase(), budgetYear, groupId, pgcombine]);
          updatedCount++;
        } else {
          // Delete if zero
          await divisionPool.query(`
            DELETE FROM ${tables.allocation}
            WHERE division_code = $1 
              AND budget_year = $2 
              AND sales_rep_group_id = $3 
              AND pgcombine = $4
          `, [divisionCode.toUpperCase(), budgetYear, groupId, pgcombine]);
        }
      } else if (qty_kgs > 0) {
        // Insert new
        await divisionPool.query(`
          INSERT INTO ${tables.allocation} 
            (division_code, division_name, budget_year, sales_rep_group_id, sales_rep_group_name, 
             pgcombine, qty_kgs, amount, morm, budget_status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', NOW(), NOW())
        `, [
          divisionCode.toUpperCase(), 
          divisionCode,
          budgetYear, 
          groupId, 
          groupName,
          pgcombine, 
          qty_kgs, 
          amount, 
          morm
        ]);
        savedCount++;
      }
    }
    
    logger.info(`✅ Bulk save complete: ${savedCount} inserted, ${updatedCount} updated`);
    
    res.json({
      success: true,
      savedCount,
      updatedCount,
      message: `Saved ${savedCount + updatedCount} allocations`
    });
    
  } catch (error) {
    logger.error('❌ Error saving bulk allocations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ENDPOINT 2: Save Draft Allocation
// ============================================================================

/**
 * POST /api/sales-rep-group-allocation/save-draft
 * 
 * Saves management's GROUP-level budget allocation as draft
 */
router.post('/save-draft', async (req, res) => {
  logger.info('💾 Save draft allocation request:', {
    divisionCode: req.body.divisionCode,
    budgetYear: req.body.budgetYear,
    salesRepGroupId: req.body.salesRepGroupId,
    salesRepGroupName: req.body.salesRepGroupName,
    budgetDataCount: (req.body.budgetData || []).length
  });
  
  try {
    const {
      divisionCode = 'FP',
      divisionName = 'Flexible Packaging',
      budgetYear = 2026,
      actualYear,
      salesRepGroupId,
      salesRepGroupName,
      budgetData,
      monthlyPercentages
    } = req.body;
    
    // Use actualYear if provided, otherwise budgetYear - 1
    const prevYear = actualYear ? parseInt(actualYear) : budgetYear - 1;

    if (!salesRepGroupId || !salesRepGroupName || !budgetData || budgetData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'salesRepGroupId, salesRepGroupName, and budgetData are required'
      });
    }
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    
    // Ensure allocation table exists
    await ensureAllocationTableExists(divisionPool, divisionCode);

    // Get group members for fetching actual monthly patterns
    const membersResult = await divisionPool.query(`
      SELECT member_name
      FROM sales_rep_group_members
      WHERE group_id = $1
    `, [salesRepGroupId]);
    const members = membersResult.rows.map(r => r.member_name);

    // Get MONTHLY actual data for this group to calculate distribution percentages
    // This gives us the seasonal pattern for each product group
    const monthlyActualsResult = await divisionPool.query(`
      SELECT
        pgcombine,
        month_no,
        SUM(qty_kgs) as monthly_kgs
      FROM ${tables.actualcommon}
      WHERE year = $1
        AND sales_rep_name = ANY($2)
      GROUP BY pgcombine, month_no
      ORDER BY pgcombine, month_no
    `, [prevYear, members]);

    // Build a map of monthly percentages per product group based on actuals
    // Structure: { "Product Group": { 1: 8.5, 2: 7.2, ..., 12: 9.1 } }
    const actualMonthlyMap = {};
    const actualYearlyTotals = {};

    monthlyActualsResult.rows.forEach(r => {
      const pg = r.pgcombine;
      if (!actualMonthlyMap[pg]) {
        actualMonthlyMap[pg] = {};
        actualYearlyTotals[pg] = 0;
      }
      const kgs = parseFloat(r.monthly_kgs) || 0;
      actualMonthlyMap[pg][r.month_no] = kgs;
      actualYearlyTotals[pg] += kgs;
    });

    // Convert to percentages
    const percentagesByPG = {};
    for (const pg of Object.keys(actualMonthlyMap)) {
      const yearlyTotal = actualYearlyTotals[pg] || 0;
      percentagesByPG[pg] = {};

      if (yearlyTotal > 0) {
        for (let m = 1; m <= 12; m++) {
          const monthlyKgs = actualMonthlyMap[pg][m] || 0;
          percentagesByPG[pg][m] = (monthlyKgs / yearlyTotal) * 100;
        }
      } else {
        // No actual data - use equal distribution
        for (let m = 1; m <= 12; m++) {
          percentagesByPG[pg][m] = 8.33;
        }
        percentagesByPG[pg][7] = 8.39; // Adjust for rounding
      }
    }

    logger.info(`📊 Calculated monthly percentages for ${Object.keys(percentagesByPG).length} product groups based on ${prevYear} actuals`);

    // Default equal distribution for product groups with no actual data
    const defaultPercentages = {};
    for (let m = 1; m <= 12; m++) {
      defaultPercentages[m] = 8.33;
    }
    defaultPercentages[7] = 8.39;

    // Get pricing data
    const pricingResult = await divisionPool.query(`
      SELECT product_group as pgcombine, asp_round, morm_round
      FROM ${tables.pricingRounding}
      WHERE year = $1 AND UPPER(division) = $2
        AND UPPER(TRIM(product_group)) != 'SERVICES CHARGES'
    `, [budgetYear, divisionCode.toUpperCase()]);
    
    const pricingMap = {};
    pricingResult.rows.forEach(r => {
      pricingMap[r.pgcombine] = {
        asp_round: parseFloat(r.asp_round) || 0,
        morm_round: parseFloat(r.morm_round) || 0
      };
    });
    
    // Start transaction
    const client = await divisionPool.connect();
    let recordsInserted = 0;
    let recordsDeleted = 0;
    let isRevision = false;
    let currentVersion = 1;
    const historyTableName = `${divisionCode.toLowerCase()}_sales_rep_group_budget_history`;
    
    try {
      await client.query('BEGIN');
      
      // Ensure history table exists
      await ensureHistoryTableExists(divisionPool, divisionCode);
      
      // Check if there's an existing APPROVED budget for this group/year
      const approvedCheck = await client.query(`
        SELECT id, pgcombine, month_no, qty_kgs, amount, morm, budget_status, version
        FROM ${tables.allocation}
        WHERE division_code = $1 
          AND budget_year = $2 
          AND sales_rep_group_id = $3
          AND budget_status = 'approved'
      `, [divisionCode.toUpperCase(), budgetYear, salesRepGroupId]);
      
      if (approvedCheck.rows.length > 0) {
        // This is a REVISION of an approved budget
        isRevision = true;
        currentVersion = Math.max(...approvedCheck.rows.map(r => r.version || 1));
        logger.info(`📝 This is a REVISION of approved budget (version ${currentVersion})`);
        
        // Save current approved values to history before modifying
        for (const oldRow of approvedCheck.rows) {
          await client.query(`
            INSERT INTO ${historyTableName} (
              allocation_id, division_code, budget_year, sales_rep_group_id,
              sales_rep_group_name, pgcombine, month_no,
              old_qty_kgs, old_status, version, changed_by, change_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'revision_started')
          `, [
            oldRow.id,
            divisionCode.toUpperCase(),
            budgetYear,
            salesRepGroupId,
            salesRepGroupName,
            oldRow.pgcombine,
            oldRow.month_no,
            oldRow.qty_kgs,
            oldRow.budget_status,
            currentVersion,
            req.user?.username || 'system'
          ]);
        }
        
        // Delete approved records (will be replaced with revision records)
        await client.query(`
          DELETE FROM ${tables.allocation}
          WHERE division_code = $1 
            AND budget_year = $2 
            AND sales_rep_group_id = $3
            AND budget_status = 'approved'
        `, [divisionCode.toUpperCase(), budgetYear, salesRepGroupId]);
        
        logger.info(`🔄 Saved ${approvedCheck.rows.length} records to history, preparing revision`);
      }
      
      // Delete existing draft/revision for this group/year
      const deleteResult = await client.query(`
        DELETE FROM ${tables.allocation}
        WHERE division_code = $1 
          AND budget_year = $2 
          AND sales_rep_group_id = $3
          AND budget_status IN ('draft', 'revision')
      `, [divisionCode.toUpperCase(), budgetYear, salesRepGroupId]);
      
      recordsDeleted = deleteResult.rowCount;
      logger.info(`🗑️ Deleted ${recordsDeleted} existing draft/revision records`);
      
      // Determine status for new records
      const newStatus = isRevision ? 'revision' : 'draft';
      
      // Insert new allocations for each product group × 12 months
      for (const pg of budgetData) {
        const pricing = pricingMap[pg.pgcombine] || { asp_round: 0, morm_round: 0 };
        const yearlyKgs = Math.round((pg.yearly_kgs || 0) * 100) / 100;

        // Use product-group-specific percentages if available, otherwise default
        // Also allow manual override via monthlyPercentages parameter
        const percentages = monthlyPercentages || percentagesByPG[pg.pgcombine] || defaultPercentages;

        // Calculate monthly values and track sum for rounding adjustment
        let monthlyValues = [];
        let sumKgs = 0;

        for (let monthNo = 1; monthNo <= 12; monthNo++) {
          const pct = percentages[monthNo] || 8.33;
          // Round to 2 decimal places
          const monthlyKgs = Math.round(yearlyKgs * (pct / 100) * 100) / 100;
          monthlyValues.push({ monthNo, kgs: monthlyKgs });
          sumKgs += monthlyKgs;
        }

        // Adjust last month to ensure sum equals yearly_kgs exactly (absorb rounding difference)
        const roundingDiff = Math.round((yearlyKgs - sumKgs) * 100) / 100;
        if (roundingDiff !== 0 && monthlyValues.length > 0) {
          monthlyValues[11].kgs = Math.round((monthlyValues[11].kgs + roundingDiff) * 100) / 100;
        }

        // Insert each month
        for (const mv of monthlyValues) {
          const monthlyKgs = mv.kgs;
          const monthlyAmount = Math.round(monthlyKgs * pricing.asp_round * 100) / 100;
          const monthlyMorm = Math.round(monthlyKgs * pricing.morm_round * 100) / 100;

          await client.query(`
            INSERT INTO ${tables.allocation} (
              division_code, division_name, budget_year, month_no, month_name,
              sales_rep_group_id, sales_rep_group_name, pgcombine,
              qty_kgs, amount, morm, budget_status, version,
              actual_prev_year_total, rep_submitted_total,
              created_by, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8,
              $9, $10, $11, $12, $13,
              $14, $15,
              $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
          `, [
            divisionCode.toUpperCase(),
            divisionName,
            budgetYear,
            mv.monthNo,
            MONTH_NAMES[mv.monthNo],
            salesRepGroupId,
            salesRepGroupName,
            pg.pgcombine,
            monthlyKgs,
            monthlyAmount,
            monthlyMorm,
            newStatus,  // 'draft' or 'revision'
            isRevision ? currentVersion + 1 : 1,  // Increment version if revision
            pg.actual_prev_year || null,
            pg.rep_submitted || null,
            req.user?.username || 'system'
          ]);
          
          recordsInserted++;
        }
      }
      
      await client.query('COMMIT');
      
      const statusMsg = isRevision ? `Revision v${currentVersion + 1}` : 'Draft';
      logger.info(`✅ ${statusMsg} saved: ${recordsInserted} records for group "${salesRepGroupName}" using ${prevYear} actual patterns`);

      res.json({
        success: true,
        message: isRevision 
          ? `Revision saved for group "${salesRepGroupName}" (v${currentVersion + 1}). Click "Approve Budget" to finalize.`
          : `Draft saved for group "${salesRepGroupName}" using ${prevYear} seasonal patterns`,
        recordsSaved: recordsInserted,
        recordsDeleted,
        productGroups: budgetData.length,
        actualYearUsed: prevYear,
        isRevision,
        version: isRevision ? currentVersion + 1 : 1
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('❌ Error saving draft:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ENDPOINT 3: Submit Final (Approve Allocation)
// ============================================================================

/**
 * POST /api/sales-rep-group-allocation/submit-final
 * 
 * Submits/approves the GROUP allocation
 * Handles both initial approval and revision approval (version increment)
 */
router.post('/submit-final', async (req, res) => {
  logger.info('✅ Submit final allocation request:', req.body);
  
  try {
    const {
      divisionCode = 'FP',
      budgetYear = 2026,
      salesRepGroupId,
      salesRepGroupName,
      revisionReason  // Optional: reason for revision
    } = req.body;
    
    if (!salesRepGroupId) {
      return res.status(400).json({
        success: false,
        error: 'salesRepGroupId is required'
      });
    }
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    const historyTableName = `${divisionCode.toLowerCase()}_sales_rep_group_budget_history`;
    
    // Ensure history table exists
    await ensureHistoryTableExists(divisionPool, divisionCode);
    
    // Check if draft or revision exists
    const draftCheck = await divisionPool.query(`
      SELECT id, budget_status, version, pgcombine, month_no, qty_kgs
      FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2 
        AND sales_rep_group_id = $3
        AND budget_status IN ('draft', 'revision')
    `, [divisionCode.toUpperCase(), budgetYear, salesRepGroupId]);
    
    if (draftCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No draft or revision found to approve. Save changes first.'
      });
    }
    
    const isRevision = draftCheck.rows[0].budget_status === 'revision';
    const currentVersion = Math.max(...draftCheck.rows.map(r => r.version || 1));
    
    // Start transaction
    const client = await divisionPool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Log to history if this is a revision approval
      if (isRevision && revisionReason) {
        for (const row of draftCheck.rows) {
          await client.query(`
            INSERT INTO ${historyTableName} (
              allocation_id, division_code, budget_year, sales_rep_group_id,
              sales_rep_group_name, pgcombine, month_no,
              new_qty_kgs, new_status, version, revision_reason, changed_by, change_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', $9, $10, $11, 'approved')
          `, [
            row.id,
            divisionCode.toUpperCase(),
            budgetYear,
            salesRepGroupId,
            salesRepGroupName,
            row.pgcombine,
            row.month_no,
            row.qty_kgs,
            currentVersion,
            revisionReason,
            req.user?.username || 'system'
          ]);
        }
      }
      
      // Update status to approved
      const updateResult = await client.query(`
        UPDATE ${tables.allocation}
        SET 
          budget_status = 'approved',
          revision_reason = $5,
          submitted_at = CURRENT_TIMESTAMP,
          submitted_by = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE division_code = $1 
          AND budget_year = $2 
          AND sales_rep_group_id = $3
          AND budget_status IN ('draft', 'revision')
      `, [divisionCode.toUpperCase(), budgetYear, salesRepGroupId, req.user?.username || 'system', revisionReason || null]);
      
      await client.query('COMMIT');
      
      const versionText = isRevision ? ` (Version ${currentVersion})` : '';
      logger.info(`✅ Approved ${updateResult.rowCount} records for group "${salesRepGroupName}"${versionText}`);
      
      res.json({
        success: true,
        message: isRevision 
          ? `Budget revision v${currentVersion} approved for group "${salesRepGroupName}"`
          : `Budget approved for group "${salesRepGroupName}"`,
        recordsApproved: updateResult.rowCount,
        version: currentVersion,
        isRevision
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('❌ Error submitting final:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ENDPOINT 4: Get All Groups Summary
// ============================================================================

/**
 * GET /api/sales-rep-group-allocation/summary
 * 
 * Returns allocation status for all groups in a division
 */
router.get('/summary', async (req, res) => {
  logger.info('📊 Get allocation summary request:', req.query);
  
  try {
    const { divisionCode = 'FP', budgetYear = 2026, actualYear } = req.query;
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    // Use actualYear if provided, otherwise budgetYear - 1
    const prevYear = actualYear ? parseInt(actualYear) : parseInt(budgetYear) - 1;
    
    // Get all groups with their allocation status
    const result = await divisionPool.query(`
      WITH group_allocations AS (
        SELECT 
          sales_rep_group_id,
          sales_rep_group_name,
          SUM(qty_kgs) as total_allocated_kgs,
          SUM(amount) as total_allocated_amount,
          MAX(budget_status) as status,
          MAX(submitted_at) as submitted_at
        FROM ${tables.allocation}
        WHERE division_code = $1 AND budget_year = $2
        GROUP BY sales_rep_group_id, sales_rep_group_name
      ),
      group_actuals AS (
        SELECT 
          COALESCE(g.id, 0) as group_id,
          COALESCE(g.group_name, 'Unassigned') as group_name,
          SUM(a.qty_kgs) as total_actual_kgs
        FROM ${tables.actualcommon} a
        LEFT JOIN sales_rep_group_members m ON LOWER(TRIM(a.sales_rep_name)) = LOWER(TRIM(m.member_name))
        LEFT JOIN sales_rep_groups g ON m.group_id = g.id AND UPPER(g.division) = $1
        WHERE a.year = $3
        GROUP BY COALESCE(g.id, 0), COALESCE(g.group_name, 'Unassigned')
      ),
      group_submitted AS (
        -- Group Submitted: ONLY count BULK_IMPORT data (management allocation)
        -- This excludes SALES_REP_IMPORT (final budget with customers)
        -- When sales rep imports final budget, their BULK_IMPORT data is deleted
        SELECT 
          COALESCE(g.id, 0) as group_id,
          COALESCE(g.group_name, 'Unassigned') as group_name,
          SUM(b.qty_kgs) as total_submitted_kgs
        FROM ${tables.budgetUnified} b
        LEFT JOIN sales_rep_group_members m ON LOWER(TRIM(b.sales_rep_name)) = LOWER(TRIM(m.member_name))
        LEFT JOIN sales_rep_groups g ON m.group_id = g.id AND UPPER(g.division) = $1
        WHERE b.budget_year = $2 AND b.budget_type = 'SALES_REP'
          AND COALESCE(b.data_source, 'SALES_REP_IMPORT') = 'BULK_IMPORT'
        GROUP BY COALESCE(g.id, 0), COALESCE(g.group_name, 'Unassigned')
      )
      SELECT 
        sg.id as group_id,
        sg.group_name,
        COUNT(DISTINCT m.id) as member_count,
        COALESCE(ga.total_actual_kgs, 0) as total_actual_kgs,
        COALESCE(gs.total_submitted_kgs, 0) as total_submitted_kgs,
        al.total_allocated_kgs,
        al.total_allocated_amount,
        COALESCE(al.status, 'pending') as status,
        al.submitted_at
      FROM sales_rep_groups sg
      LEFT JOIN sales_rep_group_members m ON m.group_id = sg.id
      LEFT JOIN group_actuals ga ON ga.group_id = sg.id
      LEFT JOIN group_submitted gs ON gs.group_id = sg.id
      LEFT JOIN group_allocations al ON al.sales_rep_group_id = sg.id
      WHERE UPPER(sg.division) = $1 AND sg.is_active = true
      GROUP BY sg.id, sg.group_name, ga.total_actual_kgs, gs.total_submitted_kgs, 
               al.total_allocated_kgs, al.total_allocated_amount, al.status, al.submitted_at
      ORDER BY sg.group_name
    `, [divisionCode.toUpperCase(), parseInt(budgetYear), prevYear]);
    
    const summary = result.rows.map(r => ({
      group_id: r.group_id,
      group_name: r.group_name,
      member_count: parseInt(r.member_count) || 0,
      total_actual_kgs: parseFloat(r.total_actual_kgs) || 0,
      total_submitted_kgs: parseFloat(r.total_submitted_kgs) || 0,
      total_allocated_kgs: r.total_allocated_kgs ? parseFloat(r.total_allocated_kgs) : null,
      total_allocated_amount: r.total_allocated_amount ? parseFloat(r.total_allocated_amount) : null,
      status: r.status,
      submitted_at: r.submitted_at
    }));
    
    // Calculate totals
    const totals = {
      total_groups: summary.length,
      groups_allocated: summary.filter(s => s.total_allocated_kgs !== null).length,
      groups_approved: summary.filter(s => s.status === 'approved').length,
      total_actual_kgs: summary.reduce((sum, s) => sum + s.total_actual_kgs, 0),
      total_submitted_kgs: summary.reduce((sum, s) => sum + s.total_submitted_kgs, 0),
      total_allocated_kgs: summary.reduce((sum, s) => sum + (s.total_allocated_kgs || 0), 0)
    };
    
    res.json({
      success: true,
      summary,
      totals,
      budgetYear: parseInt(budgetYear),
      prevYear
    });
    
  } catch (error) {
    logger.error('❌ Error getting summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ENDPOINT 5: Delete Draft
// ============================================================================

/**
 * DELETE /api/sales-rep-group-allocation/delete-draft
 * 
 * Deletes a draft allocation for a group
 */
router.delete('/delete-draft', async (req, res) => {
  logger.info('🗑️ Delete draft request:', req.body);
  
  try {
    const {
      divisionCode = 'FP',
      budgetYear = 2026,
      salesRepGroupId
    } = req.body;
    
    if (!salesRepGroupId) {
      return res.status(400).json({
        success: false,
        error: 'salesRepGroupId is required'
      });
    }
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    
    const deleteResult = await divisionPool.query(`
      DELETE FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2 
        AND sales_rep_group_id = $3
        AND budget_status = 'draft'
    `, [divisionCode.toUpperCase(), budgetYear, salesRepGroupId]);
    
    logger.info(`🗑️ Deleted ${deleteResult.rowCount} draft records`);
    
    res.json({
      success: true,
      message: 'Draft deleted',
      recordsDeleted: deleteResult.rowCount
    });
    
  } catch (error) {
    logger.error('❌ Error deleting draft:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// NEW ENDPOINTS: Individual Sales Rep Allocation (not Group)
// ============================================================================

/**
 * GET /api/sales-rep-group-allocation/sales-reps
 * 
 * Returns all distinct sales reps from actualcommon for a division
 */
router.get('/sales-reps', async (req, res) => {
  logger.info('👤 Get sales reps request:', req.query);
  
  try {
    const { divisionCode = 'FP' } = req.query;
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    
    // Get distinct sales reps from actualcommon
    const result = await divisionPool.query(`
      SELECT DISTINCT sales_rep_name 
      FROM ${tables.actualcommon}
      WHERE sales_rep_name IS NOT NULL 
        AND sales_rep_name != ''
      ORDER BY sales_rep_name
    `);
    
    logger.info(`✅ Found ${result.rows.length} sales reps for ${divisionCode}`);
    
    res.json({
      success: true,
      salesReps: result.rows.map(r => r.sales_rep_name)
    });
    
  } catch (error) {
    logger.error('❌ Error getting sales reps:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sales-rep-group-allocation/load-rep-data
 * 
 * Load allocation data for an individual sales rep
 * Returns ALL product groups with actual, div budget, rep submitted, and management allocation
 */
router.post('/load-rep-data', async (req, res) => {
  logger.info('📊 Load rep allocation data request:', req.body);
  
  try {
    const { 
      divisionCode = 'FP', 
      salesRepName,
      actualYear,
      divBudgetYear,
      repBudgetYear
    } = req.body;
    
    if (!salesRepName) {
      return res.status(400).json({
        success: false,
        error: 'salesRepName is required'
      });
    }
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    
    // 1. Get ALL product groups from pricing table
    const allPGsResult = await divisionPool.query(`
      SELECT DISTINCT product_group as pgcombine 
      FROM ${tables.pricingRounding}
      WHERE UPPER(division) = $1
        AND UPPER(TRIM(product_group)) != 'SERVICES CHARGES'
      ORDER BY product_group
    `, [divisionCode.toUpperCase()]);
    
    const allPGs = allPGsResult.rows.map(r => r.pgcombine);
    logger.info(`📋 Found ${allPGs.length} product groups`);
    
    // 2. Get actual sales for this rep (selected actual year)
    const actualsResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as actual_kgs
      FROM ${tables.actualcommon}
      WHERE year = $1 AND sales_rep_name = $2
      GROUP BY pgcombine
    `, [actualYear, salesRepName]);
    
    const actualsMap = {};
    actualsResult.rows.forEach(r => {
      actualsMap[r.pgcombine] = parseFloat(r.actual_kgs) || 0;
    });
    
    // 3. Get divisional budget (from budget_unified with budget_type = 'DIVISIONAL')
    const divBudgetResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as div_budget_kgs
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1 
        AND budget_type = 'DIVISIONAL'
      GROUP BY pgcombine
    `, [divBudgetYear]);
    
    const divBudgetMap = {};
    divBudgetResult.rows.forEach(r => {
      divBudgetMap[r.pgcombine] = parseFloat(r.div_budget_kgs) || 0;
    });
    
    // 4. Get rep's submitted budget (from budget_unified with budget_type = 'SALES_REP')
    const repSubmittedResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as rep_submitted_kgs
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1 
        AND budget_type = 'SALES_REP'
        AND sales_rep_name = $2
      GROUP BY pgcombine
    `, [repBudgetYear, salesRepName]);
    
    const repSubmittedMap = {};
    repSubmittedResult.rows.forEach(r => {
      repSubmittedMap[r.pgcombine] = parseFloat(r.rep_submitted_kgs) || 0;
    });
    
    // 5. Get management allocated (if exists)
    const mgmtAllocResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as management_allocated_kgs,
        MAX(budget_status) as status
      FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2 
        AND sales_rep_group_name = $3
      GROUP BY pgcombine
    `, [divisionCode.toUpperCase(), repBudgetYear, salesRepName]);
    
    const mgmtAllocMap = {};
    let allocationStatus = null;
    mgmtAllocResult.rows.forEach(r => {
      mgmtAllocMap[r.pgcombine] = parseFloat(r.management_allocated_kgs) || 0;
      allocationStatus = r.status;
    });
    
    // 6. Combine into product groups array
    const productGroups = allPGs.map(pg => ({
      pgcombine: pg,
      actual_kgs: actualsMap[pg] || 0,
      div_budget_kgs: divBudgetMap[pg] || 0,
      rep_submitted_kgs: repSubmittedMap[pg] || 0,
      management_allocated_kgs: mgmtAllocMap[pg] || null
    }));
    
    res.json({
      success: true,
      data: {
        salesRepName,
        actualYear,
        divBudgetYear,
        repBudgetYear,
        allocationStatus,
        productGroups
      }
    });
    
  } catch (error) {
    logger.error('❌ Error loading rep data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sales-rep-group-allocation/save-rep-draft
 * 
 * Save draft allocation for an individual sales rep
 */
router.post('/save-rep-draft', async (req, res) => {
  logger.info('💾 Save rep draft allocation request:', req.body);
  
  try {
    const {
      divisionCode = 'FP',
      divisionName = 'Flexible Packaging',
      salesRepName,
      budgetYear,
      allocations
    } = req.body;
    
    if (!salesRepName || !allocations || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'salesRepName and allocations are required'
      });
    }
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    
    // Delete existing draft for this rep
    await divisionPool.query(`
      DELETE FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2 
        AND sales_rep_group_name = $3
        AND budget_status = 'draft'
    `, [divisionCode.toUpperCase(), budgetYear, salesRepName]);
    
    // Insert new allocations
    let recordsSaved = 0;
    for (const alloc of allocations) {
      if (alloc.kgs > 0) {
        // Equal monthly distribution
        const monthlyKgs = Math.round(alloc.kgs / 12);
        
        for (let month = 1; month <= 12; month++) {
          await divisionPool.query(`
            INSERT INTO ${tables.allocation} (
              division_code, division_name, budget_year, month_no, month_name,
              sales_rep_group_id, sales_rep_group_name, pgcombine,
              qty_kgs, amount, morm, budget_status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          `, [
            divisionCode.toUpperCase(),
            divisionName,
            budgetYear,
            month,
            MONTH_NAMES[month],
            0, // No group ID for individual rep
            salesRepName,
            alloc.pgcombine,
            monthlyKgs,
            0, // Amount calculated later
            0, // MoRM calculated later
            'draft'
          ]);
          recordsSaved++;
        }
      }
    }
    
    logger.info(`💾 Saved ${recordsSaved} draft records for ${salesRepName}`);
    
    res.json({
      success: true,
      message: 'Draft saved',
      recordsSaved
    });
    
  } catch (error) {
    logger.error('❌ Error saving rep draft:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sales-rep-group-allocation/submit-rep-final
 * 
 * Submit final allocation for an individual sales rep
 */
router.post('/submit-rep-final', async (req, res) => {
  logger.info('✅ Submit rep final allocation request:', req.body);
  
  try {
    const {
      divisionCode = 'FP',
      divisionName = 'Flexible Packaging',
      salesRepName,
      budgetYear,
      allocations,
      approvedBy = 'Management'
    } = req.body;
    
    if (!salesRepName || !allocations || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'salesRepName and allocations are required'
      });
    }
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    
    // Delete existing records for this rep (draft or approved)
    await divisionPool.query(`
      DELETE FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2 
        AND sales_rep_group_name = $3
    `, [divisionCode.toUpperCase(), budgetYear, salesRepName]);
    
    // Insert approved allocations
    let recordsSaved = 0;
    for (const alloc of allocations) {
      if (alloc.kgs > 0) {
        const monthlyKgs = Math.round(alloc.kgs / 12);
        
        for (let month = 1; month <= 12; month++) {
          await divisionPool.query(`
            INSERT INTO ${tables.allocation} (
              division_code, division_name, budget_year, month_no, month_name,
              sales_rep_group_id, sales_rep_group_name, pgcombine,
              qty_kgs, amount, morm, budget_status, approved_by, submitted_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
          `, [
            divisionCode.toUpperCase(),
            divisionName,
            budgetYear,
            month,
            MONTH_NAMES[month],
            0,
            salesRepName,
            alloc.pgcombine,
            monthlyKgs,
            0,
            0,
            'approved',
            approvedBy
          ]);
          recordsSaved++;
        }
      }
    }
    
    logger.info(`✅ Approved ${recordsSaved} records for ${salesRepName}`);
    
    res.json({
      success: true,
      message: 'Budget approved',
      recordsSaved
    });
    
  } catch (error) {
    logger.error('❌ Error submitting rep final:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ENDPOINT: Export HTML Budget Form for Sales Rep
// ============================================================================

/**
 * GET /api/sales-rep-group-allocation/export-html
 * 
 * Exports an HTML budget form for a SALES REP GROUP with:
 * - Management Allocation targets per product group (shown at top)
 * - Combined actual data from previous year for ALL members in the group
 * - Budget rows below each customer (yellow cells for editing)
 * - Charts and summary tables
 * - Same full format as regular Sales Rep HTML Export
 * 
 * @query divisionCode - Division (FP only)
 * @query groupId - Sales rep group ID
 * @query groupName - Sales rep group name (for display)
 * @query budgetYear - Budget year
 * @query actualYear - Actual year for reference
 */
router.get('/export-html', async (req, res) => {
  logger.info('📤 Export HTML budget form request:', req.query);
  
  try {
    const { divisionCode = 'FP', groupId, groupName, budgetYear = 2026, actualYear } = req.query;
    
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'groupId is required' });
    }
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    const prevYear = actualYear ? parseInt(actualYear) : parseInt(budgetYear) - 1;
    
    // 1. Get all members in this group
    const membersResult = await divisionPool.query(`
      SELECT g.id, g.group_name, ARRAY_AGG(m.member_name) as members
      FROM sales_rep_groups g
      JOIN sales_rep_group_members m ON m.group_id = g.id
      WHERE g.id = $1 AND UPPER(g.division) = $2
      GROUP BY g.id, g.group_name
    `, [parseInt(groupId), divisionCode.toUpperCase()]);
    
    if (membersResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    const groupInfo = membersResult.rows[0];
    const groupMembers = groupInfo.members || [];
    const displayGroupName = groupName || groupInfo.group_name || 'Unknown Group';
    
    logger.info(`📤 Exporting HTML for group "${displayGroupName}" with ${groupMembers.length} members: ${groupMembers.join(', ')}`);
    
    // 2. Get Management Allocation targets for this group (in KGS)
    let allocationTargets = {};
    const allocResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as allocated_kgs
      FROM ${tables.allocation}
      WHERE division_code = $1 AND budget_year = $2 AND sales_rep_group_id = $3
      GROUP BY pgcombine
    `, [divisionCode.toUpperCase(), parseInt(budgetYear), parseInt(groupId)]);
      
    allocResult.rows.forEach(r => {
      allocationTargets[r.pgcombine] = parseFloat(r.allocated_kgs) || 0;
    });
    
    // If no allocation from allocation table, check BULK_IMPORT in budget_unified for any group member
    if (Object.keys(allocationTargets).length === 0 && groupMembers.length > 0) {
      const bulkResult = await divisionPool.query(`
        SELECT 
          pgcombine,
          SUM(qty_kgs) as allocated_kgs
        FROM ${tables.budgetUnified}
        WHERE UPPER(sales_rep_name) = ANY($1::text[])
          AND budget_year = $2
          AND is_budget = true
          AND data_source = 'BULK_IMPORT'
        GROUP BY pgcombine
      `, [groupMembers.map(m => m.toUpperCase()), parseInt(budgetYear)]);
      
      bulkResult.rows.forEach(r => {
        allocationTargets[r.pgcombine] = parseFloat(r.allocated_kgs) || 0;
      });
    }
    
    // 3. Get actual sales data for ALL group members combined (customer-level detail)
    const actualQuery = `
      SELECT
        TRIM(d.customer_name) as customer,
        TRIM(d.country) as country,
        d.pgcombine as productgroup,
        d.month_no as month,
        SUM(d.qty_kgs) / 1000.0 as mt_value,
        SUM(d.amount) as amount_value,
        SUM(d.morm) as morm_value
      FROM ${tables.actualcommon} d
      WHERE UPPER(d.admin_division_code) = UPPER($1)
        AND d.year = $2
        AND UPPER(TRIM(d.sales_rep_name)) = ANY($3::text[])
        AND d.customer_name IS NOT NULL AND TRIM(d.customer_name) != ''
        AND d.country IS NOT NULL AND TRIM(d.country) != ''
        AND d.pgcombine IS NOT NULL AND TRIM(d.pgcombine) != ''
        AND UPPER(TRIM(d.pgcombine)) != 'SERVICES CHARGES'
      GROUP BY TRIM(d.customer_name), TRIM(d.country), d.pgcombine, d.month_no
      ORDER BY TRIM(d.customer_name), TRIM(d.country), d.pgcombine, d.month_no
    `;
    
    const actualResult = await divisionPool.query(actualQuery, [
      divisionCode.toUpperCase(), 
      prevYear, 
      groupMembers.map(m => m.toUpperCase().trim())
    ]);
    
    // Transform to tableData format
    const customerMap = {};
    actualResult.rows.forEach(row => {
      const key = `${row.customer}|${row.country}|${row.productgroup}`;
      if (!customerMap[key]) {
        customerMap[key] = {
          customer: row.customer,
          country: row.country,
          productGroup: row.productgroup,
          monthlyActual: {},
          monthlyActualAmount: {},
          monthlyActualMorm: {},
        };
      }
      customerMap[key].monthlyActual[row.month] = (customerMap[key].monthlyActual[row.month] || 0) + (parseFloat(row.mt_value) || 0);
      customerMap[key].monthlyActualAmount[row.month] = (customerMap[key].monthlyActualAmount[row.month] || 0) + (parseFloat(row.amount_value) || 0);
      customerMap[key].monthlyActualMorm[row.month] = (customerMap[key].monthlyActualMorm[row.month] || 0) + (parseFloat(row.morm_value) || 0);
    });
    
    const tableData = Object.values(customerMap).map(item => {
      const monthlyActual = {};
      const monthlyActualAmount = {};
      const monthlyActualMorm = {};
      for (let month = 1; month <= 12; month++) {
        monthlyActual[month] = item.monthlyActual[month] || 0;
        monthlyActualAmount[month] = item.monthlyActualAmount[month] || 0;
        monthlyActualMorm[month] = item.monthlyActualMorm[month] || 0;
      }
      return {
        ...item,
        monthlyActual,
        monthlyActualAmount,
        monthlyActualMorm
      };
    });
    
    // 4. Get unique customers for dropdown
    const mergedCustomers = [...new Set(tableData.map(r => r.customer))].sort();
    
    // 5. Get all countries from master_countries database table (same as Master Data Management)
    let countries = [];
    try {
      const countriesResult = await authPool.query(`
        SELECT country_name 
        FROM master_countries 
        WHERE is_active = true 
        ORDER BY country_name
      `);
      countries = countriesResult.rows.map(r => r.country_name);
      logger.info(`[export-html] Loaded ${countries.length} countries from master_countries database`);
    } catch (dbError) {
      logger.warn(`[export-html] Could not load from master_countries, using fallback: ${dbError.message}`);
      // Fallback to WorldCountriesService if database query fails
      const WorldCountriesService = require('../database/WorldCountriesService');
      const worldService = new WorldCountriesService(divisionCode);
      const worldDB = worldService.getWorldCountriesDatabase();
      
      const countryMap = new Map();
      Object.entries(worldDB).forEach(([name, data]) => {
        const nameUpper = name.toUpperCase().trim();
        if (name.length <= 3 && name === name.toUpperCase()) return;
        
        const normalized = name.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        
        if (!countryMap.has(normalized.toLowerCase())) {
          countryMap.set(normalized.toLowerCase(), normalized);
        }
      });
      countries = [...countryMap.values()].sort();
    }
    
    // 6. Get product groups from actualcommon (same as live table) with exclusions applied
    // This ensures consistency between Management Allocation HTML export and Sales Rep Budget live table
    const pgResult = await divisionPool.query(`
      SELECT DISTINCT a.pgcombine as product_group
      FROM ${tables.actualcommon} a
      LEFT JOIN ${tables.productGroupExclusions} e
        ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = UPPER($1)
      WHERE UPPER(a.admin_division_code) = UPPER($1)
        AND a.pgcombine IS NOT NULL
        AND TRIM(a.pgcombine) != ''
        AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'
        AND e.product_group IS NULL
      ORDER BY a.pgcombine
    `, [divisionCode.toUpperCase()]);
    const productGroups = pgResult.rows.map(r => r.product_group).filter(pg => pg);
    logger.info(`[export-html] Loaded ${productGroups.length} product groups from ${tables.actualcommon} with exclusions`);
    
    // 7. Get pricing data
    const pricingResult = await divisionPool.query(`
      SELECT 
        LOWER(TRIM(product_group)) as product_group,
        COALESCE(asp_round, 0) as selling_price,
        COALESCE(morm_round, 0) as morm
      FROM ${tables.pricingRounding}
      WHERE UPPER(division) = UPPER($1)
        AND year = $2
        AND product_group IS NOT NULL
        AND TRIM(product_group) != ''
    `, [divisionCode.toUpperCase(), prevYear]);
    
    const pricingData = {};
    pricingResult.rows.forEach(row => {
      pricingData[row.product_group] = {
        sellingPrice: parseFloat(row.selling_price) || 0,
        morm: parseFloat(row.morm) || 0
      };
    });
    
    // 8. Generate HTML using the existing full-featured export utility
    const { generateSalesRepHtmlExport } = require('../utils/salesRepHtmlExport');
    
    const htmlContent = await generateSalesRepHtmlExport({
      division: divisionCode,
      actualYear: prevYear,
      salesRep: displayGroupName, // Use group name for display
      tableData,
      customRowsData: [],
      budgetData: {}, // No pre-filled budget - group will fill
      mergedCustomers,
      countries,
      productGroups,
      pricingData,
      currency: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
      // Management Allocation specific data
      allocationTargets,
      groupName: displayGroupName,
      groupMembers // Pass group members for info display
    });
    
    // Set headers for file download
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Budget_${divisionCode}_GROUP_${displayGroupName.replace(/[^a-zA-Z0-9]/g, '_')}_${budgetYear}_${dateStr}.html`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(htmlContent);
    
  } catch (error) {
    logger.error('❌ Error exporting HTML:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// NEW ENDPOINT: Management Allocation Report Data (JSON for live view)
// ============================================================================

/**
 * GET /api/sales-rep-group-allocation/management-allocation-report-data
 * 
 * Returns JSON data for the Management Allocation Report live view
 * Same data structure as HTML export but as JSON for React rendering
 * 
 * @query divisionCode - Division (FP only)
 * @query budgetYear - Budget year
 * @query actualYear - Actual year for reference
 */
router.get('/management-allocation-report-data', async (req, res) => {
  logger.info('📊 Fetching Management Allocation Report Data:', req.query);
  
  try {
    const { divisionCode = 'FP', budgetYear = 2026, actualYear } = req.query;
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    const prevYear = actualYear ? parseInt(actualYear) : parseInt(budgetYear) - 1;
    
    // Ensure allocation table exists
    await ensureAllocationTableExists(divisionPool, divisionCode);
    
    // 1. Get all groups with their members
    const groupsResult = await divisionPool.query(`
      SELECT 
        g.id,
        g.group_name,
        ARRAY_AGG(m.member_name ORDER BY m.member_name) FILTER (WHERE m.member_name IS NOT NULL) as members
      FROM sales_rep_groups g
      LEFT JOIN sales_rep_group_members m ON m.group_id = g.id
      WHERE UPPER(g.division) = $1 AND g.is_active = true
      GROUP BY g.id, g.group_name
      ORDER BY g.group_name
    `, [divisionCode.toUpperCase()]);
    
    const groups = groupsResult.rows;
    const allMembers = [];
    const allSearchNames = [];
    const groupMembersMap = {};
    groups.forEach(g => {
      groupMembersMap[g.id] = g.members || [];
      if (g.members) {
        allMembers.push(...g.members);
        allSearchNames.push(...g.members);
      }
      allSearchNames.push(g.group_name);
    });
    
    // 2. Get actuals aggregated (ALL sales reps)
    const actualsResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as actual_kgs
      FROM ${tables.actualcommon}
      WHERE year = $1 
        AND UPPER(admin_division_code) = UPPER($2)
        AND UPPER(TRIM(sales_rep_name)) = ANY($3::text[])
      GROUP BY pgcombine
      ORDER BY pgcombine
    `, [prevYear, divisionCode, allMembers.map(m => m.toUpperCase().trim())]);
    
    const actualsMap = {};
    actualsResult.rows.forEach(r => {
      actualsMap[r.pgcombine] = parseFloat(r.actual_kgs) || 0;
    });
    
    // 2b. Get actuals PER GROUP
    const actualsPerGroupResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        UPPER(TRIM(sales_rep_name)) as sales_rep_name,
        SUM(qty_kgs) as actual_kgs
      FROM ${tables.actualcommon}
      WHERE year = $1 
        AND UPPER(admin_division_code) = UPPER($2)
        AND UPPER(TRIM(sales_rep_name)) = ANY($3::text[])
      GROUP BY pgcombine, UPPER(TRIM(sales_rep_name))
    `, [prevYear, divisionCode, allMembers.map(m => m.toUpperCase().trim())]);
    
    const actualsPerGroupMap = {};
    actualsPerGroupResult.rows.forEach(r => {
      const pgName = r.pgcombine;
      const repName = r.sales_rep_name;
      for (const g of groups) {
        if (g.members && g.members.some(m => m.toUpperCase().trim() === repName)) {
          if (!actualsPerGroupMap[pgName]) actualsPerGroupMap[pgName] = {};
          actualsPerGroupMap[pgName][g.id] = (actualsPerGroupMap[pgName][g.id] || 0) + (parseFloat(r.actual_kgs) || 0);
          break;
        }
      }
    });
    
    // 3. Get ALL submitted budgets aggregated
    const submittedResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as submitted_kgs
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1 
        AND budget_type = 'SALES_REP'
        AND UPPER(TRIM(sales_rep_name)) = ANY($2::text[])
      GROUP BY pgcombine
    `, [parseInt(budgetYear), allSearchNames.map(m => m.toUpperCase().trim())]);
    
    const submittedMap = {};
    submittedResult.rows.forEach(r => {
      submittedMap[r.pgcombine] = parseFloat(r.submitted_kgs) || 0;
    });
    
    // 3b. Get submitted PER GROUP
    const submittedPerGroupResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        UPPER(TRIM(sales_rep_name)) as sales_rep_name,
        SUM(qty_kgs) as submitted_kgs
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1 
        AND budget_type = 'SALES_REP'
        AND UPPER(TRIM(sales_rep_name)) = ANY($2::text[])
      GROUP BY pgcombine, UPPER(TRIM(sales_rep_name))
    `, [parseInt(budgetYear), allSearchNames.map(m => m.toUpperCase().trim())]);
    
    const submittedPerGroupMap = {};
    submittedPerGroupResult.rows.forEach(r => {
      const pgName = r.pgcombine;
      const repName = r.sales_rep_name;
      for (const g of groups) {
        const isGroupMatch = g.group_name.toUpperCase().trim() === repName;
        const isMemberMatch = g.members && g.members.some(m => m.toUpperCase().trim() === repName);
        if (isGroupMatch || isMemberMatch) {
          if (!submittedPerGroupMap[pgName]) submittedPerGroupMap[pgName] = {};
          submittedPerGroupMap[pgName][g.id] = (submittedPerGroupMap[pgName][g.id] || 0) + (parseFloat(r.submitted_kgs) || 0);
          break;
        }
      }
    });
    
    // 4. Get ALL management allocations aggregated
    const allocationsResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as allocated_kgs
      FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2
      GROUP BY pgcombine
    `, [divisionCode.toUpperCase(), parseInt(budgetYear)]);
    
    const allocatedMap = {};
    allocationsResult.rows.forEach(r => {
      allocatedMap[r.pgcombine] = parseFloat(r.allocated_kgs) || 0;
    });
    
    // 4b. Get allocations PER GROUP
    const allocationsPerGroupResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        sales_rep_group_id,
        SUM(qty_kgs) as allocated_kgs
      FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2
      GROUP BY pgcombine, sales_rep_group_id
    `, [divisionCode.toUpperCase(), parseInt(budgetYear)]);
    
    const allocatedPerGroupMap = {};
    allocationsPerGroupResult.rows.forEach(r => {
      const pgName = r.pgcombine;
      const groupId = r.sales_rep_group_id;
      if (!allocatedPerGroupMap[pgName]) allocatedPerGroupMap[pgName] = {};
      allocatedPerGroupMap[pgName][groupId] = parseFloat(r.allocated_kgs) || 0;
    });
    
    // 5. Get Divisional Budget data
    const divBudgetResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as budget_kgs
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1 
        AND UPPER(division_code) = UPPER($2)
        AND budget_type = 'DIVISION'
        AND is_budget = true
      GROUP BY pgcombine
    `, [parseInt(budgetYear), divisionCode]);
    
    const divBudgetMap = {};
    divBudgetResult.rows.forEach(r => {
      divBudgetMap[r.pgcombine] = parseFloat(r.budget_kgs) || 0;
    });
    
    // 6. Get all product groups from pricing
    const allPGs = await divisionPool.query(`
      SELECT DISTINCT product_group as pgcombine 
      FROM ${tables.pricingRounding}
      WHERE year = $1 AND UPPER(division) = $2
        AND UPPER(TRIM(product_group)) NOT IN ('SERVICES CHARGES', 'SERVICE CHARGES')
        AND product_group NOT IN (
          SELECT product_group FROM ${tables.productGroupExclusions}
          WHERE UPPER(division_code) = $2
        )
      ORDER BY product_group
    `, [prevYear, divisionCode.toUpperCase()]);
    
    // 7. Combine into product groups array with per-group breakdown
    const productGroups = allPGs.rows.map(pg => {
      const pgName = pg.pgcombine;
      
      const groupBreakdown = groups.map(g => ({
        groupId: g.id,
        groupName: g.group_name,
        members: g.members || [],
        actual_kgs: actualsPerGroupMap[pgName]?.[g.id] || 0,
        submitted_kgs: submittedPerGroupMap[pgName]?.[g.id] || 0,
        allocated_kgs: allocatedPerGroupMap[pgName]?.[g.id] || 0
      }));
      
      return {
        pgcombine: pgName,
        actual_kgs: actualsMap[pgName] || 0,
        div_budget_kgs: divBudgetMap[pgName] || 0,
        submitted_kgs: submittedMap[pgName] || 0,
        allocated_kgs: allocatedMap[pgName] || 0,
        groupBreakdown
      };
    });
    
    // 8. Calculate totals
    const totals = {
      actualKgs: productGroups.reduce((sum, pg) => sum + (pg.actual_kgs || 0), 0),
      divBudgetKgs: productGroups.reduce((sum, pg) => sum + (pg.div_budget_kgs || 0), 0),
      submittedKgs: productGroups.reduce((sum, pg) => sum + (pg.submitted_kgs || 0), 0),
      allocatedKgs: productGroups.reduce((sum, pg) => sum + (pg.allocated_kgs || 0), 0)
    };
    totals.remainingKgs = totals.divBudgetKgs - totals.allocatedKgs;
    
    // Return JSON response
    res.json({
      success: true,
      data: {
        division: divisionCode,
        divisionName: divisionCode,
        actualYear: prevYear,
        budgetYear: parseInt(budgetYear),
        productGroups,
        totals,
        groups: groups.map(g => ({ id: g.id, name: g.group_name, members: g.members || [] })),
        generatedAt: new Date().toISOString()
      }
    });
    
    logger.info(`✅ Returned Management Allocation Report Data: ${productGroups.length} PGs, ${groups.length} groups`);
    
  } catch (error) {
    logger.error('❌ Error fetching Management Allocation Report Data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// NEW ENDPOINT: Export Management Allocation Report (PG-focused, no customers)
// ============================================================================

/**
 * GET /api/sales-rep-group-allocation/export-management-allocation-html
 * 
 * Exports a comprehensive HTML report for Management Allocation showing:
 * - Product Groups with actual vs budget comparisons
 * - Sales Rep breakdown per product group
 * - Interactive charts (ECharts)
 * - No customer-level details
 * 
 * @query divisionCode - Division (FP only)
 * @query budgetYear - Budget year
 * @query actualYear - Actual year for reference
 */
router.get('/export-management-allocation-html', async (req, res) => {
  logger.info('📤 Export Management Allocation HTML report:', req.query);
  
  try {
    const { divisionCode = 'FP', budgetYear = 2026, actualYear } = req.query;
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    const prevYear = actualYear ? parseInt(actualYear) : parseInt(budgetYear) - 1;
    
    // Ensure allocation table exists
    await ensureAllocationTableExists(divisionPool, divisionCode);
    
    // 1. Get all groups with their members
    const groupsResult = await divisionPool.query(`
      SELECT 
        g.id,
        g.group_name,
        ARRAY_AGG(m.member_name ORDER BY m.member_name) FILTER (WHERE m.member_name IS NOT NULL) as members
      FROM sales_rep_groups g
      LEFT JOIN sales_rep_group_members m ON m.group_id = g.id
      WHERE UPPER(g.division) = $1 AND g.is_active = true
      GROUP BY g.id, g.group_name
      ORDER BY g.group_name
    `, [divisionCode.toUpperCase()]);
    
    const groups = groupsResult.rows;
    const allMembers = [];
    const allSearchNames = [];
    const groupMembersMap = {};
    groups.forEach(g => {
      groupMembersMap[g.id] = g.members || [];
      if (g.members) {
        allMembers.push(...g.members);
        allSearchNames.push(...g.members);
      }
      allSearchNames.push(g.group_name);
    });
    
    logger.info(`📋 Found ${groups.length} groups with ${allMembers.length} total members`);
    
    // 2. Get actuals aggregated (ALL sales reps)
    const actualsResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as actual_kgs
      FROM ${tables.actualcommon}
      WHERE year = $1 
        AND UPPER(admin_division_code) = UPPER($2)
        AND UPPER(TRIM(sales_rep_name)) = ANY($3::text[])
      GROUP BY pgcombine
      ORDER BY pgcombine
    `, [prevYear, divisionCode, allMembers.map(m => m.toUpperCase().trim())]);
    
    const actualsMap = {};
    actualsResult.rows.forEach(r => {
      actualsMap[r.pgcombine] = parseFloat(r.actual_kgs) || 0;
    });
    
    // 2b. Get actuals PER GROUP (for breakdown)
    const actualsPerGroupResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        UPPER(TRIM(sales_rep_name)) as sales_rep_name,
        SUM(qty_kgs) as actual_kgs
      FROM ${tables.actualcommon}
      WHERE year = $1 
        AND UPPER(admin_division_code) = UPPER($2)
        AND UPPER(TRIM(sales_rep_name)) = ANY($3::text[])
      GROUP BY pgcombine, UPPER(TRIM(sales_rep_name))
    `, [prevYear, divisionCode, allMembers.map(m => m.toUpperCase().trim())]);
    
    const actualsPerGroupMap = {};
    actualsPerGroupResult.rows.forEach(r => {
      const pgName = r.pgcombine;
      const repName = r.sales_rep_name;
      for (const g of groups) {
        if (g.members && g.members.some(m => m.toUpperCase().trim() === repName)) {
          if (!actualsPerGroupMap[pgName]) actualsPerGroupMap[pgName] = {};
          actualsPerGroupMap[pgName][g.id] = (actualsPerGroupMap[pgName][g.id] || 0) + (parseFloat(r.actual_kgs) || 0);
          break;
        }
      }
    });
    
    // 3. Get ALL submitted budgets aggregated
    const submittedResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as submitted_kgs
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1 
        AND budget_type = 'SALES_REP'
        AND UPPER(TRIM(sales_rep_name)) = ANY($2::text[])
      GROUP BY pgcombine
    `, [parseInt(budgetYear), allSearchNames.map(m => m.toUpperCase().trim())]);
    
    const submittedMap = {};
    submittedResult.rows.forEach(r => {
      submittedMap[r.pgcombine] = parseFloat(r.submitted_kgs) || 0;
    });
    
    // 3b. Get submitted PER GROUP
    const submittedPerGroupResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        UPPER(TRIM(sales_rep_name)) as sales_rep_name,
        SUM(qty_kgs) as submitted_kgs
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1 
        AND budget_type = 'SALES_REP'
        AND UPPER(TRIM(sales_rep_name)) = ANY($2::text[])
      GROUP BY pgcombine, UPPER(TRIM(sales_rep_name))
    `, [parseInt(budgetYear), allSearchNames.map(m => m.toUpperCase().trim())]);
    
    const submittedPerGroupMap = {};
    submittedPerGroupResult.rows.forEach(r => {
      const pgName = r.pgcombine;
      const repName = r.sales_rep_name;
      for (const g of groups) {
        const isGroupMatch = g.group_name.toUpperCase().trim() === repName;
        const isMemberMatch = g.members && g.members.some(m => m.toUpperCase().trim() === repName);
        if (isGroupMatch || isMemberMatch) {
          if (!submittedPerGroupMap[pgName]) submittedPerGroupMap[pgName] = {};
          submittedPerGroupMap[pgName][g.id] = (submittedPerGroupMap[pgName][g.id] || 0) + (parseFloat(r.submitted_kgs) || 0);
          break;
        }
      }
    });
    
    // 4. Get ALL management allocations aggregated
    const allocationsResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as allocated_kgs
      FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2
      GROUP BY pgcombine
    `, [divisionCode.toUpperCase(), parseInt(budgetYear)]);
    
    const allocatedMap = {};
    allocationsResult.rows.forEach(r => {
      allocatedMap[r.pgcombine] = parseFloat(r.allocated_kgs) || 0;
    });
    
    // 4b. Get allocations PER GROUP
    const allocationsPerGroupResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        sales_rep_group_id,
        SUM(qty_kgs) as allocated_kgs
      FROM ${tables.allocation}
      WHERE division_code = $1 
        AND budget_year = $2
      GROUP BY pgcombine, sales_rep_group_id
    `, [divisionCode.toUpperCase(), parseInt(budgetYear)]);
    
    const allocatedPerGroupMap = {};
    allocationsPerGroupResult.rows.forEach(r => {
      const pgName = r.pgcombine;
      const groupId = r.sales_rep_group_id;
      if (!allocatedPerGroupMap[pgName]) allocatedPerGroupMap[pgName] = {};
      allocatedPerGroupMap[pgName][groupId] = parseFloat(r.allocated_kgs) || 0;
    });
    
    // 5. Get Divisional Budget data
    const divBudgetResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as budget_kgs
      FROM ${tables.budgetUnified}
      WHERE budget_year = $1 
        AND UPPER(division_code) = UPPER($2)
        AND budget_type = 'DIVISION'
        AND is_budget = true
      GROUP BY pgcombine
    `, [parseInt(budgetYear), divisionCode]);
    
    const divBudgetMap = {};
    divBudgetResult.rows.forEach(r => {
      divBudgetMap[r.pgcombine] = parseFloat(r.budget_kgs) || 0;
    });
    
    // 6. Get all product groups from pricing
    const allPGs = await divisionPool.query(`
      SELECT DISTINCT product_group as pgcombine 
      FROM ${tables.pricingRounding}
      WHERE year = $1 AND UPPER(division) = $2
        AND UPPER(TRIM(product_group)) NOT IN ('SERVICES CHARGES', 'SERVICE CHARGES')
        AND product_group NOT IN (
          SELECT product_group FROM ${tables.productGroupExclusions}
          WHERE UPPER(division_code) = $2
        )
      ORDER BY product_group
    `, [prevYear, divisionCode.toUpperCase()]);
    
    // 7. Combine into product groups array with per-group breakdown
    const productGroups = allPGs.rows.map(pg => {
      const pgName = pg.pgcombine;
      
      const groupBreakdown = groups.map(g => ({
        groupId: g.id,
        groupName: g.group_name,
        members: g.members || [],
        actual_kgs: actualsPerGroupMap[pgName]?.[g.id] || 0,
        submitted_kgs: submittedPerGroupMap[pgName]?.[g.id] || 0,
        allocated_kgs: allocatedPerGroupMap[pgName]?.[g.id] || 0
      }));
      
      return {
        pgcombine: pgName,
        actual_kgs: actualsMap[pgName] || 0,
        div_budget_kgs: divBudgetMap[pgName] || 0,
        submitted_kgs: submittedMap[pgName] || 0,
        allocated_kgs: allocatedMap[pgName] || 0,
        groupBreakdown
      };
    });
    
    // 8. Calculate totals
    const totals = {
      actualKgs: productGroups.reduce((sum, pg) => sum + (pg.actual_kgs || 0), 0),
      divBudgetKgs: productGroups.reduce((sum, pg) => sum + (pg.div_budget_kgs || 0), 0),
      submittedKgs: productGroups.reduce((sum, pg) => sum + (pg.submitted_kgs || 0), 0),
      allocatedKgs: productGroups.reduce((sum, pg) => sum + (pg.allocated_kgs || 0), 0)
    };
    totals.remainingKgs = totals.divBudgetKgs - totals.allocatedKgs;
    
    // 9. Generate HTML
    const { generateManagementAllocationHtml } = require('../utils/managementAllocationHtmlExport');
    
    const htmlContent = generateManagementAllocationHtml({
      division: divisionCode,
      divisionName: divisionCode,
      actualYear: prevYear,
      budgetYear: parseInt(budgetYear),
      productGroups,
      totals,
      groups: groups.map(g => ({ id: g.id, name: g.group_name, members: g.members || [] })),
      generatedAt: new Date().toISOString()
    });
    
    // Set headers for file download
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Management_Allocation_${divisionCode}_${budgetYear}_${dateStr}.html`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(htmlContent);
    
    logger.info(`✅ Generated Management Allocation HTML: ${productGroups.length} PGs, ${groups.length} groups`);
    
  } catch (error) {
    logger.error('❌ Error exporting Management Allocation HTML:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================

/**
 * GET /api/sales-rep-group-allocation/export-html-all
 * 
 * Exports an HTML budget summary for ALL GROUPS in a division showing:
 * - Combined actuals from all groups
 * - Total Management Allocation targets per product group
 * - Division-level summary
 * 
 * @query divisionCode - Division (FP only)
 * @query budgetYear - Budget year
 * @query actualYear - Actual year for reference
 */
router.get('/export-html-all', async (req, res) => {
  logger.info('📤 Export HTML for ALL GROUPS request:', req.query);
  
  try {
    const { divisionCode = 'FP', budgetYear = 2026, actualYear } = req.query;
    
    const divisionPool = getPoolForDivision(divisionCode);
    const tables = getTableNames(divisionCode);
    const prevYear = actualYear ? parseInt(actualYear) : parseInt(budgetYear) - 1;
    
    // 1. Get all groups and members for this division
    const groupsResult = await divisionPool.query(`
      SELECT 
        g.id,
        g.group_name,
        ARRAY_AGG(m.member_name) as members
      FROM sales_rep_groups g
      JOIN sales_rep_group_members m ON m.group_id = g.id
      WHERE UPPER(g.division) = $1
      GROUP BY g.id, g.group_name
      ORDER BY g.group_name
    `, [divisionCode.toUpperCase()]);
    
    const allGroups = groupsResult.rows;
    const allMembers = [];
    allGroups.forEach(g => {
      if (g.members) allMembers.push(...g.members);
    });
    
    logger.info(`📤 Exporting HTML for ALL ${allGroups.length} groups with ${allMembers.length} total members`);
    
    // 2. Get Management Allocation totals for ALL groups
    let allocationTargets = {};
    
    // First try allocation table
    const allocResult = await divisionPool.query(`
      SELECT 
        pgcombine,
        SUM(qty_kgs) as allocated_kgs
      FROM ${tables.allocation}
      WHERE division_code = $1 AND budget_year = $2
      GROUP BY pgcombine
    `, [divisionCode.toUpperCase(), parseInt(budgetYear)]);
    
    allocResult.rows.forEach(r => {
      allocationTargets[r.pgcombine] = parseFloat(r.allocated_kgs) || 0;
    });
    
    // If no allocation from allocation table, check BULK_IMPORT
    if (Object.keys(allocationTargets).length === 0 && allMembers.length > 0) {
      const bulkResult = await divisionPool.query(`
        SELECT 
          pgcombine,
          SUM(qty_kgs) as allocated_kgs
        FROM ${tables.budgetUnified}
        WHERE UPPER(sales_rep_name) = ANY($1::text[])
          AND budget_year = $2
          AND is_budget = true
          AND data_source = 'BULK_IMPORT'
        GROUP BY pgcombine
      `, [allMembers.map(m => m.toUpperCase()), parseInt(budgetYear)]);
      
      bulkResult.rows.forEach(r => {
        allocationTargets[r.pgcombine] = parseFloat(r.allocated_kgs) || 0;
      });
    }
    
    // 3. Get actual sales data for ALL group members combined
    const actualQuery = `
      SELECT
        TRIM(d.customer_name) as customer,
        TRIM(d.country) as country,
        d.pgcombine as productgroup,
        d.month_no as month,
        SUM(d.qty_kgs) / 1000.0 as mt_value,
        SUM(d.amount) as amount_value,
        SUM(d.morm) as morm_value
      FROM ${tables.actualcommon} d
      WHERE UPPER(d.admin_division_code) = UPPER($1)
        AND d.year = $2
        AND UPPER(TRIM(d.sales_rep_name)) = ANY($3::text[])
        AND d.customer_name IS NOT NULL AND TRIM(d.customer_name) != ''
        AND d.country IS NOT NULL AND TRIM(d.country) != ''
        AND d.pgcombine IS NOT NULL AND TRIM(d.pgcombine) != ''
        AND UPPER(TRIM(d.pgcombine)) != 'SERVICES CHARGES'
      GROUP BY TRIM(d.customer_name), TRIM(d.country), d.pgcombine, d.month_no
      ORDER BY TRIM(d.customer_name), TRIM(d.country), d.pgcombine, d.month_no
    `;
    
    const actualResult = await divisionPool.query(actualQuery, [
      divisionCode.toUpperCase(), 
      prevYear, 
      allMembers.map(m => m.toUpperCase().trim())
    ]);
    
    // Transform to tableData format
    const customerMap = {};
    actualResult.rows.forEach(row => {
      const key = `${row.customer}|${row.country}|${row.productgroup}`;
      if (!customerMap[key]) {
        customerMap[key] = {
          customer: row.customer,
          country: row.country,
          productGroup: row.productgroup,
          monthlyActual: {},
          monthlyActualAmount: {},
          monthlyActualMorm: {},
        };
      }
      customerMap[key].monthlyActual[row.month] = (customerMap[key].monthlyActual[row.month] || 0) + (parseFloat(row.mt_value) || 0);
      customerMap[key].monthlyActualAmount[row.month] = (customerMap[key].monthlyActualAmount[row.month] || 0) + (parseFloat(row.amount_value) || 0);
      customerMap[key].monthlyActualMorm[row.month] = (customerMap[key].monthlyActualMorm[row.month] || 0) + (parseFloat(row.morm_value) || 0);
    });
    
    const tableData = Object.values(customerMap).map(item => {
      const monthlyActual = {};
      const monthlyActualAmount = {};
      const monthlyActualMorm = {};
      for (let month = 1; month <= 12; month++) {
        monthlyActual[month] = item.monthlyActual[month] || 0;
        monthlyActualAmount[month] = item.monthlyActualAmount[month] || 0;
        monthlyActualMorm[month] = item.monthlyActualMorm[month] || 0;
      }
      return {
        ...item,
        monthlyActual,
        monthlyActualAmount,
        monthlyActualMorm
      };
    });
    
    // 4. Get unique customers
    const mergedCustomers = [...new Set(tableData.map(r => r.customer))].sort();
    
    // 5. Get countries
    let countries = [];
    try {
      const countriesResult = await authPool.query(`
        SELECT country_name 
        FROM master_countries 
        WHERE is_active = true 
        ORDER BY country_name
      `);
      countries = countriesResult.rows.map(r => r.country_name);
    } catch (dbError) {
      logger.warn(`[export-html-all] Could not load countries: ${dbError.message}`);
      countries = [];
    }
    
    // 6. Get product groups with exclusions
    const pgResult = await divisionPool.query(`
      SELECT DISTINCT a.pgcombine as product_group
      FROM ${tables.actualcommon} a
      LEFT JOIN ${tables.productGroupExclusions} e
        ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = UPPER($1)
      WHERE UPPER(a.admin_division_code) = UPPER($1)
        AND a.pgcombine IS NOT NULL
        AND TRIM(a.pgcombine) != ''
        AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'
        AND e.product_group IS NULL
      ORDER BY a.pgcombine
    `, [divisionCode.toUpperCase()]);
    const productGroups = pgResult.rows.map(r => r.product_group).filter(pg => pg);
    
    // 7. Get pricing data
    const pricingResult = await divisionPool.query(`
      SELECT 
        LOWER(TRIM(product_group)) as product_group,
        COALESCE(asp_round, 0) as selling_price,
        COALESCE(morm_round, 0) as morm
      FROM ${tables.pricingRounding}
      WHERE UPPER(division) = UPPER($1)
        AND year = $2
        AND product_group IS NOT NULL
        AND TRIM(product_group) != ''
    `, [divisionCode.toUpperCase(), prevYear]);
    
    const pricingData = {};
    pricingResult.rows.forEach(row => {
      pricingData[row.product_group] = {
        sellingPrice: parseFloat(row.selling_price) || 0,
        morm: parseFloat(row.morm) || 0
      };
    });
    
    // 8. Generate HTML 
    const { generateSalesRepHtmlExport } = require('../utils/salesRepHtmlExport');
    
    const displayName = `${divisionCode} Division - All Groups (${allGroups.length} groups)`;
    
    const htmlContent = await generateSalesRepHtmlExport({
      division: divisionCode,
      actualYear: prevYear,
      salesRep: displayName,
      tableData,
      customRowsData: [],
      budgetData: {},
      mergedCustomers,
      countries,
      productGroups,
      pricingData,
      currency: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
      allocationTargets,
      groupName: displayName,
      groupMembers: allMembers,
      isAllGroupsView: true // Flag to indicate this is a division total view
    });
    
    // Set headers for file download
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Budget_${divisionCode}_ALL_GROUPS_${budgetYear}_${dateStr}.html`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(htmlContent);
    
  } catch (error) {
    logger.error('❌ Error exporting HTML for all groups:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
