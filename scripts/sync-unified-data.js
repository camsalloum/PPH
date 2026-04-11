/**
 * Unified Data Sync Script
 * 
 * Call this script after external data refresh (e.g., ODC data load)
 * This synchronizes all unified tables with the latest fp_data_excel data
 * 
 * Usage:
 *   node scripts/sync-unified-data.js
 * 
 * Can also be scheduled via Windows Task Scheduler or cron
 */

const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '***REDACTED***'
});

async function syncUnifiedData() {
  const startTime = Date.now();
  
  console.log('\n' + '='.repeat(60));
  console.log('UNIFIED DATA SYNC');
  console.log('Started:', new Date().toISOString());
  console.log('='.repeat(60) + '\n');
  
  try {
    // Run the master sync function
    const result = await pool.query('SELECT * FROM sync_unified_data()');
    const sync = result.rows[0];
    
    console.log('SYNC RESULTS:');
    console.log('-'.repeat(40));
    console.log(`  New Customers:            ${sync.new_customers}`);
    console.log(`  New Sales Reps:           ${sync.new_sales_reps}`);
    console.log(`  New Product Groups:       ${sync.new_product_groups}`);
    console.log(`  Merges Applied:           ${sync.merges_applied}`);
    console.log(`  Ungrouped Sales Reps:     ${sync.ungrouped_sales_reps}`);
    console.log(`  Unmapped Product Groups:  ${sync.unmapped_product_groups}`);
    
    // Show warnings
    if (sync.all_warnings && sync.all_warnings.length > 0) {
      console.log('\n⚠️  WARNINGS (need admin attention):');
      sync.all_warnings.forEach(w => console.log(`    - ${w}`));
    }
    
    // Get current status
    const statusResult = await pool.query('SELECT * FROM get_unified_sync_status()');
    const status = statusResult.rows[0];
    
    console.log('\nCURRENT STATUS:');
    console.log('-'.repeat(40));
    console.log(`  Total Customers:          ${status.total_customers}`);
    console.log(`  Total Sales Reps:         ${status.total_sales_reps}`);
    console.log(`  Total Product Groups:     ${status.total_product_groups}`);
    console.log(`  Merged Customers:         ${status.merged_customers}`);
    console.log(`  Data Coverage:            ${status.data_coverage_pct}%`);
    
    // Log items needing attention
    if (status.items_needing_attention) {
      const attn = status.items_needing_attention;
      
      if (attn.ungrouped_sales_reps?.length > 0) {
        console.log('\n⚠️  UNGROUPED SALES REPS (assign to groups):');
        attn.ungrouped_sales_reps.forEach(sr => {
          console.log(`    - ${sr.name} (${Number(sr.amount).toLocaleString()} AED)`);
        });
      }
      
      if (attn.unmapped_product_groups?.length > 0) {
        console.log('\n⚠️  UNMAPPED PRODUCT GROUPS (set material/process):');
        attn.unmapped_product_groups.forEach(pg => {
          console.log(`    - ${pg.name} (${Number(pg.amount).toLocaleString()} AED)`);
        });
      }
      
      if (attn.orphan_merge_rules?.length > 0) {
        console.log('\n⚠️  ORPHAN MERGE RULES (target customer not found):');
        attn.orphan_merge_rules.forEach(r => {
          console.log(`    - ${r.rule}`);
        });
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n' + '='.repeat(60));
    console.log(`✅ SYNC COMPLETE in ${duration}s`);
    console.log('='.repeat(60) + '\n');
    
    return { success: true, ...sync };
    
  } catch (error) {
    console.error('\n❌ SYNC FAILED:', error.message);
    console.error(error);
    return { success: false, error: error.message };
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  syncUnifiedData()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { syncUnifiedData };
