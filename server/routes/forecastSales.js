/**
 * Forecast Sales Routes
 * API endpoints for managing forecast sales data (Base +2 and +3 years)
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

/**
 * Get pool based on division (dynamic - supports any division)
 */
const getPoolForDivision = async (division) => {
  const div = division?.toUpperCase();
  if (!div) return await getDivisionPool('FP');
  // Extract base division code (e.g., FP-UAE -> FP)
  const baseDiv = div.split('-')[0];
  return await getDivisionPool(baseDiv);
};

/**
 * Get table name based on division (dynamic - supports any division)
 */
const getTableName = (division) => {
  const div = division?.toUpperCase();
  if (!div) return 'fp_forecast_sales';
  // Extract base division code and create table name
  const baseDiv = div.split('-')[0].toLowerCase();
  return `${baseDiv}_forecast_sales`;
};

/**
 * GET /api/forecast-sales/:division/:year
 * Get forecast data for a specific division and year
 */
router.get('/:division/:year', async (req, res) => {
  try {
    const { division, year } = req.params;
    const pool = await getPoolForDivision(division);
    const tableName = getTableName(division);

    const query = `
      SELECT 
        product_group,
        kgs,
        sls_per_kg,
        rm_per_kg,
        sales,
        morm_per_kg,
        morm,
        CASE WHEN sales > 0 THEN (morm / sales) * 100 ELSE 0 END as morm_percent
      FROM ${tableName}
      WHERE UPPER(division) = UPPER($1) AND year = $2
      ORDER BY product_group
    `;

    const result = await pool.query(query, [division, parseInt(year)]);

    // Convert to object keyed by product group
    const forecastData = {};
    result.rows.forEach(row => {
      forecastData[row.product_group] = {
        kgs: parseFloat(row.kgs) || 0,
        slsPerKg: parseFloat(row.sls_per_kg) || 0,
        rmPerKg: parseFloat(row.rm_per_kg) || 0,
        sales: parseFloat(row.sales) || 0,
        mormPerKg: parseFloat(row.morm_per_kg) || 0,
        morm: parseFloat(row.morm) || 0,
        mormPercent: parseFloat(row.morm_percent) || 0
      };
    });

    res.json({ 
      success: true, 
      data: forecastData,
      year: parseInt(year),
      division: division.toUpperCase()
    });

  } catch (error) {
    logger.error('Error fetching forecast data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch forecast data' });
  }
});

/**
 * POST /api/forecast-sales/save
 * Save forecast data for multiple product groups
 */
router.post('/save', async (req, res) => {
  try {
    const { division, year, forecasts, createdBy } = req.body;

    if (!division || !year || !forecasts || !Array.isArray(forecasts)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: division, year, forecasts' 
      });
    }

    const pool = await getPoolForDivision(division);
    const tableName = getTableName(division);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      let savedCount = 0;
      for (const forecast of forecasts) {
        const { productGroup, kgs, slsPerKg, rmPerKg } = forecast;

        if (!productGroup) continue;

        // Upsert - insert or update on conflict
        const upsertQuery = `
          INSERT INTO ${tableName} (division, year, product_group, kgs, sls_per_kg, rm_per_kg, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (division, year, product_group)
          DO UPDATE SET 
            kgs = EXCLUDED.kgs,
            sls_per_kg = EXCLUDED.sls_per_kg,
            rm_per_kg = EXCLUDED.rm_per_kg,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `;

        await client.query(upsertQuery, [
          division.toUpperCase(),
          parseInt(year),
          productGroup,
          parseFloat(kgs) || 0,
          parseFloat(slsPerKg) || 0,
          parseFloat(rmPerKg) || 0,
          createdBy || 'system'
        ]);

        savedCount++;
      }

      await client.query('COMMIT');

      logger.info(`Saved ${savedCount} forecast records for ${division} year ${year}`);
      res.json({ 
        success: true, 
        message: `Saved ${savedCount} forecast records`,
        savedCount 
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Error saving forecast data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save forecast data' });
  }
});

/**
 * GET /api/forecast-sales/divisional-budget-totals/:division/:year
 * Get divisional budget totals (sum of all months) by product group from fp_budget_unified
 */
router.get('/divisional-budget-totals/:division/:year', async (req, res) => {
  try {
    const { division, year } = req.params;
    const pool = await getPoolForDivision(division);
    
    // Use fp_budget_unified which is the main budget table
    const baseDiv = division.toUpperCase().split('-')[0].toLowerCase();
    const tableName = `${baseDiv}_budget_unified`;

    // Sum all months for each product group from fp_budget_unified
    const query = `
      SELECT 
        pgcombine as product_group,
        SUM(qty_kgs) as total_kgs,
        SUM(amount) as total_amount,
        SUM(morm) as total_morm
      FROM ${tableName}
      WHERE budget_year = $1
        AND UPPER(division_code) = UPPER($2)
        AND pgcombine IS NOT NULL
        AND TRIM(pgcombine) != ''
        AND budget_type = 'DIVISIONAL'
      GROUP BY pgcombine
      ORDER BY pgcombine
    `;

    const result = await pool.query(query, [parseInt(year), division]);

    // Transform into structured data by product group
    const budgetData = {};
    result.rows.forEach(row => {
      const pg = row.product_group;
      const kgs = parseFloat(row.total_kgs) || 0;
      const sales = parseFloat(row.total_amount) || 0;
      let morm = parseFloat(row.total_morm) || 0;
      
      // For Services Charges, MORM = SALES (100% margin) if MORM is 0
      if (pg && pg.toUpperCase().trim() === 'SERVICES CHARGES' && morm === 0 && sales > 0) {
        morm = sales;
      }
      
      budgetData[pg] = {
        kgs,
        sales,
        morm,
        slsPerKg: kgs > 0 ? sales / kgs : 0,
        mormPerKg: kgs > 0 ? morm / kgs : 0,
        rmPerKg: kgs > 0 ? (sales - morm) / kgs : 0,
        mormPercent: sales > 0 ? (morm / sales) * 100 : 0
      };
    });

    res.json({ 
      success: true, 
      data: budgetData,
      year: parseInt(year),
      division: division.toUpperCase()
    });

  } catch (error) {
    logger.error('Error fetching divisional budget totals', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch divisional budget totals' });
  }
});

module.exports = router;
