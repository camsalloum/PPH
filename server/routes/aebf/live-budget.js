/**
 * Live Budget Entry Routes
 * 
 * Endpoints for in-browser live budget entry by sales rep groups.
 * Same data target as Bulk Import (fp_budget_unified with data_source = 'LIVE_ENTRY')
 * 
 * Workflow:
 * 1. Sales Rep: Load data → Fill budget → Save Draft → Submit for Review
 * 2. Manager: Review → Approve → Finalize
 */

const express = require('express');
const router = express.Router();
const { getPoolForDivision, getTableNames, getDivisionName } = require('./shared');
const { authPool } = require('../../database/config');
const logger = require('../../utils/logger');

/**
 * Ensure prospects table exists - auto-create if missing
 * This table stores new customers from budget imports (not in actual data or customer master)
 */
async function ensureProspectsTableExists(divisionPool, division) {
  const tables = getTableNames(division);
  const tableName = tables.prospects;

  try {
    const check = await divisionPool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    `, [tableName]);

    if (check.rows.length === 0) {
      logger.info(`📊 Creating prospects table: ${tableName}`);

      await divisionPool.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          customer_name VARCHAR(255) NOT NULL,
          country VARCHAR(100),
          sales_rep_group VARCHAR(255),
          division VARCHAR(50) NOT NULL,
          source_batch_id VARCHAR(100),
          budget_year INTEGER,
          status VARCHAR(50) DEFAULT 'prospect',
          converted_to_customer BOOLEAN DEFAULT false,
          converted_at TIMESTAMP,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(customer_name, division, country, sales_rep_group)
        )
      `);

      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${division.toLowerCase()}_prospects_status ON ${tableName}(status)`);
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${division.toLowerCase()}_prospects_customer ON ${tableName}(customer_name)`);
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${division.toLowerCase()}_prospects_division ON ${tableName}(division)`);

      logger.info(`✅ Created prospects table: ${tableName}`);
    }
  } catch (error) {
    logger.error(`Error ensuring prospects table exists: ${error.message}`);
  }
}

/**
 * Insert prospect into prospects table (upsert - ignore if already exists)
 * Prospect uniquely identified by: customer_name, division, country, sales_rep_group
 */
async function insertProspect(client, tables, customer, country, salesRepGroup, division, budgetYear) {
  try {
    await client.query(`
      INSERT INTO ${tables.prospects} 
        (customer_name, country, sales_rep_group, division, source_batch_id, budget_year, status)
      VALUES ($1, $2, $3, $4, 'LIVE_ENTRY', $5, 'prospect')
      ON CONFLICT (customer_name, division, country, sales_rep_group) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP,
        budget_year = GREATEST(${tables.prospects}.budget_year, EXCLUDED.budget_year)
    `, [customer, country, salesRepGroup, division.toUpperCase(), parseInt(budgetYear)]);
    
    logger.info(`🆕 Prospect added/updated: "${customer}" for ${salesRepGroup}`);
    return true;
  } catch (error) {
    logger.warn(`Could not insert prospect "${customer}": ${error.message}`);
    return false;
  }
}

/**
 * POST /api/aebf/live-budget/load
 * Load actual data, existing budget values, and reference data for live entry
 */
router.post('/load', async (req, res) => {
  try {
    const { division, groupId, actualYear, budgetYear } = req.body;
    
    if (!division || !groupId) {
      return res.status(400).json({ success: false, error: 'Division and groupId are required' });
    }
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // 1. Get group info and members
    const groupResult = await divisionPool.query(`
      SELECT g.id, g.group_name, ARRAY_AGG(m.member_name) as members
      FROM sales_rep_groups g
      JOIN sales_rep_group_members m ON m.group_id = g.id
      WHERE g.id = $1 AND UPPER(g.division) = $2
      GROUP BY g.id, g.group_name
    `, [parseInt(groupId), division.toUpperCase()]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    const groupInfo = {
      id: groupResult.rows[0].id,
      groupName: groupResult.rows[0].group_name,
      members: groupResult.rows[0].members || []
    };
    
    // 2. Get actual sales data for group members (previous year)
    const actualQuery = `
      SELECT
        TRIM(d.customer_name) as customer,
        TRIM(d.country) as country,
        TRIM(d.pgcombine) as productgroup,
        d.month_no as month,
        SUM(d.qty_kgs) / 1000.0 as mt_value,
        SUM(d.amount) as amount_value,
        SUM(d.morm) as morm_value
      FROM ${tables.actualcommon} d
      LEFT JOIN ${tables.productGroupExclusions} e
        ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = UPPER($1)
      WHERE UPPER(d.admin_division_code) = UPPER($1)
        AND d.year = $2
        AND UPPER(TRIM(d.sales_rep_name)) = ANY($3::text[])
        AND d.customer_name IS NOT NULL AND TRIM(d.customer_name) != ''
        AND d.country IS NOT NULL AND TRIM(d.country) != ''
        AND d.pgcombine IS NOT NULL AND TRIM(d.pgcombine) != ''
        AND UPPER(TRIM(d.pgcombine)) != 'SERVICES CHARGES'
        AND e.product_group IS NULL
      GROUP BY TRIM(d.customer_name), TRIM(d.country), TRIM(d.pgcombine), d.month_no
      ORDER BY TRIM(d.customer_name), TRIM(d.country), TRIM(d.pgcombine), d.month_no
    `;
    
    const actualResult = await divisionPool.query(actualQuery, [
      division.toUpperCase(),
      parseInt(actualYear),
      groupInfo.members.map(m => m.toUpperCase().trim())
    ]);
    
    // Transform to table data format
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
          monthlyActualMorm: {}
        };
      }
      customerMap[key].monthlyActual[row.month] = (customerMap[key].monthlyActual[row.month] || 0) + (parseFloat(row.mt_value) || 0);
      customerMap[key].monthlyActualAmount[row.month] = (customerMap[key].monthlyActualAmount[row.month] || 0) + (parseFloat(row.amount_value) || 0);
      customerMap[key].monthlyActualMorm[row.month] = (customerMap[key].monthlyActualMorm[row.month] || 0) + (parseFloat(row.morm_value) || 0);
    });
    
    const tableData = Object.values(customerMap).map(item => {
      const monthlyActual = {};
      for (let m = 1; m <= 12; m++) {
        monthlyActual[m] = item.monthlyActual[m] || 0;
      }
      return { ...item, monthlyActual };
    });
    
    // 3. Get management allocation targets
    let allocationTargets = {};
    const allocResult = await divisionPool.query(`
      SELECT pgcombine, SUM(qty_kgs) as allocated_kgs
      FROM ${division.toLowerCase()}_sales_rep_group_budget_allocation
      WHERE UPPER(division_code) = UPPER($1) AND budget_year = $2 AND sales_rep_group_id = $3
      GROUP BY pgcombine
    `, [division.toUpperCase(), parseInt(budgetYear), parseInt(groupId)]);
    
    allocResult.rows.forEach(r => {
      allocationTargets[r.pgcombine] = parseFloat(r.allocated_kgs) || 0;
    });
    
    // 4. Get existing budget values from ALL sources (LIVE_ENTRY, HTML_EXPORT, BULK_IMPORT)
    // Use DISTINCT ON to get the most recent entry per customer/country/pg/month
    // Priority: LIVE_ENTRY > HTML_EXPORT > BULK_IMPORT
    logger.info(`🔍 Loading budget for group: "${groupInfo.groupName}", year: ${budgetYear}, division: ${division}`);
    
    const budgetResult = await divisionPool.query(`
      SELECT DISTINCT ON (customer, country, productgroup, month_no)
        customer, country, productgroup, month_no, mt_value, budget_status, is_prospect, data_source
      FROM (
        SELECT 
          TRIM(customer_name) as customer,
          TRIM(country) as country,
          TRIM(pgcombine) as productgroup,
          month_no,
          qty_kgs / 1000.0 as mt_value,
          budget_status,
          is_prospect,
          data_source,
          CASE 
            WHEN data_source = 'LIVE_ENTRY' THEN 1 
            WHEN data_source = 'HTML_EXPORT' THEN 2 
            ELSE 3 
          END as priority,
          COALESCE(updated_at, created_at, NOW()) as last_update
        FROM ${tables.budgetUnified}
        WHERE UPPER(division_code) = UPPER($1)
          AND budget_year = $2
          AND UPPER(TRIM(sales_rep_group_name)) = UPPER(TRIM($3))
          AND budget_type = 'SALES_REP'
      ) sub
      ORDER BY customer, country, productgroup, month_no, priority, last_update DESC
    `, [division, parseInt(budgetYear), groupInfo.groupName]);
    
    logger.info(`📊 Budget query returned ${budgetResult.rows.length} rows for "${groupInfo.groupName}"`);
    
    const budgetValues = {};
    let budgetStatus = 'new';
    let dataSource = null;
    const customRowsSet = new Set();
    
    budgetResult.rows.forEach(row => {
      const key = `${row.customer}|${row.country}|${row.productgroup}|${row.month_no}`;
      budgetValues[key] = parseFloat(row.mt_value) || 0;
      
      if (row.budget_status) {
        budgetStatus = row.budget_status;
      }
      if (row.data_source) {
        dataSource = row.data_source;
      }
      
      // Track custom rows (budget entries not in actual data)
      const rowKey = `${row.customer}|${row.country}|${row.productgroup}`;
      if (!customerMap[rowKey]) {
        customRowsSet.add(JSON.stringify({
          customer: row.customer,
          country: row.country,
          productGroup: row.productgroup,
          isProspect: row.is_prospect
        }));
      }
    });
    
    const customRows = Array.from(customRowsSet).map(s => JSON.parse(s));
    
    logger.info(`📊 Budget data loaded: ${Object.keys(budgetValues).length} entries from ${dataSource || 'none'}, status: ${budgetStatus}`);
    
    // 5. Get reference data
    // Customers
    const customersResult = await divisionPool.query(`
      SELECT DISTINCT TRIM(customer_name) as customer
      FROM ${tables.actualcommon}
      WHERE UPPER(admin_division_code) = UPPER($1)
        AND customer_name IS NOT NULL AND TRIM(customer_name) != ''
      ORDER BY customer
      LIMIT 2000
    `, [division]);
    const customers = customersResult.rows.map(r => r.customer);
    
    // Countries from master_countries
    let countries = [];
    try {
      const countriesResult = await authPool.query(`
        SELECT country_name FROM master_countries WHERE is_active = true ORDER BY country_name
      `);
      countries = countriesResult.rows.map(r => r.country_name);
    } catch (e) {
      logger.warn('Could not load countries from master_countries');
    }
    
    // Product groups (with exclusions)
    const pgResult = await divisionPool.query(`
      SELECT DISTINCT a.pgcombine as product_group
      FROM ${tables.actualcommon} a
      LEFT JOIN ${tables.productGroupExclusions} e
        ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = UPPER($1)
      WHERE UPPER(a.admin_division_code) = UPPER($1)
        AND a.pgcombine IS NOT NULL AND TRIM(a.pgcombine) != ''
        AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'
        AND e.product_group IS NULL
      ORDER BY a.pgcombine
    `, [division.toUpperCase()]);
    const productGroups = pgResult.rows.map(r => r.product_group);
    
    // 6. Get pricing data
    const pricingResult = await divisionPool.query(`
      SELECT 
        LOWER(TRIM(product_group)) as product_group,
        COALESCE(asp_round, 0) as selling_price,
        COALESCE(morm_round, 0) as morm
      FROM ${tables.pricingRounding}
      WHERE UPPER(division) = UPPER($1) AND year = $2
    `, [division.toUpperCase(), parseInt(actualYear)]);
    
    const pricingData = {};
    pricingResult.rows.forEach(row => {
      pricingData[row.product_group] = {
        sellingPrice: parseFloat(row.selling_price) || 0,
        morm: parseFloat(row.morm) || 0
      };
    });
    
    logger.info(`📊 Live budget load: ${tableData.length} actual rows, ${Object.keys(budgetValues).length} budget entries, status: ${budgetStatus}`);
    
    res.json({
      success: true,
      data: {
        tableData,
        allocationTargets,
        pricingData,
        customers,
        countries,
        productGroups,
        budgetValues,
        customRows,
        status: budgetStatus,
        groupInfo
      }
    });
    
  } catch (error) {
    logger.error('Error loading live budget data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/aebf/live-budget/save-draft
 * Save budget as draft
 */
router.post('/save-draft', async (req, res) => {
  try {
    const { division, groupId, budgetYear, budgetValues, customRows } = req.body;
    
    if (!division || !groupId || !budgetYear) {
      return res.status(400).json({ success: false, error: 'Division, groupId, and budgetYear are required' });
    }
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Ensure prospects table exists
    await ensureProspectsTableExists(divisionPool, division);
    
    // Get group name
    const groupResult = await divisionPool.query(
      `SELECT group_name FROM sales_rep_groups WHERE id = $1`,
      [parseInt(groupId)]
    );
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    const groupName = groupResult.rows[0].group_name;
    
    const client = await divisionPool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete existing LIVE_ENTRY draft for this group/year
      await client.query(`
        DELETE FROM ${tables.budgetUnified}
        WHERE UPPER(division_code) = UPPER($1)
          AND budget_year = $2
          AND UPPER(TRIM(sales_rep_group_name)) = UPPER(TRIM($3))
          AND budget_type = 'SALES_REP'
          AND data_source = 'LIVE_ENTRY'
      `, [division, parseInt(budgetYear), groupName]);
      
      // Insert new budget values
      let insertCount = 0;
      let prospectCount = 0;
      const insertedProspects = new Set(); // Track unique prospects
      
      for (const [key, value] of Object.entries(budgetValues)) {
        if (value === null || value === undefined || value === '') continue;
        
        const parts = key.split('|');
        if (parts.length !== 4) continue;
        
        const [customer, country, productGroup, monthStr] = parts;
        const month = parseInt(monthStr);
        const mtValue = parseFloat(value) || 0;
        
        if (mtValue <= 0) continue;
        
        const kgValue = mtValue * 1000;
        
        // Check if this is a custom row (prospect)
        const isProspect = customRows?.some(r => 
          r.customer === customer && 
          r.country === country && 
          r.productGroup === productGroup &&
          r.isProspect
        ) || false;
        
        await client.query(`
          INSERT INTO ${tables.budgetUnified}
          (division_code, division_name, budget_year, month_no,
           sales_rep_group_name, customer_name, country, pgcombine,
           qty_kgs, amount, morm,
           is_budget, budget_type, budget_status, data_source, is_prospect,
           created_at, updated_at, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, true, 'SALES_REP', 'draft', 'LIVE_ENTRY', $10,
                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'live_entry')
        `, [
          division.toUpperCase(),
          division.toUpperCase(),
          parseInt(budgetYear),
          month,
          groupName,
          customer,
          country,
          productGroup,
          kgValue,
          isProspect
        ]);
        
        insertCount++;
        
        // Insert prospect into prospects table (only once per customer)
        if (isProspect) {
          const prospectKey = `${customer}|${country}|${budgetYear}`;
          if (!insertedProspects.has(prospectKey)) {
            await insertProspect(client, tables, customer, country, groupName, division, budgetYear);
            insertedProspects.add(prospectKey);
            prospectCount++;
          }
        }
      }
      
      await client.query('COMMIT');
      
      logger.info(`💾 Live budget draft saved: ${insertCount} records (${prospectCount} prospects) for ${groupName} / ${budgetYear}`);
      
      res.json({
        success: true,
        message: 'Draft saved successfully',
        recordCount: insertCount,
        prospectCount
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('Error saving live budget draft:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/aebf/live-budget/submit-for-review
 * Submit budget for manager review
 */
router.post('/submit-for-review', async (req, res) => {
  try {
    const { division, groupId, budgetYear, budgetValues, customRows } = req.body;
    
    if (!division || !groupId || !budgetYear) {
      return res.status(400).json({ success: false, error: 'Division, groupId, and budgetYear are required' });
    }
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Ensure prospects table exists
    await ensureProspectsTableExists(divisionPool, division);
    
    // Get group name
    const groupResult = await divisionPool.query(
      `SELECT group_name FROM sales_rep_groups WHERE id = $1`,
      [parseInt(groupId)]
    );
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    const groupName = groupResult.rows[0].group_name;
    
    const client = await divisionPool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete existing LIVE_ENTRY for this group/year
      await client.query(`
        DELETE FROM ${tables.budgetUnified}
        WHERE UPPER(division_code) = UPPER($1)
          AND budget_year = $2
          AND UPPER(TRIM(sales_rep_group_name)) = UPPER(TRIM($3))
          AND budget_type = 'SALES_REP'
          AND data_source = 'LIVE_ENTRY'
      `, [division, parseInt(budgetYear), groupName]);
      
      // Insert budget values with pending_approval status
      let insertCount = 0;
      let prospectCount = 0;
      const insertedProspects = new Set(); // Track unique prospects
      
      for (const [key, value] of Object.entries(budgetValues)) {
        if (value === null || value === undefined || value === '') continue;
        
        const parts = key.split('|');
        if (parts.length !== 4) continue;
        
        const [customer, country, productGroup, monthStr] = parts;
        const month = parseInt(monthStr);
        const mtValue = parseFloat(value) || 0;
        
        if (mtValue <= 0) continue;
        
        const kgValue = mtValue * 1000;
        
        const isProspect = customRows?.some(r => 
          r.customer === customer && 
          r.country === country && 
          r.productGroup === productGroup &&
          r.isProspect
        ) || false;
        
        await client.query(`
          INSERT INTO ${tables.budgetUnified}
          (division_code, division_name, budget_year, month_no,
           sales_rep_group_name, customer_name, country, pgcombine,
           qty_kgs, amount, morm,
           is_budget, budget_type, budget_status, data_source, is_prospect,
           created_at, updated_at, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, true, 'SALES_REP', 'pending_approval', 'LIVE_ENTRY', $10,
                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'live_entry')
        `, [
          division.toUpperCase(),
          division.toUpperCase(),
          parseInt(budgetYear),
          month,
          groupName,
          customer,
          country,
          productGroup,
          kgValue,
          isProspect
        ]);
        
        insertCount++;
        
        // Insert prospect into prospects table (only once per customer)
        if (isProspect) {
          const prospectKey = `${customer}|${country}|${budgetYear}`;
          if (!insertedProspects.has(prospectKey)) {
            await insertProspect(client, tables, customer, country, groupName, division, budgetYear);
            insertedProspects.add(prospectKey);
            prospectCount++;
          }
        }
      }
      
      await client.query('COMMIT');
      
      logger.info(`📨 Live budget submitted for review: ${insertCount} records (${prospectCount} prospects) for ${groupName} / ${budgetYear}`);
      
      res.json({
        success: true,
        message: 'Budget submitted for review',
        recordCount: insertCount,
        prospectCount
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('Error submitting live budget:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/aebf/live-budget/approve
 * Approve and finalize budget (manager action)
 */
router.post('/approve', async (req, res) => {
  try {
    const { division, groupId, budgetYear } = req.body;
    
    if (!division || !groupId || !budgetYear) {
      return res.status(400).json({ success: false, error: 'Division, groupId, and budgetYear are required' });
    }
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Get group name
    const groupResult = await divisionPool.query(
      `SELECT group_name FROM sales_rep_groups WHERE id = $1`,
      [parseInt(groupId)]
    );
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    const groupName = groupResult.rows[0].group_name;
    
    // Update status to final
    const result = await divisionPool.query(`
      UPDATE ${tables.budgetUnified}
      SET budget_status = 'final', updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(division_code) = UPPER($1)
        AND budget_year = $2
        AND UPPER(TRIM(sales_rep_group_name)) = UPPER(TRIM($3))
        AND budget_type = 'SALES_REP'
        AND data_source = 'LIVE_ENTRY'
    `, [division, parseInt(budgetYear), groupName]);
    
    logger.info(`✅ Live budget approved: ${result.rowCount} records for ${groupName} / ${budgetYear}`);
    
    res.json({
      success: true,
      message: 'Budget approved and finalized',
      recordCount: result.rowCount
    });
    
  } catch (error) {
    logger.error('Error approving live budget:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
