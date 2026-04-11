const { pool } = require('./database/config');

async function analyze() {
  console.log('=== Product Group Exclusion Analysis ===\n');
  
  // 1. Check fp_product_group_unified columns
  console.log('1. fp_product_group_unified columns:');
  const cols = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'fp_product_group_unified'
  `);
  cols.rows.forEach(r => console.log('   - ' + r.column_name));
  
  // 2. Check for tables with exclusion
  console.log('\n2. Tables related to exclusion:');
  const tables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (table_name LIKE '%exclus%' OR table_name LIKE '%exclude%')
  `);
  if (tables.rows.length > 0) {
    tables.rows.forEach(r => console.log('   - ' + r.table_name));
  } else {
    console.log('   (no exclusion tables found)');
  }
  
  // 3. Check ProductPerformanceService - what it excludes
  console.log('\n3. ProductPerformanceService hardcoded excludedCategories:');
  console.log('   - Raw Materials');
  console.log('   - N/A');
  
  // 4. Check fp_pg_mappings for excluded flag
  console.log('\n4. Checking fp_pg_mappings for is_excluded:');
  try {
    const mappingCols = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'fp_pg_mappings'
    `);
    console.log('   Columns:', mappingCols.rows.map(r => r.column_name).join(', '));
    
    // Check for excluded ones
    const excluded = await pool.query(`
      SELECT raw_pg, is_excluded 
      FROM fp_pg_mappings 
      WHERE is_excluded = true
    `);
    if (excluded.rows.length > 0) {
      console.log('   Excluded raw_pg values:');
      excluded.rows.forEach(r => console.log('     - ' + r.raw_pg));
    } else {
      console.log('   No excluded mappings');
    }
  } catch (e) {
    console.log('   Table does not exist or error:', e.message);
  }
  
  // 5. CustomerInsightsService - what it currently excludes
  console.log('\n5. CustomerInsightsService current exclusions:');
  console.log('   - NONE! It queries ALL customers without pgcombine filter');
  console.log('   - This means Raw Materials sales are INCLUDED in customer totals');
  
  await pool.end();
}

analyze();
