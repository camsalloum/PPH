/**
 * Scheduled Task: Refresh Product Group Pricing Materialized View
 * 
 * This task should run nightly to refresh the materialized view with latest data.
 * Can be scheduled via:
 * - Node-cron (in server/index.js)
 * - Windows Task Scheduler
 * - Cron job (Linux)
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function refreshProductGroupPricing() {
  const startTime = Date.now();
  
  try {
    logger.info('🔄 Starting materialized view refresh: fp_product_group_pricing_mv');
    
    // Refresh the materialized view (non-concurrent for now - requires unique index for CONCURRENTLY)
    await pool.query('REFRESH MATERIALIZED VIEW fp_product_group_pricing_mv');
    
    // Get statistics
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT product_group) as product_groups,
        COUNT(DISTINCT year) as years,
        MAX(calculated_at) as last_calculated
      FROM fp_product_group_pricing_mv
    `);
    
    const duration = Date.now() - startTime;
    
    logger.info(`✅ Materialized view refreshed in ${duration}ms`);
    logger.info(`   Rows: ${stats.rows[0].total_rows}`);
    logger.info(`   Product Groups: ${stats.rows[0].product_groups}`);
    logger.info(`   Years: ${stats.rows[0].years}`);
    logger.info(`   Last Calculated: ${stats.rows[0].last_calculated}`);
    
    return {
      success: true,
      duration,
      stats: stats.rows[0]
    };
    
  } catch (error) {
    logger.error('❌ Error refreshing materialized view:', error);
    throw error;
  }
}

// If run directly (not imported)
if (require.main === module) {
  refreshProductGroupPricing()
    .then(result => {
      console.log('✅ Success:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

module.exports = { refreshProductGroupPricing };
