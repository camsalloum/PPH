const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ 
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'fp_database'
});

async function main() {
  try {
    const groupName = 'Sojy & Hisham & Direct Sales';
    const budgetYear = 2026;
    
    // Get budget data
    const budgetResult = await pool.query(`
      SELECT DISTINCT TRIM(customer_name) as customer, TRIM(country) as country, TRIM(pgcombine) as pg
      FROM fp_budget_unified
      WHERE budget_year = $1 
        AND budget_type = 'SALES_REP'
        AND UPPER(TRIM(sales_rep_group_name)) = UPPER(TRIM($2))
      LIMIT 5
    `, [budgetYear, groupName]);
    
    console.log('Budget data (5 rows):');
    budgetResult.rows.forEach(r => console.log(`  customer="${r.customer}" | country="${r.country}" | pg="${r.pg}"`));
    
    // Now simulate the frontend key
    if (budgetResult.rows.length > 0) {
      const r = budgetResult.rows[0];
      console.log('\n--- Sample Key Construction ---');
      console.log(`Backend key format: "${r.customer}|${r.country}|${r.pg}|1"`);
      
      // The actual rows have productGroup (camelCase) from the API response
      console.log(`Frontend getBudgetValue would use: row.customer|row.country|row.productGroup|month`);
      console.log('If productGroup = pg from budget, keys should MATCH');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

main();
