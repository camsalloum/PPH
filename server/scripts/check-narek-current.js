const { pool } = require('../database/config');

async function checkNarekBudget() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking Narek Koroukian FP 2026 budget in database...\n');
    
    const division = 'FP';
    const salesRep = 'Narek Koroukian';
    const budgetYear = 2026;
    
    // Check final budget
    const finalQuery = `
      SELECT 
        TRIM(customername) as customer,
        TRIM(countryname) as country,
        TRIM(productgroup) as product,
        month,
        values_type,
        values / 1000.0 as mt_value,
        created_at,
        uploaded_at
      FROM sales_rep_budget
      WHERE UPPER(division) = UPPER($1)
        AND UPPER(salesrepname) = UPPER($2)
        AND budget_year = $3
      ORDER BY customername, month, values_type
    `;
    const finalResult = await client.query(finalQuery, [division, salesRep, budgetYear]);
    
    if (finalResult.rows.length === 0) {
      console.log('❌ No records found in sales_rep_budget table');
    } else {
      console.log(`✅ Found ${finalResult.rows.length} records in sales_rep_budget:\n`);
      
      finalResult.rows.forEach(row => {
        console.log(`  Customer: ${row.customer}`);
        console.log(`  Country: ${row.country}`);
        console.log(`  Product: ${row.product}`);
        console.log(`  Month: ${row.month}`);
        console.log(`  Type: ${row.values_type}`);
        console.log(`  Value: ${row.mt_value} MT`);
        console.log(`  Created: ${row.created_at}`);
        console.log('  ---');
      });
    }
    
    // Check draft
    const draftQuery = `
      SELECT 
        TRIM(customername) as customer,
        TRIM(countryname) as country,
        TRIM(productgroup) as product,
        month,
        values_type,
        values / 1000.0 as mt_value,
        last_auto_save
      FROM sales_rep_budget_draft
      WHERE UPPER(division) = UPPER($1)
        AND UPPER(salesrepname) = UPPER($2)
        AND budget_year = $3
      ORDER BY customername, month
    `;
    const draftResult = await client.query(draftQuery, [division, salesRep, budgetYear]);
    
    console.log(`\n📋 Draft records: ${draftResult.rows.length}`);
    if (draftResult.rows.length > 0) {
      draftResult.rows.forEach(row => {
        console.log(`  ${row.customer} (${row.country}) - ${row.product}`);
        console.log(`    Month ${row.month}: ${row.mt_value} MT`);
        console.log(`    Last save: ${row.last_auto_save}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkNarekBudget()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  });
