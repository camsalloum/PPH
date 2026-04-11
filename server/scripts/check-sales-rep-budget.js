const { pool } = require('../database/config');

async function checkSalesRepBudget() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking sales_rep_budget table...\n');
    
    // Check for Narek Koroukian, FP, 2026
    const division = 'FP';
    const salesRep = 'Narek Koroukian';
    const budgetYear = 2026;
    
    // 1. Count total records
    const countQuery = `
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT customername) as unique_customers,
        COUNT(DISTINCT productgroup) as unique_products,
        COUNT(DISTINCT month) as months_with_data,
        SUM(CASE WHEN values_type = 'KGS' THEN 1 ELSE 0 END) as kgs_records,
        SUM(CASE WHEN values_type = 'Amount' THEN 1 ELSE 0 END) as amount_records,
        SUM(CASE WHEN values_type = 'MoRM' THEN 1 ELSE 0 END) as morm_records
      FROM sales_rep_budget
      WHERE UPPER(division) = UPPER($1)
        AND UPPER(salesrepname) = UPPER($2)
        AND budget_year = $3
        AND UPPER(type) = 'BUDGET'
    `;
    
    const countResult = await client.query(countQuery, [division, salesRep, budgetYear]);
    const stats = countResult.rows[0];
    
    console.log('📊 SUMMARY STATISTICS:');
    console.log('─────────────────────────────────────────');
    console.log(`Division: ${division}`);
    console.log(`Sales Rep: ${salesRep}`);
    console.log(`Budget Year: ${budgetYear}`);
    console.log(`Total Records: ${stats.total_records}`);
    console.log(`Unique Customers: ${stats.unique_customers}`);
    console.log(`Unique Products: ${stats.unique_products}`);
    console.log(`Months with Data: ${stats.months_with_data}`);
    console.log(`KGS Records: ${stats.kgs_records}`);
    console.log(`Amount Records: ${stats.amount_records}`);
    console.log(`MoRM Records: ${stats.morm_records}`);
    console.log('─────────────────────────────────────────\n');
    
    if (parseInt(stats.total_records) === 0) {
      console.log('❌ NO DATA FOUND in sales_rep_budget table!');
      console.log('   The submission may have failed.\n');
      
      // Check draft table
      console.log('🔍 Checking draft table...');
      const draftQuery = `
        SELECT COUNT(*) as draft_count
        FROM sales_rep_budget_draft
        WHERE UPPER(division) = UPPER($1)
          AND UPPER(salesrepname) = UPPER($2)
          AND budget_year = $3
      `;
      const draftResult = await client.query(draftQuery, [division, salesRep, budgetYear]);
      const draftCount = draftResult.rows[0].draft_count;
      
      if (parseInt(draftCount) > 0) {
        console.log(`⚠️ Found ${draftCount} records in DRAFT table`);
        console.log('   This means the data was saved but not yet submitted to final budget.\n');
      } else {
        console.log('❌ No data in draft table either.\n');
      }
      
      return;
    }
    
    // 2. Show sample records
    console.log('📋 SAMPLE RECORDS (first 10):');
    console.log('─────────────────────────────────────────');
    
    const sampleQuery = `
      SELECT 
        id,
        month,
        customername,
        countryname,
        productgroup,
        values_type,
        values,
        material,
        process,
        created_at,
        uploaded_at
      FROM sales_rep_budget
      WHERE UPPER(division) = UPPER($1)
        AND UPPER(salesrepname) = UPPER($2)
        AND budget_year = $3
        AND UPPER(type) = 'BUDGET'
      ORDER BY month, customername, productgroup, values_type
      LIMIT 10
    `;
    
    const sampleResult = await client.query(sampleQuery, [division, salesRep, budgetYear]);
    
    if (sampleResult.rows.length > 0) {
      sampleResult.rows.forEach((row, index) => {
        console.log(`\nRecord ${index + 1}:`);
        console.log(`  Month: ${row.month}`);
        console.log(`  Customer: ${row.customername}`);
        console.log(`  Country: ${row.countryname}`);
        console.log(`  Product: ${row.productgroup}`);
        console.log(`  Type: ${row.values_type}`);
        console.log(`  Value: ${row.values}`);
        console.log(`  Material: ${row.material || '(empty)'}`);
        console.log(`  Process: ${row.process || '(empty)'}`);
        console.log(`  Created: ${row.created_at}`);
        console.log(`  Uploaded: ${row.uploaded_at || '(not from import)'}`);
      });
    }
    
    // 3. Show breakdown by month
    console.log('\n\n📅 BREAKDOWN BY MONTH:');
    console.log('─────────────────────────────────────────');
    
    const monthQuery = `
      SELECT 
        month,
        COUNT(*) as record_count,
        SUM(CASE WHEN values_type = 'KGS' THEN 1 ELSE 0 END) as kgs_count,
        SUM(CASE WHEN values_type = 'Amount' THEN 1 ELSE 0 END) as amount_count,
        SUM(CASE WHEN values_type = 'MoRM' THEN 1 ELSE 0 END) as morm_count,
        SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs
      FROM sales_rep_budget
      WHERE UPPER(division) = UPPER($1)
        AND UPPER(salesrepname) = UPPER($2)
        AND budget_year = $3
        AND UPPER(type) = 'BUDGET'
      GROUP BY month
      ORDER BY month
    `;
    
    const monthResult = await client.query(monthQuery, [division, salesRep, budgetYear]);
    
    monthResult.rows.forEach(row => {
      const monthName = new Date(2024, row.month - 1).toLocaleString('default', { month: 'long' });
      console.log(`\n${monthName} (Month ${row.month}):`);
      console.log(`  Total Records: ${row.record_count}`);
      console.log(`  KGS Records: ${row.kgs_count}`);
      console.log(`  Amount Records: ${row.amount_count}`);
      console.log(`  MoRM Records: ${row.morm_count}`);
      console.log(`  Total KGS: ${parseFloat(row.total_kgs).toLocaleString()}`);
    });
    
    // 4. Check for specific customer mentioned in logs
    console.log('\n\n🔍 CHECKING SPECIFIC CUSTOMER FROM LOGS:');
    console.log('─────────────────────────────────────────');
    console.log('Looking for: "Al Ain Food & Beverages"');
    
    const customerQuery = `
      SELECT 
        month,
        productgroup,
        values_type,
        values
      FROM sales_rep_budget
      WHERE UPPER(division) = UPPER($1)
        AND UPPER(salesrepname) = UPPER($2)
        AND budget_year = $3
        AND UPPER(customername) LIKE '%AL AIN%'
        AND UPPER(type) = 'BUDGET'
      ORDER BY month, productgroup, values_type
    `;
    
    const customerResult = await client.query(customerQuery, [division, salesRep, budgetYear]);
    
    if (customerResult.rows.length > 0) {
      console.log(`✅ Found ${customerResult.rows.length} records for "Al Ain Food & Beverages":\n`);
      customerResult.rows.forEach(row => {
        console.log(`  Month ${row.month} | ${row.productgroup} | ${row.values_type}: ${row.values}`);
      });
    } else {
      console.log('❌ No records found for "Al Ain Food & Beverages"');
    }
    
    console.log('\n\n✅ Data check complete!');
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    });
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the check
checkSalesRepBudget()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });


















