/**
 * Run Migration 304 - Create sync functions
 * 
 * This adds dynamic sync capabilities so the unified data system
 * automatically updates when new raw data is uploaded.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '***REDACTED***'
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('\n=== Running Migration 304: Create Sync Functions ===\n');
    
    // Read and execute migration
    const migrationPath = path.join(__dirname, '..', 'migrations', '304_create_sync_functions.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await client.query(sql);
    console.log('✅ Migration 304 executed successfully\n');
    
    // Test the sync function
    console.log('--- Testing sync_unified_data() ---\n');
    const syncResult = await client.query('SELECT * FROM sync_unified_data()');
    console.log('Sync Result:');
    console.log(`  New Customers: ${syncResult.rows[0].new_customers}`);
    console.log(`  New Sales Reps: ${syncResult.rows[0].new_sales_reps}`);
    console.log(`  New Product Groups: ${syncResult.rows[0].new_product_groups}`);
    console.log(`  Sync Time: ${syncResult.rows[0].sync_time}\n`);
    
    // Verify counts
    console.log('--- Current Data Counts ---\n');
    
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM fp_customer_unified) AS customers,
        (SELECT COUNT(*) FROM fp_sales_rep_unified) AS sales_reps,
        (SELECT COUNT(*) FROM fp_product_group_unified) AS product_groups,
        (SELECT COUNT(*) FROM fp_data_excel) AS raw_rows,
        (SELECT COUNT(*) FROM vw_unified_sales_data) AS view_rows
    `);
    
    console.log(`  Customers: ${counts.rows[0].customers}`);
    console.log(`  Sales Reps: ${counts.rows[0].sales_reps}`);
    console.log(`  Product Groups: ${counts.rows[0].product_groups}`);
    console.log(`  Raw Data Rows: ${counts.rows[0].raw_rows}`);
    console.log(`  Unified View Rows: ${counts.rows[0].view_rows}`);
    
    const match = counts.rows[0].raw_rows === counts.rows[0].view_rows;
    console.log(`  Match: ${match ? '✅ YES' : '❌ NO'}\n`);
    
    console.log('=== MIGRATION 304 COMPLETE ===\n');
    console.log('The unified data system is now DYNAMIC!\n');
    console.log('When you upload new data to fp_data_excel, call:\n');
    console.log('  SELECT * FROM sync_unified_data();\n');
    console.log('This will:');
    console.log('  1. Add new customers/sales reps/product groups');
    console.log('  2. Update all aggregations');
    console.log('  3. Refresh materialized views\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
