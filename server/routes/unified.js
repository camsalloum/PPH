/**
 * Unified Data API Routes
 * 
 * Single source of truth for all data endpoints.
 * All modules should use these endpoints instead of querying directly.
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../database/config');

// ============================================================
// SYNC ENDPOINT - Call after data upload
// ============================================================

/**
 * POST /api/unified/sync
 * Syncs unified tables after new data upload
 * Returns detailed status including warnings for items needing admin attention
 */
router.post('/sync', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sync_unified_data()');
    const sync = result.rows[0];
    
    res.json({
      success: true,
      message: 'Unified data synced successfully',
      result: {
        newCustomers: sync.new_customers,
        newSalesReps: sync.new_sales_reps,
        newProductGroups: sync.new_product_groups,
        mergesApplied: sync.merges_applied,
        ungroupedSalesReps: sync.ungrouped_sales_reps,
        unmappedProductGroups: sync.unmapped_product_groups,
        warnings: sync.all_warnings || [],
        syncTime: sync.sync_time
      }
    });
  } catch (error) {
    console.error('Error syncing unified data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/unified/rebuild
 * Full rebuild of unified tables (use carefully!)
 */
router.post('/rebuild', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rebuild_unified_data()');
    
    res.json({
      success: true,
      message: 'Unified data rebuilt from scratch',
      result: result.rows[0]
    });
  } catch (error) {
    console.error('Error rebuilding unified data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/unified/sync-merges
 * Sync customer merge rules to unified table
 * Call this after creating/modifying merge rules
 */
router.post('/sync-merges', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sync_customer_merges_to_unified()');
    const data = result.rows[0];
    
    res.json({
      success: true,
      message: 'Customer merges synced',
      result: {
        mergesApplied: data.merges_applied,
        customersMarkedMerged: data.customers_marked_merged,
        warnings: data.warnings || []
      }
    });
  } catch (error) {
    console.error('Error syncing merges:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/unified/sync-sales-rep-groups
 * Sync sales rep group assignments to unified table
 * Call this after creating/modifying sales rep groups
 */
router.post('/sync-sales-rep-groups', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sync_sales_rep_groups_to_unified()');
    const data = result.rows[0];
    
    res.json({
      success: true,
      message: 'Sales rep groups synced',
      result: {
        repsUpdated: data.reps_updated,
        ungroupedReps: data.ungrouped_reps,
        warnings: data.warnings || []
      }
    });
  } catch (error) {
    console.error('Error syncing sales rep groups:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/unified/sync-product-groups
 * Sync product groups to unified and raw tables
 * Call this after uploading new data with new product groups
 */
router.post('/sync-product-groups', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sync_product_groups_complete()');
    const data = result.rows[0];
    
    res.json({
      success: true,
      message: 'Product groups synced',
      result: {
        newInUnified: data.new_in_unified,
        newInRaw: data.new_in_raw,
        unmappedCount: data.unmapped_count,
        warnings: data.warnings || []
      }
    });
  } catch (error) {
    console.error('Error syncing product groups:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/unified/status
 * Get sync status and items needing admin attention
 */
router.get('/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM get_unified_sync_status()');
    const status = result.rows[0];
    
    res.json({
      success: true,
      status: {
        totalCustomers: status.total_customers,
        totalSalesReps: status.total_sales_reps,
        totalProductGroups: status.total_product_groups,
        mergedCustomers: status.merged_customers,
        ungroupedSalesReps: status.ungrouped_sales_reps,
        unmappedProductGroups: status.unmapped_product_groups,
        dataCoveragePct: status.data_coverage_pct,
        itemsNeedingAttention: status.items_needing_attention
      }
    });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/unified/refresh-views
 * Refresh materialized views only (fast)
 */
router.post('/refresh-views', async (req, res) => {
  try {
    await pool.query('SELECT refresh_unified_materialized_views()');
    
    res.json({
      success: true,
      message: 'Materialized views refreshed'
    });
  } catch (error) {
    console.error('Error refreshing views:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// CUSTOMER ENDPOINTS
// ============================================================

/**
 * GET /api/unified/customers
 * Get all customers from unified table
 */
router.get('/customers', async (req, res) => {
  try {
    const { search, country, salesRep, limit = 100, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        id, customer_code, display_name, normalized_name,
        primary_sales_rep_name, primary_country, countries,
        total_amount_all_time, total_kgs_all_time, total_morm_all_time,
        first_transaction_date, last_transaction_date, transaction_years,
        crm_status, is_merged, merged_into_id, division
      FROM fp_customer_unified
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (search) {
      query += ` AND display_name ILIKE $${paramIndex++}`;
      params.push(`%${search}%`);
    }
    
    if (country) {
      query += ` AND $${paramIndex++} = ANY(countries)`;
      params.push(country);
    }
    
    if (salesRep) {
      query += ` AND primary_sales_rep_name ILIKE $${paramIndex++}`;
      params.push(`%${salesRep}%`);
    }
    
    query += ` ORDER BY total_amount_all_time DESC`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) FROM fp_customer_unified WHERE 1=1`;
    const countParams = [];
    let countParamIndex = 1;
    
    if (search) {
      countQuery += ` AND display_name ILIKE $${countParamIndex++}`;
      countParams.push(`%${search}%`);
    }
    if (country) {
      countQuery += ` AND $${countParamIndex++} = ANY(countries)`;
      countParams.push(country);
    }
    if (salesRep) {
      countQuery += ` AND primary_sales_rep_name ILIKE $${countParamIndex++}`;
      countParams.push(`%${salesRep}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error getting customers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/unified/customers/:id
 * Get single customer with full details
 */
router.get('/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM fp_customer_unified 
      WHERE id = $1 OR customer_code = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error getting customer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// SALES REP ENDPOINTS
// ============================================================

/**
 * GET /api/unified/sales-reps
 * Get all sales reps from unified table
 */
router.get('/sales-reps', async (req, res) => {
  try {
    const { group, limit = 100, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        id, sales_rep_code, display_name, normalized_name,
        group_id, group_name,
        total_amount_all_time, total_kgs_all_time, total_morm_all_time,
        customer_count, country_count,
        first_transaction_date, last_transaction_date, division
      FROM fp_sales_rep_unified
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (group) {
      query += ` AND group_name ILIKE $${paramIndex++}`;
      params.push(`%${group}%`);
    }
    
    query += ` ORDER BY total_amount_all_time DESC`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting sales reps:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/unified/sales-rep-groups
 * Get aggregated data by sales rep group
 */
router.get('/sales-rep-groups', async (req, res) => {
  try {
    const { year } = req.query;
    
    let query = `
      SELECT 
        group_name,
        COUNT(*) AS rep_count,
        SUM(total_amount_all_time) AS total_amount,
        SUM(total_kgs_all_time) AS total_kgs,
        SUM(total_morm_all_time) AS total_morm,
        SUM(customer_count) AS total_customers
      FROM fp_sales_rep_unified
      GROUP BY group_name
      ORDER BY total_amount DESC
    `;
    
    // If year specified, use materialized view
    if (year) {
      query = `
        SELECT 
          sales_rep_group AS group_name,
          SUM(total_amount) AS total_amount,
          SUM(total_kgs) AS total_kgs,
          SUM(total_morm) AS total_morm
        FROM mv_sales_rep_period_summary
        WHERE year = $1
        GROUP BY sales_rep_group
        ORDER BY total_amount DESC
      `;
    }
    
    const result = year 
      ? await pool.query(query, [year])
      : await pool.query(query);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting sales rep groups:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PRODUCT GROUP ENDPOINTS
// ============================================================

/**
 * GET /api/unified/product-groups
 * Get all product groups from unified table
 */
router.get('/product-groups', async (req, res) => {
  try {
    const { material, process: processType } = req.query;
    
    let query = `
      SELECT 
        id, pg_code, display_name, normalized_name,
        material, process, pg_combined,
        raw_names,
        total_amount_all_time, total_kgs_all_time, total_morm_all_time,
        division, sort_order
      FROM fp_product_group_unified
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (material) {
      query += ` AND material = $${paramIndex++}`;
      params.push(material);
    }
    
    if (processType) {
      query += ` AND process = $${paramIndex++}`;
      params.push(processType);
    }
    
    query += ` ORDER BY sort_order, total_amount_all_time DESC`;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting product groups:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/unified/product-groups/by-material
 * Get product groups aggregated by material type
 */
router.get('/product-groups/by-material', async (req, res) => {
  try {
    const { year } = req.query;
    
    let query;
    
    if (year) {
      query = `
        SELECT 
          pg_combined,
          SUM(total_amount) AS total_amount,
          SUM(total_kgs) AS total_kgs,
          SUM(total_morm) AS total_morm
        FROM mv_product_group_period_summary
        WHERE year = $1
        GROUP BY pg_combined
        ORDER BY total_amount DESC
      `;
    } else {
      query = `
        SELECT 
          pg_combined,
          SUM(total_amount_all_time) AS total_amount,
          SUM(total_kgs_all_time) AS total_kgs,
          SUM(total_morm_all_time) AS total_morm
        FROM fp_product_group_unified
        GROUP BY pg_combined
        ORDER BY total_amount DESC
      `;
    }
    
    const result = year 
      ? await pool.query(query, [year])
      : await pool.query(query);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting product groups by material:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// UNIFIED SALES DATA ENDPOINTS
// ============================================================

/**
 * GET /api/unified/sales
 * Get sales data from unified view with all dimensions
 */
router.get('/sales', async (req, res) => {
  try {
    const { 
      year, 
      month, 
      customer, 
      salesRep, 
      productGroup, 
      country,
      division,
      valuesType = 'AMOUNT',
      groupBy,
      limit = 1000 
    } = req.query;
    
    // Build dynamic query based on groupBy parameter
    let selectClause = '*';
    let groupByClause = '';
    
    if (groupBy) {
      const groupByFields = groupBy.split(',').map(g => g.trim());
      const fieldMap = {
        'customer': 'customer_name_unified',
        'salesRep': 'sales_rep_name',
        'productGroup': 'pgcombine',
        'pgCombined': 'pgcombine',
        'country': 'country',
        'year': 'year',
        'month': 'month_no'
      };

      const unsupported = groupByFields.filter(f => !fieldMap[f]);
      if (unsupported.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Unsupported groupBy fields without unified view: ${unsupported.join(', ')}`
        });
      }

      const mappedFields = groupByFields.map(f => fieldMap[f]);
      const valueColumn = valuesType && String(valuesType).toUpperCase() === 'KGS'
        ? 'qty_kgs'
        : valuesType && String(valuesType).toUpperCase() === 'MORM'
          ? 'morm'
          : 'amount';

      selectClause = mappedFields.join(', ') + `, SUM(${valueColumn}) AS total_value`;
      groupByClause = ` GROUP BY ${mappedFields.join(', ')}`;
    }
    
    let query = `SELECT ${selectClause} FROM fp_actualcommon WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (division) {
      query += ` AND UPPER(TRIM(admin_division_code)) = UPPER($${paramIndex++})`;
      params.push(division);
    }
    
    if (year) {
      query += ` AND year = $${paramIndex++}`;
      params.push(year);
    }
    
    if (month) {
      query += ` AND month_no = $${paramIndex++}`;
      params.push(month);
    }
    
    if (customer) {
      query += ` AND customer_name_unified ILIKE $${paramIndex++}`;
      params.push(`%${customer}%`);
    }
    
    if (salesRep) {
      query += ` AND sales_rep_name ILIKE $${paramIndex++}`;
      params.push(`%${salesRep}%`);
    }
    
    if (productGroup) {
      query += ` AND pgcombine ILIKE $${paramIndex++}`;
      params.push(`%${productGroup}%`);
    }
    
    if (country) {
      query += ` AND country = $${paramIndex++}`;
      params.push(country);
    }
    
    query += groupByClause;
    
    if (groupBy) {
      query += ` ORDER BY total_value DESC`;
    }
    
    query += ` LIMIT $${paramIndex++}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error getting unified sales:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// SUMMARY ENDPOINTS (using materialized views)
// ============================================================

/**
 * GET /api/unified/summary/customers
 * Get customer period summary from materialized view
 */
router.get('/summary/customers', async (req, res) => {
  try {
    const { year, limit = 50 } = req.query;
    
    let query = `
      SELECT * FROM mv_customer_period_summary
    `;
    const params = [];
    
    if (year) {
      query += ` WHERE year = $1`;
      params.push(year);
    }
    
    query += ` ORDER BY total_amount DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting customer summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/unified/summary/sales-reps
 * Get sales rep period summary from materialized view
 */
router.get('/summary/sales-reps', async (req, res) => {
  try {
    const { year, limit = 50 } = req.query;
    
    let query = `
      SELECT * FROM mv_sales_rep_period_summary
    `;
    const params = [];
    
    if (year) {
      query += ` WHERE year = $1`;
      params.push(year);
    }
    
    query += ` ORDER BY total_amount DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting sales rep summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/unified/summary/product-groups
 * Get product group period summary from materialized view
 */
router.get('/summary/product-groups', async (req, res) => {
  try {
    const { year, limit = 50 } = req.query;
    
    let query = `
      SELECT * FROM mv_product_group_period_summary
    `;
    const params = [];
    
    if (year) {
      query += ` WHERE year = $1`;
      params.push(year);
    }
    
    query += ` ORDER BY total_amount DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting product group summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/unified/summary/countries
 * Get country period summary from materialized view
 */
router.get('/summary/countries', async (req, res) => {
  try {
    const { year, limit = 50 } = req.query;
    
    let query = `
      SELECT * FROM mv_country_period_summary
    `;
    const params = [];
    
    if (year) {
      query += ` WHERE year = $1`;
      params.push(year);
    }
    
    query += ` ORDER BY total_amount DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting country summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// METADATA ENDPOINTS
// ============================================================

/**
 * GET /api/unified/metadata
 * Get counts and available filter values
 */
router.get('/metadata', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM fp_customer_unified) AS customer_count,
        (SELECT COUNT(*) FROM fp_sales_rep_unified) AS sales_rep_count,
        (SELECT COUNT(*) FROM fp_product_group_unified) AS product_group_count,
        (SELECT COUNT(*) FROM fp_actualcommon) AS transaction_count,
        (SELECT ARRAY_AGG(DISTINCT year ORDER BY year) FROM fp_actualcommon) AS available_years,
        (SELECT ARRAY_AGG(DISTINCT country ORDER BY country) FROM fp_actualcommon WHERE country IS NOT NULL) AS available_countries,
        (SELECT ARRAY_AGG(DISTINCT material ORDER BY material) FROM fp_product_group_unified) AS available_materials,
        (SELECT ARRAY_AGG(DISTINCT process ORDER BY process) FROM fp_product_group_unified) AS available_processes,
        (SELECT ARRAY_AGG(DISTINCT group_name ORDER BY group_name) FROM fp_sales_rep_unified WHERE group_name IS NOT NULL) AS available_sales_rep_groups
    `);
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting metadata:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
