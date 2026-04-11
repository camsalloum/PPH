/**
 * Run Unified Data Migrations
 * 
 * This script runs all Phase 1 migrations in order:
 * - 300: Customer Unified
 * - 301: Sales Rep Unified
 * - 302: Product Group Unified
 * - 303: Unified Views
 * 
 * Usage: node scripts/run-unified-migrations.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: '***REDACTED***'
});

const migrations = [
  { file: '300_create_unified_customer.sql', name: 'Customer Unified' },
  { file: '301_create_unified_sales_rep.sql', name: 'Sales Rep Unified' },
  { file: '302_create_unified_product_group.sql', name: 'Product Group Unified' },
  { file: '303_create_unified_views.sql', name: 'Unified Views' }
];

async function runMigration(filename, name) {
  const filePath = path.join(__dirname, '..', 'migrations', filename);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${filePath}`);
    return false;
  }
  
  const sql = fs.readFileSync(filePath, 'utf8');
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${name}`);
  console.log(`File: ${filename}`);
  console.log('='.repeat(60));
  
  try {
    await pool.query(sql);
    console.log(`✅ ${name} completed successfully`);
    return true;
  } catch (error) {
    console.error(`❌ ${name} failed:`, error.message);
    return false;
  }
}

async function verifyMigrations() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('VERIFICATION');
  console.log('='.repeat(60));
  
  // Check table counts
  const tables = [
    { name: 'fp_customer_unified', expected: '~563' },
    { name: 'fp_sales_rep_unified', expected: '51' },
    { name: 'fp_product_group_unified', expected: '13-14' }
  ];
  
  for (const t of tables) {
    try {
      const result = await pool.query(`SELECT COUNT(*) FROM ${t.name}`);
      console.log(`✅ ${t.name}: ${result.rows[0].count} rows (expected: ${t.expected})`);
    } catch (e) {
      console.log(`❌ ${t.name}: ${e.message}`);
    }
  }
  
  // Check view
  try {
    const viewResult = await pool.query(`SELECT COUNT(*) FROM vw_unified_sales_data`);
    const excelResult = await pool.query(`SELECT COUNT(*) FROM fp_data_excel`);
    const viewCount = parseInt(viewResult.rows[0].count);
    const excelCount = parseInt(excelResult.rows[0].count);
    const match = viewCount === excelCount ? '✅' : '⚠️';
    console.log(`${match} vw_unified_sales_data: ${viewCount} rows (fp_data_excel: ${excelCount})`);
  } catch (e) {
    console.log(`❌ vw_unified_sales_data: ${e.message}`);
  }
  
  // Check materialized views
  const mvs = [
    'mv_customer_period_summary',
    'mv_sales_rep_period_summary',
    'mv_product_group_period_summary',
    'mv_country_period_summary'
  ];
  
  for (const mv of mvs) {
    try {
      const result = await pool.query(`SELECT COUNT(*) FROM ${mv}`);
      console.log(`✅ ${mv}: ${result.rows[0].count} rows`);
    } catch (e) {
      console.log(`❌ ${mv}: ${e.message}`);
    }
  }
  
  // Check join coverage
  console.log(`\n--- JOIN COVERAGE ---`);
  const coverage = await pool.query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(customer_id) AS with_customer,
      COUNT(sales_rep_id) AS with_sales_rep,
      COUNT(pg_id) AS with_product_group
    FROM vw_unified_sales_data
  `);
  const c = coverage.rows[0];
  console.log(`Total rows: ${c.total}`);
  console.log(`With customer match: ${c.with_customer} (${(c.with_customer/c.total*100).toFixed(1)}%)`);
  console.log(`With sales rep match: ${c.with_sales_rep} (${(c.with_sales_rep/c.total*100).toFixed(1)}%)`);
  console.log(`With product group match: ${c.with_product_group} (${(c.with_product_group/c.total*100).toFixed(1)}%)`);
  
  // Check amounts match
  console.log(`\n--- AMOUNT VERIFICATION ---`);
  const amounts = await pool.query(`
    SELECT 
      (SELECT SUM(values) FROM fp_data_excel WHERE values_type = 'AMOUNT') AS excel_amount,
      (SELECT SUM(values) FROM vw_unified_sales_data WHERE values_type = 'AMOUNT') AS view_amount
  `);
  const a = amounts.rows[0];
  const amountMatch = Math.abs(parseFloat(a.excel_amount) - parseFloat(a.view_amount)) < 1;
  console.log(`Excel total: ${parseFloat(a.excel_amount).toLocaleString()}`);
  console.log(`View total: ${parseFloat(a.view_amount).toLocaleString()}`);
  console.log(`Match: ${amountMatch ? '✅ YES' : '❌ NO'}`);
}

async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  UNIFIED DATA SOURCE - PHASE 1 MIGRATIONS');
  console.log('  Date: ' + new Date().toISOString());
  console.log('█'.repeat(60));
  
  let allSuccess = true;
  
  for (const migration of migrations) {
    const success = await runMigration(migration.file, migration.name);
    if (!success) {
      allSuccess = false;
      console.log(`\n⚠️ Stopping due to migration failure`);
      break;
    }
  }
  
  if (allSuccess) {
    await verifyMigrations();
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(allSuccess ? '✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY' : '❌ MIGRATIONS FAILED');
  console.log('='.repeat(60) + '\n');
  
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  pool.end();
  process.exit(1);
});
