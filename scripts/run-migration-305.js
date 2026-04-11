/**
 * Run Migration 305 - Complete Dynamic Sync System
 * 
 * This fixes ALL gaps found in the audit:
 * 1. Customer merging now syncs from fp_division_customer_merge_rules
 * 2. Sales rep group changes propagate to unified table
 * 3. New product groups auto-add to fp_raw_product_groups
 * 4. Returns detailed warnings for items needing admin attention
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
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION 305: Complete Dynamic Sync System');
    console.log('='.repeat(60) + '\n');
    
    // Read and execute migration
    const migrationPath = path.join(__dirname, '..', 'migrations', '305_complete_dynamic_sync.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Executing migration SQL...\n');
    await client.query(sql);
    console.log('✅ Migration 305 executed successfully\n');
    
    // Test the complete sync
    console.log('-'.repeat(60));
    console.log('Testing sync_unified_data()...');
    console.log('-'.repeat(60) + '\n');
    
    const syncResult = await client.query('SELECT * FROM sync_unified_data()');
    const sync = syncResult.rows[0];
    
    console.log('Sync Results:');
    console.log(`  New Customers:            ${sync.new_customers}`);
    console.log(`  New Sales Reps:           ${sync.new_sales_reps}`);
    console.log(`  New Product Groups:       ${sync.new_product_groups}`);
    console.log(`  Merges Applied:           ${sync.merges_applied}`);
    console.log(`  Ungrouped Sales Reps:     ${sync.ungrouped_sales_reps}`);
    console.log(`  Unmapped Product Groups:  ${sync.unmapped_product_groups}`);
    console.log(`  Sync Time:                ${sync.sync_time}`);
    
    if (sync.all_warnings && sync.all_warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      sync.all_warnings.forEach(w => console.log(`    - ${w}`));
    }
    
    // Get status
    console.log('\n' + '-'.repeat(60));
    console.log('Checking get_unified_sync_status()...');
    console.log('-'.repeat(60) + '\n');
    
    const statusResult = await client.query('SELECT * FROM get_unified_sync_status()');
    const status = statusResult.rows[0];
    
    console.log('Current Status:');
    console.log(`  Total Customers:          ${status.total_customers}`);
    console.log(`  Total Sales Reps:         ${status.total_sales_reps}`);
    console.log(`  Total Product Groups:     ${status.total_product_groups}`);
    console.log(`  Merged Customers:         ${status.merged_customers}`);
    console.log(`  Ungrouped Sales Reps:     ${status.ungrouped_sales_reps}`);
    console.log(`  Unmapped Product Groups:  ${status.unmapped_product_groups}`);
    console.log(`  Data Coverage:            ${status.data_coverage_pct}%`);
    
    if (status.items_needing_attention) {
      const attn = status.items_needing_attention;
      
      if (attn.ungrouped_sales_reps && attn.ungrouped_sales_reps.length > 0) {
        console.log('\n⚠️  Ungrouped Sales Reps (need group assignment):');
        attn.ungrouped_sales_reps.forEach(sr => {
          console.log(`    - ${sr.name} (${Number(sr.amount).toLocaleString()} AED)`);
        });
      }
      
      if (attn.unmapped_product_groups && attn.unmapped_product_groups.length > 0) {
        console.log('\n⚠️  Unmapped Product Groups (need material/process):');
        attn.unmapped_product_groups.forEach(pg => {
          console.log(`    - ${pg.name} (${Number(pg.amount).toLocaleString()} AED)`);
        });
      }
      
      if (attn.orphan_merge_rules && attn.orphan_merge_rules.length > 0) {
        console.log('\n⚠️  Orphan Merge Rules (target customer not found):');
        attn.orphan_merge_rules.forEach(r => {
          console.log(`    - ${r.rule}`);
        });
      }
    }
    
    // Verify data integrity
    console.log('\n' + '-'.repeat(60));
    console.log('Verifying Data Integrity...');
    console.log('-'.repeat(60) + '\n');
    
    const integrityResult = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM fp_data_excel) AS raw_rows,
        (SELECT COUNT(*) FROM vw_unified_sales_data) AS view_rows,
        (SELECT COUNT(*) FROM vw_unified_sales_data WHERE customer_id IS NOT NULL) AS with_customer,
        (SELECT COUNT(*) FROM vw_unified_sales_data WHERE sales_rep_id IS NOT NULL) AS with_sales_rep,
        (SELECT COUNT(*) FROM vw_unified_sales_data WHERE pg_id IS NOT NULL) AS with_product_group
    `);
    const integrity = integrityResult.rows[0];
    
    console.log(`  Raw Data Rows:        ${integrity.raw_rows}`);
    console.log(`  Unified View Rows:    ${integrity.view_rows}`);
    console.log(`  With Customer Match:  ${integrity.with_customer} (${(integrity.with_customer / integrity.raw_rows * 100).toFixed(1)}%)`);
    console.log(`  With Sales Rep Match: ${integrity.with_sales_rep} (${(integrity.with_sales_rep / integrity.raw_rows * 100).toFixed(1)}%)`);
    console.log(`  With Product Group:   ${integrity.with_product_group} (${(integrity.with_product_group / integrity.raw_rows * 100).toFixed(1)}%)`);
    
    const allMatch = integrity.raw_rows === integrity.view_rows;
    console.log(`\n  Row Count Match: ${allMatch ? '✅ YES' : '❌ NO'}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION 305 COMPLETE - DYNAMIC SYNC SYSTEM READY');
    console.log('='.repeat(60) + '\n');
    
    console.log('WHAT TO DO NEXT:');
    console.log('');
    console.log('1. After uploading new data to fp_data_excel:');
    console.log('   SELECT * FROM sync_unified_data();');
    console.log('');
    console.log('2. After changing sales rep groups:');
    console.log('   SELECT * FROM sync_sales_rep_groups_to_unified();');
    console.log('');
    console.log('3. After creating/changing customer merges:');
    console.log('   SELECT * FROM sync_customer_merges_to_unified();');
    console.log('');
    console.log('4. To check what needs admin attention:');
    console.log('   SELECT * FROM get_unified_sync_status();');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
