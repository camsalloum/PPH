const { pool } = require('../database/config');

async function clearNarekBudget() {
  const client = await pool.connect();
  
  try {
    console.log('🗑️  Clearing Narek Koroukian FP 2026 budget...\n');
    
    const division = 'FP';
    const salesRep = 'Narek Koroukian';
    const budgetYear = 2026;
    
    // Clear final budget
    const finalResult = await client.query(`
      DELETE FROM sales_rep_budget
      WHERE UPPER(division) = UPPER($1)
        AND UPPER(salesrepname) = UPPER($2)
        AND budget_year = $3
    `, [division, salesRep, budgetYear]);
    
    console.log(`✅ Deleted ${finalResult.rowCount} records from sales_rep_budget`);
    
    // Clear draft
    const draftResult = await client.query(`
      DELETE FROM sales_rep_budget_draft
      WHERE UPPER(division) = UPPER($1)
        AND UPPER(salesrepname) = UPPER($2)
        AND budget_year = $3
    `, [division, salesRep, budgetYear]);
    
    console.log(`✅ Deleted ${draftResult.rowCount} records from sales_rep_budget_draft`);
    
    console.log('\n✅ Database cleared! Ready for fresh test.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

clearNarekBudget()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  });
