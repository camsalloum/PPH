/**
 * Run Migration 308 - Complete Unified Data System
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'fp_database',
  max: 5
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  MIGRATION 308 - COMPLETE UNIFIED DATA SYSTEM                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '308_complete_unified_system.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    console.log('Executing migration...');
    await client.query(sql);
    
    console.log('\n✅ Migration 308 completed successfully!\n');
    
    // Verify new columns
    console.log('=== VERIFICATION ===\n');
    
    // Product group unified
    console.log('fp_product_group_unified new columns:');
    const pgCols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'fp_product_group_unified' 
      AND column_name IN ('pg_combine_name', 'raw_pg_mapping')
    `);
    pgCols.rows.forEach(r => console.log(`  ✅ ${r.column_name}`));
    
    // Customer unified
    console.log('\nfp_customer_unified new columns:');
    const custCols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'fp_customer_unified' 
      AND column_name IN ('primary_product_group', 'product_groups')
    `);
    custCols.rows.forEach(r => console.log(`  ✅ ${r.column_name}`));
    
    // Views
    console.log('\nViews created:');
    const views = await client.query(`
      SELECT table_name FROM information_schema.views 
      WHERE table_schema = 'public' AND table_name LIKE '%unified%'
    `);
    views.rows.forEach(r => console.log(`  ✅ ${r.table_name}`));
    
    // Materialized views
    console.log('\nMaterialized views created:');
    const mvs = await client.query(`
      SELECT matviewname FROM pg_matviews WHERE schemaname = 'public'
    `);
    mvs.rows.forEach(r => console.log(`  ✅ ${r.matviewname}`));
    
    // Sample data
    console.log('\n=== SAMPLE DATA ===\n');
    
    const sample = await client.query(`
      SELECT customer_name, sales_rep_group_name, pg_combine, country, 
             SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as amount
      FROM vw_unified_sales_complete
      WHERE year = 2024 AND data_type = 'ACTUAL'
      GROUP BY customer_name, sales_rep_group_name, pg_combine, country
      ORDER BY amount DESC
      LIMIT 5
    `);
    console.log('Top 5 customers from vw_unified_sales_complete (2024 ACTUAL):');
    sample.rows.forEach(r => {
      console.log(`  ${r.customer_name?.substring(0,25)} | ${r.sales_rep_group_name} | ${r.pg_combine} | ${Number(r.amount).toLocaleString()}`);
    });
    
    // Stats
    console.log('\n=== UNIFIED SYSTEM STATS ===\n');
    const stats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM fp_customer_unified) as customers,
        (SELECT COUNT(*) FROM fp_sales_rep_unified) as sales_reps,
        (SELECT COUNT(*) FROM fp_product_group_unified) as product_groups,
        (SELECT COUNT(*) FROM mv_sales_by_customer) as mv_customer_rows,
        (SELECT COUNT(*) FROM mv_sales_by_rep_group) as mv_rep_rows,
        (SELECT COUNT(*) FROM mv_sales_by_product_group) as mv_pg_rows,
        (SELECT COUNT(*) FROM mv_sales_by_country) as mv_country_rows
    `);
    const s = stats.rows[0];
    console.log(`  Customers unified:     ${s.customers}`);
    console.log(`  Sales reps unified:    ${s.sales_reps}`);
    console.log(`  Product groups unified: ${s.product_groups}`);
    console.log(`  MV customer rows:      ${s.mv_customer_rows}`);
    console.log(`  MV rep group rows:     ${s.mv_rep_rows}`);
    console.log(`  MV product group rows: ${s.mv_pg_rows}`);
    console.log(`  MV country rows:       ${s.mv_country_rows}`);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  UNIFIED SYSTEM IS NOW THE SINGLE SOURCE OF TRUTH!           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    if (err.position) {
      console.error('Error position:', err.position);
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().then(() => process.exit(0)).catch(() => process.exit(1));
