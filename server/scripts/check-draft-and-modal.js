const { pool } = require('../database/config');

async function checkDraftAndSubmission() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking draft table and recent submissions...\n');
    
    const division = 'FP';
    const salesRep = 'Narek Koroukian';
    const budgetYear = 2026;
    
    // Check draft table
    console.log('📋 Checking DRAFT table:');
    const draftQuery = `
      SELECT COUNT(*) as count, MAX(last_auto_save) as last_save
      FROM sales_rep_budget_draft
      WHERE UPPER(division) = UPPER($1)
        AND UPPER(salesrepname) = UPPER($2)
        AND budget_year = $3
    `;
    const draftResult = await client.query(draftQuery, [division, salesRep, budgetYear]);
    console.log(`  Draft records remaining: ${draftResult.rows[0].count}`);
    console.log(`  Last auto-save: ${draftResult.rows[0].last_save || 'N/A'}`);
    
    // Check final budget table with recent submissions
    console.log('\n📊 Checking FINAL BUDGET table:');
    const finalQuery = `
      SELECT 
        customername,
        countryname,
        productgroup,
        COUNT(*) as record_count,
        MIN(created_at) as first_created,
        MAX(created_at) as last_created,
        MAX(uploaded_at) as last_uploaded
      FROM sales_rep_budget
      WHERE UPPER(division) = UPPER($1)
        AND UPPER(salesrepname) = UPPER($2)
        AND budget_year = $3
        AND UPPER(type) = 'BUDGET'
      GROUP BY customername, countryname, productgroup
      ORDER BY last_created DESC
    `;
    const finalResult = await client.query(finalQuery, [division, salesRep, budgetYear]);
    
    console.log(`\n  Total customer/product combinations: ${finalResult.rows.length}\n`);
    
    finalResult.rows.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.customername} (${row.countryname}) - ${row.productgroup}`);
      console.log(`     Records: ${row.record_count} | Created: ${row.last_created}`);
    });
    
    // Check if any custom rows with new customers
    console.log('\n🆕 NEW CUSTOMERS (not in typical list):');
    const newCustomers = finalResult.rows.filter(row => 
      !['Al Ain Food & Beverages', 'Masafi Co. LLC'].includes(row.customername)
    );
    
    if (newCustomers.length > 0) {
      newCustomers.forEach(row => {
        console.log(`  ✅ ${row.customername} (${row.countryname}) - ${row.productgroup}`);
        console.log(`     This is a NEW custom customer added by you!`);
      });
    } else {
      console.log('  No new custom customers found (only existing ones)');
    }
    
    // Check recent submission timing
    console.log('\n⏰ SUBMISSION TIMING:');
    const timingQuery = `
      SELECT 
        MIN(created_at) as submission_start,
        MAX(created_at) as submission_end,
        COUNT(*) as total_records
      FROM sales_rep_budget
      WHERE UPPER(division) = UPPER($1)
        AND UPPER(salesrepname) = UPPER($2)
        AND budget_year = $3
        AND created_at > NOW() - INTERVAL '10 minutes'
    `;
    const timingResult = await client.query(timingQuery, [division, salesRep, budgetYear]);
    
    if (timingResult.rows[0].total_records > 0) {
      console.log(`  Records submitted in last 10 min: ${timingResult.rows[0].total_records}`);
      console.log(`  Submission time: ${timingResult.rows[0].submission_start}`);
      console.log(`  Duration: ${(new Date(timingResult.rows[0].submission_end) - new Date(timingResult.rows[0].submission_start)) / 1000}s`);
    }
    
    console.log('\n✅ Analysis complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkDraftAndSubmission()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  });
