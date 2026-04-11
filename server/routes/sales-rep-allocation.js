/**
 * Sales Rep Allocation API
 * 
 * Management allocates budget per INDIVIDUAL SALES REP per product group
 * 
 * Flow:
 * 1. Select Sales Rep (individual)
 * 2. Select Actual Year (to show rep's actual sales)
 * 3. Select Divisional Budget Year (to show as reference)
 * 4. Select Rep Budget Year (to allocate)
 * 5. Show ALL product groups (pgcombine)
 * 6. Display: Actual | Div Budget | Rep Submitted | Management Allocation
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

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
    actualcommon: `${code}_actualcommon`,
    budgetUnified: `${code}_budget_unified`,
    pricingRounding: `${code}_product_group_pricing_rounding`,
    allocation: `${code}_sales_rep_budget_allocation`
  };
}

// ============================================================================
// ENDPOINT 1: Get Sales Reps List
// ============================================================================
router.get('/reps', async (req, res) => {
  logger.info('📋 Get sales reps request:', req.query);
  
  try {
    const { division = 'FP' } = req.query;
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    // Get distinct sales reps from actual sales data
    const result = await divisionPool.query(`
      SELECT DISTINCT sales_rep_name, COUNT(*) as record_count, SUM(qty_kgs) as total_kgs
      FROM ${tables.actualcommon}
      WHERE sales_rep_name IS NOT NULL
        AND TRIM(sales_rep_name) <> ''
      GROUP BY sales_rep_name
      ORDER BY sales_rep_name
    `);

    const reps = result.rows.map(r => ({
      name: r.sales_rep_name,
      recordCount: parseInt(r.record_count),
      totalKgs: parseFloat(r.total_kgs) || 0
    }));

    logger.info(`✅ Found ${reps.length} sales reps for ${division}`);

    res.json({ 
      success: true, 
      reps,
      count: reps.length
    });

  } catch (error) {
    logger.error('❌ Error fetching sales reps:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ENDPOINT 2: Load Allocation Data
// ============================================================================
router.post('/load-data', async (req, res) => {
  logger.info('📊 Load allocation data request:', req.body);
  
  try {
    const { 
      division = 'FP', 
      salesRepName, 
      actualYear, 
      divBudgetYear, 
      repBudgetYear 
    } = req.body;

    if (!salesRepName) {
      return res.status(400).json({ success: false, error: 'Sales Rep name is required' });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    // 1. Get ALL product groups from pricing table
    const pgQuery = await divisionPool.query(`
      SELECT DISTINCT product_group as pgcombine
      FROM ${tables.pricingRounding}
      WHERE UPPER(division) = $1
        AND product_group IS NOT NULL 
        AND TRIM(product_group) <> ''
      ORDER BY product_group
    `, [division.toUpperCase()]);

    const allPGs = pgQuery.rows.map(r => r.pgcombine);
    logger.info(`📦 Found ${allPGs.length} product groups`);

    // 2. Get actual sales for this rep in the actual year
    const actualMap = {};
    if (actualYear) {
      const actualQuery = await divisionPool.query(`
        SELECT 
          pgcombine,
          SUM(qty_kgs) as actual_kgs
        FROM ${tables.actualcommon}
        WHERE sales_rep_name = $1
          AND year = $2
        GROUP BY pgcombine
      `, [salesRepName, actualYear]);

      actualQuery.rows.forEach(r => {
        actualMap[r.pgcombine] = parseFloat(r.actual_kgs) || 0;
      });
      logger.info(`📈 Found actuals for ${Object.keys(actualMap).length} product groups`);
    }

    // 3. Get divisional budget for divBudgetYear
    const divBudgetMap = {};
    if (divBudgetYear) {
      const divBudgetQuery = await divisionPool.query(`
        SELECT 
          pgcombine,
          SUM(qty_kgs) as div_budget_kgs
        FROM ${tables.budgetUnified}
        WHERE budget_year = $1
          AND budget_type = 'DIVISION'
        GROUP BY pgcombine
      `, [divBudgetYear]);

      divBudgetQuery.rows.forEach(r => {
        divBudgetMap[r.pgcombine] = parseFloat(r.div_budget_kgs) || 0;
      });
      logger.info(`📊 Found div budget for ${Object.keys(divBudgetMap).length} product groups`);
    }

    // 4. Get rep's submitted budget for repBudgetYear
    const repSubmittedMap = {};
    if (repBudgetYear) {
      const repSubmittedQuery = await divisionPool.query(`
        SELECT 
          pgcombine,
          SUM(qty_kgs) as rep_submitted_kgs
        FROM ${tables.budgetUnified}
        WHERE sales_rep_name = $1
          AND budget_year = $2
          AND budget_type = 'SALES_REP'
        GROUP BY pgcombine
      `, [salesRepName, repBudgetYear]);

      repSubmittedQuery.rows.forEach(r => {
        repSubmittedMap[r.pgcombine] = parseFloat(r.rep_submitted_kgs) || 0;
      });
      logger.info(`📝 Found rep submitted for ${Object.keys(repSubmittedMap).length} product groups`);
    }

    // 5. Get existing draft/approved allocation
    const draftMap = {};
    let draftStatus = null;
    try {
      // First check if the table exists
      const tableCheck = await divisionPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [tables.allocation]);
      
      if (tableCheck.rows[0].exists) {
        const draftQuery = await divisionPool.query(`
          SELECT 
            pgcombine,
            qty_kgs,
            budget_status
          FROM ${tables.allocation}
          WHERE sales_rep_name = $1
            AND budget_year = $2
        `, [salesRepName, repBudgetYear]);

        draftQuery.rows.forEach(r => {
          draftMap[r.pgcombine] = parseFloat(r.qty_kgs) || 0;
          draftStatus = r.budget_status;
        });
        logger.info(`💾 Found draft data for ${Object.keys(draftMap).length} product groups, status: ${draftStatus}`);
      }
    } catch (e) {
      logger.warn('Allocation table may not exist yet:', e.message);
    }

    // 6. Combine all data - show ALL product groups
    const productGroups = allPGs.map(pg => ({
      pgcombine: pg,
      actual_kgs: actualMap[pg] || 0,
      div_budget_kgs: divBudgetMap[pg] || 0,
      rep_submitted_kgs: repSubmittedMap[pg] || 0,
      draft_kgs: draftMap[pg] !== undefined ? draftMap[pg] : null
    }));

    res.json({
      success: true,
      data: {
        salesRepName,
        division,
        actualYear,
        divBudgetYear,
        repBudgetYear,
        draftStatus,
        productGroups,
        totalProductGroups: allPGs.length
      }
    });

  } catch (error) {
    logger.error('❌ Error loading allocation data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ENDPOINT 3: Save Draft
// ============================================================================
router.post('/save-draft', async (req, res) => {
  logger.info('💾 Save draft request:', req.body);
  
  try {
    const { division = 'FP', salesRepName, budgetYear, allocations } = req.body;

    if (!salesRepName || !budgetYear || !allocations) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    // Ensure table exists
    await divisionPool.query(`
      CREATE TABLE IF NOT EXISTS ${tables.allocation} (
        id SERIAL PRIMARY KEY,
        division_code VARCHAR(20) NOT NULL DEFAULT '${division.toUpperCase()}',
        division_name VARCHAR(100),
        budget_year INTEGER NOT NULL,
        month_no INTEGER DEFAULT 0,
        month_name VARCHAR(20) DEFAULT 'Yearly',
        sales_rep_name VARCHAR(200) NOT NULL,
        pgcombine VARCHAR(200) NOT NULL,
        qty_kgs DECIMAL(15,3) DEFAULT 0,
        amount DECIMAL(18,2) DEFAULT 0,
        morm DECIMAL(18,2) DEFAULT 0,
        budget_status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_by VARCHAR(100),
        submitted_at TIMESTAMP,
        UNIQUE(division_code, budget_year, month_no, sales_rep_name, pgcombine)
      )
    `);

    let savedCount = 0;

    // Upsert each allocation
    for (const alloc of allocations) {
      if (alloc.yearly_kgs > 0) {
        await divisionPool.query(`
          INSERT INTO ${tables.allocation} 
            (division_code, division_name, budget_year, sales_rep_name, pgcombine, qty_kgs, budget_status, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, 'draft', CURRENT_TIMESTAMP)
          ON CONFLICT (division_code, budget_year, month_no, sales_rep_name, pgcombine)
          DO UPDATE SET 
            qty_kgs = EXCLUDED.qty_kgs,
            budget_status = 'draft',
            updated_at = CURRENT_TIMESTAMP
          WHERE ${tables.allocation}.budget_status != 'approved'
        `, [division.toUpperCase(), 'Flexible Packaging', budgetYear, salesRepName, alloc.pgcombine, alloc.yearly_kgs]);
        savedCount++;
      }
    }

    logger.info(`✅ Saved ${savedCount} allocations as draft`);

    res.json({
      success: true,
      message: 'Draft saved',
      recordsSaved: savedCount
    });

  } catch (error) {
    logger.error('❌ Error saving draft:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ENDPOINT 4: Submit Final (Approve)
// ============================================================================
router.post('/submit-final', async (req, res) => {
  logger.info('✅ Submit final request:', req.body);
  
  try {
    const { division = 'FP', salesRepName, budgetYear, allocations, approvedBy } = req.body;

    if (!salesRepName || !budgetYear || !allocations) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    // Ensure table exists
    await divisionPool.query(`
      CREATE TABLE IF NOT EXISTS ${tables.allocation} (
        id SERIAL PRIMARY KEY,
        division_code VARCHAR(20) NOT NULL DEFAULT '${division.toUpperCase()}',
        division_name VARCHAR(100),
        budget_year INTEGER NOT NULL,
        month_no INTEGER DEFAULT 0,
        month_name VARCHAR(20) DEFAULT 'Yearly',
        sales_rep_name VARCHAR(200) NOT NULL,
        pgcombine VARCHAR(200) NOT NULL,
        qty_kgs DECIMAL(15,3) DEFAULT 0,
        amount DECIMAL(18,2) DEFAULT 0,
        morm DECIMAL(18,2) DEFAULT 0,
        budget_status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_by VARCHAR(100),
        submitted_at TIMESTAMP,
        UNIQUE(division_code, budget_year, month_no, sales_rep_name, pgcombine)
      )
    `);

    let savedCount = 0;

    // Upsert each allocation as approved
    for (const alloc of allocations) {
      if (alloc.yearly_kgs > 0) {
        await divisionPool.query(`
          INSERT INTO ${tables.allocation} 
            (division_code, division_name, budget_year, sales_rep_name, pgcombine, qty_kgs, budget_status, approved_by, submitted_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (division_code, budget_year, month_no, sales_rep_name, pgcombine)
          DO UPDATE SET 
            qty_kgs = EXCLUDED.qty_kgs,
            budget_status = 'approved',
            approved_by = EXCLUDED.approved_by,
            submitted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        `, [division.toUpperCase(), 'Flexible Packaging', budgetYear, salesRepName, alloc.pgcombine, alloc.yearly_kgs, approvedBy || 'Management']);
        savedCount++;
      }
    }

    logger.info(`✅ Approved ${savedCount} allocations for ${salesRepName}`);

    res.json({
      success: true,
      message: `Budget approved for ${salesRepName}`,
      recordsSaved: savedCount
    });

  } catch (error) {
    logger.error('❌ Error submitting allocation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ENDPOINT 5: Delete Draft
// ============================================================================
router.delete('/delete', async (req, res) => {
  logger.info('🗑️ Delete draft request:', req.body);
  
  try {
    const { division = 'FP', salesRepName, budgetYear } = req.body;

    if (!salesRepName || !budgetYear) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);

    const result = await divisionPool.query(`
      DELETE FROM ${tables.allocation}
      WHERE division_code = $1
        AND sales_rep_name = $2
        AND budget_year = $3
        AND budget_status = 'draft'
    `, [division.toUpperCase(), salesRepName, budgetYear]);

    logger.info(`🗑️ Deleted ${result.rowCount} draft records`);

    res.json({
      success: true,
      message: 'Draft deleted',
      recordsDeleted: result.rowCount
    });

  } catch (error) {
    logger.error('❌ Error deleting draft:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
