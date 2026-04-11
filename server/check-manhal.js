const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.FP_DATABASE_URL });

async function check() {
  // Check fp_budget_unified for Al Manhal entries
  const budget = await pool.query(`
    SELECT DISTINCT customer_name, country, sales_rep_group_name
    FROM fp_budget_unified
    WHERE LOWER(customer_name) LIKE '%manhal%'
    AND budget_year = 2026
    ORDER BY customer_name
  `);
  
  console.log('=== fp_budget_unified (Budget 2026) ===');
  budget.rows.forEach(r => console.log(`  '${r.customer_name}' | ${r.country} | ${r.sales_rep_group_name}`));
  
  // Check fp_actualcommon for Al Manhal entries
  const actual = await pool.query(`
    SELECT DISTINCT customer_name, country, sales_rep_group_name
    FROM fp_actualcommon
    WHERE LOWER(customer_name) LIKE '%manhal%'
    ORDER BY customer_name
  `);
  
  console.log('\n=== fp_actualcommon (Actual) ===');
  actual.rows.forEach(r => console.log(`  '${r.customer_name}' | ${r.country} | ${r.sales_rep_group_name}`));
  
  await pool.end();
}
check().catch(console.error);
