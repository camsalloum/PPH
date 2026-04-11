/**
 * DEEP AUDIT: Verify unified data system covers ALL project needs
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'fp_database'
});

async function audit() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  DEEP AUDIT: UNIFIED DATA SYSTEM COMPLETENESS                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const issues = [];
  const coverage = [];

  // 1. Check vw_unified_sales_complete columns
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('1. MASTER VIEW: vw_unified_sales_complete');
  console.log('═══════════════════════════════════════════════════════════════');
  const viewCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'vw_unified_sales_complete'
    ORDER BY ordinal_position
  `);
  console.log('Columns:');
  viewCols.rows.forEach(r => console.log(`   ${r.column_name.padEnd(25)} ${r.data_type}`));
  coverage.push(`✅ Master view has ${viewCols.rows.length} columns`);

  // 2. Check fp_data_excel columns
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('2. SOURCE: fp_data_excel');
  console.log('═══════════════════════════════════════════════════════════════');
  const srcCols = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'fp_data_excel' ORDER BY ordinal_position
  `);
  console.log('Columns:', srcCols.rows.map(r => r.column_name).join(', '));
  
  // Check which fp_data_excel columns are in the view
  const viewColNames = viewCols.rows.map(r => r.column_name);
  const srcColNames = srcCols.rows.map(r => r.column_name);
  const missing = srcColNames.filter(c => !viewColNames.includes(c) && c !== 'id');
  if (missing.length > 0) {
    console.log('\n⚠️  Columns NOT in view:', missing.join(', '));
    issues.push(`fp_data_excel columns not in view: ${missing.join(', ')}`);
  } else {
    coverage.push('✅ All fp_data_excel columns covered');
  }

  // 3. DATA TYPES
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('3. DATA TYPES IN fp_data_excel');
  console.log('═══════════════════════════════════════════════════════════════');
  const types = await pool.query('SELECT DISTINCT data_type, COUNT(*) FROM fp_data_excel GROUP BY data_type ORDER BY data_type');
  types.rows.forEach(r => console.log(`   ${r.data_type.padEnd(15)} ${r.count} rows`));
  coverage.push(`✅ ${types.rows.length} data types: ${types.rows.map(r => r.data_type).join(', ')}`);

  // 4. YEARS
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('4. YEARS COVERAGE');
  console.log('═══════════════════════════════════════════════════════════════');
  const years = await pool.query('SELECT DISTINCT year, COUNT(*) FROM fp_data_excel GROUP BY year ORDER BY year');
  years.rows.forEach(r => console.log(`   ${r.year}: ${r.count} rows`));
  coverage.push(`✅ Years: ${years.rows.map(r => r.year).join(', ')}`);

  // 5. BUDGET TABLES - ARE THEY IN THE VIEW?
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('5. BUDGET DATA CHECK');
  console.log('═══════════════════════════════════════════════════════════════');
  const budgetTables = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%budget%'
  `);
  console.log('Budget tables found:');
  budgetTables.rows.forEach(r => console.log(`   - ${r.table_name}`));
  
  // Check if budget data is in fp_data_excel
  const budgetInExcel = await pool.query(`
    SELECT COUNT(*) as cnt FROM fp_data_excel WHERE LOWER(data_type) LIKE '%budget%'
  `);
  console.log(`\nBudget rows in fp_data_excel: ${budgetInExcel.rows[0].cnt}`);
  
  if (parseInt(budgetInExcel.rows[0].cnt) > 0) {
    coverage.push('✅ Budget data is IN fp_data_excel (flows through view)');
  } else {
    // Check separate budget table
    const sepBudget = await pool.query(`SELECT COUNT(*) FROM fp_divisional_budget`).catch(() => ({rows:[{count:0}]}));
    if (sepBudget.rows[0].count > 0) {
      issues.push('⚠️  Budget data is in SEPARATE table (fp_divisional_budget), NOT in unified view!');
      console.log(`\n⚠️  fp_divisional_budget has ${sepBudget.rows[0].count} rows - NOT IN UNIFIED VIEW!`);
    }
  }

  // 6. COUNTRY/CURRENCY
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('6. COUNTRY & CURRENCY CHECK');
  console.log('═══════════════════════════════════════════════════════════════');
  const masterCountries = await pool.query(`SELECT COUNT(*) FROM master_countries`).catch(() => ({rows:[{count:0}]}));
  console.log(`master_countries: ${masterCountries.rows[0].count} rows`);
  
  // Check if country enrichment is in view
  if (viewColNames.includes('country')) {
    coverage.push('✅ Country column in view');
  } else {
    issues.push('❌ Country NOT in unified view');
  }
  
  // Check currency rates
  const rates = await pool.query(`SELECT COUNT(*) FROM exchange_rates`).catch(() => ({rows:[{count:0}]}));
  console.log(`exchange_rates: ${rates.rows[0].count} rows`);
  if (parseInt(rates.rows[0].count) > 0) {
    // Is it in the view?
    if (!viewColNames.includes('exchange_rate') && !viewColNames.includes('converted_amount')) {
      issues.push('⚠️  Exchange rates exist but NOT joined in unified view');
      console.log('⚠️  exchange_rates NOT joined in unified view!');
    }
  }

  // 7. MATERIAL/PROCESS
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('7. MATERIAL & PROCESS CHECK');
  console.log('═══════════════════════════════════════════════════════════════');
  const matPerc = await pool.query(`SELECT COUNT(*) FROM fp_material_percentages`).catch(() => ({rows:[{count:0}]}));
  console.log(`fp_material_percentages: ${matPerc.rows[0].count} rows`);
  
  // Check if material_process is in view
  if (viewColNames.includes('material_process')) {
    coverage.push('✅ material_process in view');
  }
  
  // 8. SALES REP GROUPING
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('8. SALES REP GROUPING CHECK');
  console.log('═══════════════════════════════════════════════════════════════');
  if (viewColNames.includes('sales_rep_group_name') || viewColNames.includes('rep_group_name')) {
    coverage.push('✅ Sales rep group name in view');
    console.log('✅ Sales rep group name IS in unified view');
  } else {
    issues.push('❌ Sales rep group name NOT in unified view');
    console.log('❌ Sales rep group name NOT in view!');
  }

  // 9. PRODUCT GROUP -> PG_COMBINE
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('9. PRODUCT GROUP -> PG_COMBINE CHECK');
  console.log('═══════════════════════════════════════════════════════════════');
  if (viewColNames.includes('pg_combine')) {
    coverage.push('✅ pg_combine (grouped product group) in view');
    console.log('✅ pg_combine IS in unified view');
  } else {
    issues.push('❌ pg_combine NOT in unified view');
    console.log('❌ pg_combine NOT in view!');
  }

  // 10. CUSTOMER MERGING
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('10. CUSTOMER MERGING CHECK');
  console.log('═══════════════════════════════════════════════════════════════');
  // Check if merged customer name is in view
  const mergeCheck = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'vw_unified_sales_complete' 
    AND column_name IN ('merged_customer_name', 'customer_name', 'display_name')
  `);
  console.log('Customer columns in view:', mergeCheck.rows.map(r => r.column_name).join(', '));
  
  // 11. CHECK VIEW DEFINITION
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('11. VIEW DEFINITION (first 2000 chars)');
  console.log('═══════════════════════════════════════════════════════════════');
  const viewDef = await pool.query(`
    SELECT pg_get_viewdef('vw_unified_sales_complete', true) as def
  `);
  console.log(viewDef.rows[0].def.substring(0, 2000));

  // 12. TEST QUERY
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('12. TEST QUERY - Sample from unified view');
  console.log('═══════════════════════════════════════════════════════════════');
  const sample = await pool.query(`
    SELECT * FROM vw_unified_sales_complete LIMIT 1
  `);
  if (sample.rows.length > 0) {
    console.log('Sample row keys:', Object.keys(sample.rows[0]).join(', '));
  }

  // SUMMARY
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  AUDIT SUMMARY                                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  console.log('\n✅ COVERAGE:');
  coverage.forEach(c => console.log('   ' + c));
  
  if (issues.length > 0) {
    console.log('\n⚠️  ISSUES FOUND:');
    issues.forEach(i => console.log('   ' + i));
  } else {
    console.log('\n🎉 NO ISSUES FOUND - Unified system is complete!');
  }

  await pool.end();
}

audit().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
