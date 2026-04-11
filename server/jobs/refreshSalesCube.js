/**
 * Refresh the mv_fp_sales_cube materialized view.
 * Called on server startup, every 5 minutes via interval, and after data imports.
 * Uses advisory lock to prevent concurrent refreshes across server instances.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

let _refreshRunning = false;

async function refreshSalesCube() {
  if (_refreshRunning) {
    logger.info('Sales cube refresh skipped — previous still running');
    return;
  }
  _refreshRunning = true;
  try {
    // Advisory lock (different lock ID from mv_customer_last_txn which uses 8675309)
    const lockResult = await pool.query('SELECT pg_try_advisory_lock(8675310) AS acquired');
    if (!lockResult.rows[0].acquired) {
      logger.info('Sales cube refresh skipped — another instance holds lock');
      return;
    }
    try {
      // Create MV if it doesn't exist yet (first run before migration)
      await pool.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_fp_sales_cube AS
        SELECT
            UPPER(TRIM(admin_division_code))   AS division,
            sales_rep_group_id,
            TRIM(sales_rep_group_name)         AS sales_rep_group_name,
            year, month_no,
            TRIM(month)                        AS month,
            TRIM(customer_name)                AS customer_name,
            TRIM(country)                      AS country,
            TRIM(pgcombine)                    AS product_group,
            ROUND(SUM(amount)::numeric, 2)     AS revenue,
            ROUND(SUM(qty_kgs)::numeric, 2)    AS kgs,
            ROUND(SUM(morm)::numeric, 2)       AS morm,
            COUNT(*)                           AS txn_count
        FROM fp_actualcommon
        WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
        GROUP BY
            UPPER(TRIM(admin_division_code)), sales_rep_group_id,
            TRIM(sales_rep_group_name), year, month_no, TRIM(month),
            TRIM(customer_name), TRIM(country), TRIM(pgcombine)
        WITH DATA
      `);
      // Ensure unique index exists for CONCURRENTLY
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cube_pk
        ON mv_fp_sales_cube (
          division, COALESCE(sales_rep_group_id, -1),
          COALESCE(sales_rep_group_name, ''), year, month_no,
          customer_name, COALESCE(country, ''), COALESCE(product_group, '')
        )
      `);

      const start = Date.now();
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_fp_sales_cube');
      const ms = Date.now() - start;
      logger.info(`Sales cube refresh completed in ${ms}ms`);
      if (ms > 10000) {
        logger.warn('Sales cube refresh exceeded 10s — review base table indexes');
      }
    } finally {
      await pool.query('SELECT pg_advisory_unlock(8675310)');
    }
  } catch (err) {
    logger.warn('Sales cube refresh warning (non-critical)', { error: err.message });
  } finally {
    _refreshRunning = false;
  }
}

module.exports = { refreshSalesCube };
