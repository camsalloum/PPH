/**
 * CRM Prospects Service
 * Handles prospect lifecycle: creation, tracking, conversion detection, metrics
 * 
 * Prospect Lifecycle:
 * 1. LEAD - Initial contact/interest (from CRM direct entry)
 * 2. PROSPECT - In budget planning, no actual sales yet
 * 3. CONVERTED - Has actual sales, became a real customer
 */

const logger = require('../utils/logger');
const { pool } = require('../database/config');
const { notifyProspectConverted } = require('./crmNotificationService');

// ============================================================================
// PROSPECT STATUS CONSTANTS
// ============================================================================

const PROSPECT_STATUS = {
  LEAD: 'lead',           // Just added to CRM, not budgeted
  PROSPECT: 'prospect',   // In budget, no actual sales
  CONVERTED: 'converted', // Has actual sales!
  INACTIVE: 'inactive'    // Marked as lost/inactive
};

function normalizeSalesRepFilters(salesRep) {
  if (Array.isArray(salesRep)) {
    return [...new Set(
      salesRep
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .map((v) => v.toUpperCase())
    )];
  }
  return [];
}

// ============================================================================
// CREATE PROSPECT (Direct from CRM - not from budget)
// ============================================================================

/**
 * Create a new prospect directly from CRM
 * @param {Object} prospectData - { customer_name, country, sales_rep_group, division, notes }
 * @param {string} createdBy - User ID who created
 */
async function createProspect(prospectData, createdBy) {
  const { customer_name, country, sales_rep_group, division = 'FP', notes = '', source = 'other', competitor_notes = '' } = prospectData;
  
  // Validate required fields
  if (!customer_name || !country || !sales_rep_group) {
    throw new Error('Missing required fields: customer_name, country, sales_rep_group');
  }
  
  const currentYear = new Date().getFullYear();
  
  try {
    // Check if already exists (unique by: customer_name, division, country, sales_rep_group)
    const existsCheck = await pool.query(`
      SELECT id, status FROM fp_prospects 
      WHERE UPPER(TRIM(customer_name)) = UPPER(TRIM($1))
        AND UPPER(division) = UPPER($2)
        AND UPPER(TRIM(country)) = UPPER(TRIM($3))
        AND UPPER(TRIM(sales_rep_group)) = UPPER(TRIM($4))
    `, [customer_name, division, country, sales_rep_group]);
    
    if (existsCheck.rows.length > 0) {
      return {
        success: false,
        error: 'Prospect already exists',
        existing: existsCheck.rows[0]
      };
    }
    
    // Insert new prospect with LEAD status (not from budget)
    const result = await pool.query(`
      INSERT INTO fp_prospects (
        customer_name, country, sales_rep_group, division, 
        budget_year, status, notes, source_batch_id, source,
        competitor_notes, converted_to_customer, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 
        $5, $6, $7, $8, $9,
        $10, false, NOW(), NOW()
      )
      RETURNING *
    `, [
      customer_name.trim(),
      country.trim(),
      sales_rep_group.trim(),
      division.toUpperCase(),
      currentYear,
      PROSPECT_STATUS.LEAD,  // Direct CRM entry starts as LEAD
      notes,
      `crm-direct-${createdBy}-${Date.now()}`,
      source,
      competitor_notes || null
    ]);
    
    logger.info(`CRM: Created new prospect: ${customer_name} by user ${createdBy}`);
    
    return {
      success: true,
      prospect: result.rows[0]
    };
    
  } catch (error) {
    logger.error('Error creating prospect:', error);
    throw error;
  }
}

// ============================================================================
// DETECT CONVERSIONS - Check which prospects now have actual sales
// ============================================================================

/**
 * Detect prospects that have actual sales and mark them as converted
 * This should be run periodically (after data sync)
 */
async function detectConversions() {
  logger.info('CRM: Starting prospect conversion detection...');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Count total unconverted prospects
    const countRes = await client.query(`
      SELECT COUNT(*) AS total FROM fp_prospects
      WHERE status IN ('lead', 'prospect') AND converted_to_customer = false
    `);
    const checked = parseInt(countRes.rows[0].total, 10);

    // Find prospects that have actual sales
    const convertibleProspects = await client.query(`
      WITH prospect_customers AS (
        SELECT 
          p.id as prospect_id,
          p.customer_name,
          p.country,
          p.sales_rep_group,
          p.division,
          p.budget_year
        FROM fp_prospects p
        WHERE p.status IN ('lead', 'prospect')
          AND p.converted_to_customer = false
      ),
      actual_sales AS (
        SELECT 
          customer_name,
          MIN(year) as first_sale_year,
          MIN(CASE WHEN year = MIN(year) OVER (PARTITION BY customer_name) THEN month END) as first_sale_month,
          SUM(total_value) as total_value,
          SUM(qty_kgs) as total_kgs
        FROM fp_actualcommon
        GROUP BY customer_name
      )
      SELECT 
        pc.prospect_id,
        pc.customer_name,
        pc.country,
        pc.sales_rep_group,
        pc.division,
        a.first_sale_year,
        a.first_sale_month,
        a.total_value,
        a.total_kgs
      FROM prospect_customers pc
      JOIN actual_sales a ON UPPER(TRIM(a.customer_name)) = UPPER(TRIM(pc.customer_name))
    `);
    
    let conversionsCount = 0;
    
    for (const row of convertibleProspects.rows) {
      // Update fp_prospects
      await client.query(`
        UPDATE fp_prospects 
        SET status = $1,
            converted_to_customer = true,
            converted_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
      `, [PROSPECT_STATUS.CONVERTED, row.prospect_id]);
      
      // Log the conversion
      await client.query(`
        INSERT INTO fp_prospect_conversion_log (
          budget_customer_id, actual_customer_id,
          customer_name, converted_from_status, converted_to_status,
          first_actual_sale_date, first_actual_sale_amount, first_actual_sale_kgs,
          conversion_year, sales_rep_name, country, division
        ) VALUES (
          $1, $1,
          $2, 'prospect', 'customer',
          MAKE_DATE($3, COALESCE($4, 1), 1), $5, $6,
          $3, $7, $8, $9
        )
        ON CONFLICT DO NOTHING
      `, [
        row.prospect_id,
        row.customer_name,
        row.first_sale_year,
        row.first_sale_month,
        row.total_value,
        row.total_kgs,
        row.sales_rep_group,
        row.country,
        row.division
      ]);
      
      conversionsCount++;
      logger.info(`CRM: Prospect converted: ${row.customer_name} (first sale: ${row.first_sale_year})`);
      // Notify the assigned sales rep
      notifyProspectConverted({ prospect: row }).catch(() => {});
    }
    
    // Also update is_prospect in fp_budget_unified for converted customers
    await client.query(`
      UPDATE fp_budget_unified 
      SET is_prospect = false, updated_at = NOW()
      WHERE UPPER(TRIM(customer_name)) IN (
        SELECT UPPER(TRIM(customer_name)) 
        FROM fp_prospects 
        WHERE status = 'converted' AND converted_to_customer = true
      )
      AND is_prospect = true
    `);
    
    await client.query('COMMIT');
    
    logger.info(`CRM: Conversion detection complete. ${conversionsCount} new conversions found.`);
    
    return {
      success: true,
      checked,
      converted: conversionsCount,
      message: `${conversionsCount} of ${checked} prospects converted`
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error detecting conversions:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// MANUAL CONVERSION - Mark a prospect as converted manually
// ============================================================================

/**
 * Manually mark a prospect as converted (e.g., first sale not yet synced)
 * @param {number} prospectId - The prospect ID
 * @param {string} reason - Reason/notes for manual conversion
 */
async function manualConvert(prospectId, reason = '') {
  try {
    const result = await pool.query(`
      UPDATE fp_prospects 
      SET status = $1,
          converted_to_customer = true,
          converted_at = NOW(),
          notes = COALESCE(notes, '') || E'\nManual conversion: ' || $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [PROSPECT_STATUS.CONVERTED, reason, prospectId]);
    
    if (result.rows.length === 0) {
      return { success: false, error: 'Prospect not found' };
    }
    
    logger.info(`CRM: Manually converted prospect ${prospectId}: ${result.rows[0].customer_name}`);
    
    return { success: true, prospect: result.rows[0] };
    
  } catch (error) {
    logger.error('Error in manual conversion:', error);
    throw error;
  }
}

// ============================================================================
// UPDATE PROSPECT STATUS
// ============================================================================

/**
 * Update prospect status (e.g., mark as inactive/lost)
 * @param {number} prospectId - The prospect ID
 * @param {string} status - New status
 * @param {string} notes - Optional notes
 */
async function updateProspectStatus(prospectId, status, notes = '') {
  try {
    const validStatuses = Object.values(PROSPECT_STATUS);
    if (!validStatuses.includes(status)) {
      return { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
    }
    
    const result = await pool.query(`
      UPDATE fp_prospects 
      SET status = $1,
          notes = CASE WHEN $2 = '' THEN notes ELSE COALESCE(notes, '') || E'\n' || $2 END,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [status, notes, prospectId]);
    
    if (result.rows.length === 0) {
      return { success: false, error: 'Prospect not found' };
    }
    
    return { success: true, prospect: result.rows[0] };
    
  } catch (error) {
    logger.error('Error updating prospect status:', error);
    throw error;
  }
}

// ============================================================================
// GET CONVERSION METRICS
// ============================================================================

/**
 * Get prospect-to-customer conversion metrics
 * @param {Object} filters - { division, year, salesRep }
 */
async function getConversionMetrics(filters = {}) {
  const { division = 'FP', year, salesRep } = filters;
  const salesRepFilters = normalizeSalesRepFilters(salesRep);
  
  try {
    // Total prospects by status
    let statusQuery = `
      SELECT 
        status,
        COUNT(*) as count
      FROM fp_prospects 
      WHERE UPPER(division) = UPPER($1)
    `;
    const statusParams = [division];
    let paramIndex = 2;
    
    if (year) {
      statusQuery += ` AND budget_year = $${paramIndex++}`;
      statusParams.push(year);
    }
    if (salesRepFilters.length > 0) {
      statusQuery += ` AND UPPER(TRIM(sales_rep_group)) = ANY($${paramIndex++}::text[])`;
      statusParams.push(salesRepFilters);
    } else if (typeof salesRep === 'string' && salesRep.trim()) {
      statusQuery += ` AND UPPER(TRIM(sales_rep_group)) ILIKE '%' || UPPER(TRIM($${paramIndex++})) || '%'`;
      statusParams.push(salesRep.trim());
    }
    statusQuery += ' GROUP BY status';
    
    const statusResult = await pool.query(statusQuery, statusParams);
    
    // Conversion rate
    const metrics = {
      leads: 0,
      prospects: 0,
      converted: 0,
      inactive: 0,
      total: 0,
      conversionRate: 0
    };
    
    statusResult.rows.forEach(row => {
      const count = parseInt(row.count);
      metrics.total += count;
      switch (row.status) {
        case PROSPECT_STATUS.LEAD: metrics.leads = count; break;
        case PROSPECT_STATUS.PROSPECT: metrics.prospects = count; break;
        case PROSPECT_STATUS.CONVERTED: metrics.converted = count; break;
        case PROSPECT_STATUS.INACTIVE: metrics.inactive = count; break;
      }
    });
    
    // Conversion rate = converted / (all except inactive)
    const activePipeline = metrics.leads + metrics.prospects + metrics.converted;
    metrics.conversionRate = activePipeline > 0 
      ? Math.round((metrics.converted / activePipeline) * 100) 
      : 0;
    
    // Recent conversions (last 30 days)
    const recentResult = await pool.query(`
      SELECT 
        customer_name,
        country,
        sales_rep_group,
        converted_at
      FROM fp_prospects 
      WHERE status = 'converted' 
        AND converted_at >= NOW() - INTERVAL '30 days'
        AND UPPER(division) = UPPER($1)
      ORDER BY converted_at DESC
      LIMIT 10
    `, [division]);
    
    // Conversion log stats
    const logStats = await pool.query(`
      SELECT 
        conversion_year,
        COUNT(*) as conversions,
        SUM(first_actual_sale_amount) as total_first_sale_value
      FROM fp_prospect_conversion_log
      WHERE UPPER(division) = UPPER($1)
      GROUP BY conversion_year
      ORDER BY conversion_year DESC
    `, [division]);
    
    return {
      success: true,
      data: {
        metrics,
        recentConversions: recentResult.rows,
        conversionsByYear: logStats.rows
      }
    };
    
  } catch (error) {
    logger.error('Error getting conversion metrics:', error);
    throw error;
  }
}

// ============================================================================
// GET ALL PROSPECTS WITH DETAILS
// ============================================================================

/**
 * Get all prospects with detailed info
 * @param {Object} filters - { division, year, salesRep, status }
 */
async function getAllProspects(filters = {}) {
  const { division = 'FP', year, salesRep, status } = filters;
  const salesRepFilters = normalizeSalesRepFilters(salesRep);
  
  try {
    let query = `
      SELECT 
        p.*,
        COALESCE(
          (SELECT SUM(total_value) FROM fp_actualcommon a 
           WHERE UPPER(TRIM(a.customer_name)) = UPPER(TRIM(p.customer_name))),
          0
        ) as actual_sales_total
      FROM fp_prospects p
      WHERE UPPER(p.division) = UPPER($1)
    `;
    const params = [division];
    let paramIndex = 2;
    
    if (year) {
      query += ` AND p.budget_year = $${paramIndex++}`;
      params.push(year);
    }
    if (salesRepFilters.length > 0) {
      query += ` AND UPPER(TRIM(p.sales_rep_group)) = ANY($${paramIndex++}::text[])`;
      params.push(salesRepFilters);
    } else if (typeof salesRep === 'string' && salesRep.trim()) {
      query += ` AND UPPER(TRIM(p.sales_rep_group)) ILIKE '%' || UPPER(TRIM($${paramIndex++})) || '%'`;
      params.push(salesRep.trim());
    }
    if (status) {
      query += ` AND p.status = $${paramIndex++}`;
      params.push(status);
    }
    
    query += ' ORDER BY p.created_at DESC';
    
    const result = await pool.query(query, params);
    
    return {
      success: true,
      data: result.rows,
      count: result.rows.length
    };
    
  } catch (error) {
    logger.error('Error getting all prospects:', error);
    throw error;
  }
}

module.exports = {
  PROSPECT_STATUS,
  createProspect,
  detectConversions,
  manualConvert,
  updateProspectStatus,
  getConversionMetrics,
  getAllProspects
};
