require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ 
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fp_database'
});

async function check() {
  console.log('=== Checking Al Manhal in both tables ===');
  
  // Check fp_actualcommon
  const actual = await pool.query(`
    SELECT DISTINCT customer_name
    FROM fp_actualcommon 
    WHERE LOWER(customer_name) LIKE '%al manhal%w%l%'
    AND UPPER(sales_rep_group_name) = 'RIAD & NIDAL'
    ORDER BY customer_name
  `);
  
  console.log('\n=== Al Manhal in fp_actualcommon ===');
  actual.rows.forEach(r => console.log(`"${r.customer_name}"`));
  
  // Check fp_budget_unified
  const budget = await pool.query(`
    SELECT DISTINCT customer_name
    FROM fp_budget_unified 
    WHERE LOWER(customer_name) LIKE '%al manhal%w%l%'
    AND UPPER(sales_rep_group_name) = 'RIAD & NIDAL'
    ORDER BY customer_name
  `);
  
  console.log('\n=== Al Manhal in fp_budget_unified ===');
  budget.rows.forEach(r => console.log(`"${r.customer_name}"`));
  
  // Check the query that returns to frontend (simulated)
  const kgsResult = await pool.query(`
    SELECT 
      MIN(TRIM(d.customer_name)) as customername,
      LOWER(TRIM(d.customer_name)) as groupkey
    FROM fp_actualcommon d
    WHERE LOWER(d.customer_name) LIKE '%al manhal%w%l%'
    AND TRIM(UPPER(d.sales_rep_group_name)) = 'RIAD & NIDAL' 
    GROUP BY LOWER(TRIM(d.customer_name))
  `);
  
  console.log('\n=== Actual query result (KGS) ===');
  kgsResult.rows.forEach(r => console.log(`customername: "${r.customername}", groupkey: "${r.groupkey}"`));
  
  const budgetResult = await pool.query(`
    SELECT 
      MIN(TRIM(customer_name)) as customername,
      LOWER(TRIM(customer_name)) as groupkey
    FROM fp_budget_unified
    WHERE LOWER(customer_name) LIKE '%al manhal%w%l%'
    AND TRIM(UPPER(sales_rep_group_name)) = 'RIAD & NIDAL' 
    GROUP BY LOWER(TRIM(customer_name))
  `);
  
  console.log('\n=== Budget query result ===');
  budgetResult.rows.forEach(r => console.log(`customername: "${r.customername}", groupkey: "${r.groupkey}"`));
  
  await pool.end();
}
check();
