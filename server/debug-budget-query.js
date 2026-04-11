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
    // Get group info for ID 1 (Riad & Nidal)
    const groupId = 1;
    const groupResult = await pool.query(
      `SELECT id, group_name FROM sales_rep_groups WHERE id = $1`,
      [groupId]
    );
    
    if (groupResult.rows.length === 0) {
      console.log('Group not found!');
      return;
    }
    
    const groupInfo = groupResult.rows[0];
    console.log('Group Info:', groupInfo);
    
    // Now query budget with exact same logic as live-budget.js
    const budgetYear = 2026;
    const division = 'FP';
    
    const budgetResult = await pool.query(`
      SELECT DISTINCT ON (customer, country, productgroup, month_no)
        customer, country, productgroup, month_no, mt_value, budget_status, is_prospect, data_source
      FROM (
        SELECT 
          TRIM(customer_name) as customer,
          TRIM(country) as country,
          TRIM(pgcombine) as productgroup,
          month_no,
          qty_kgs / 1000.0 as mt_value,
          budget_status,
          is_prospect,
          data_source,
          CASE 
            WHEN data_source = 'LIVE_ENTRY' THEN 1 
            WHEN data_source = 'HTML_EXPORT' THEN 2 
            ELSE 3 
          END as priority,
          COALESCE(updated_at, created_at, NOW()) as last_update
        FROM fp_budget_unified
        WHERE UPPER(division_code) = UPPER($1)
          AND budget_year = $2
          AND UPPER(TRIM(sales_rep_group_name)) = UPPER(TRIM($3))
          AND budget_type = 'SALES_REP'
      ) sub
      ORDER BY customer, country, productgroup, month_no, priority, last_update DESC
    `, [division, budgetYear, groupInfo.group_name]);
    
    console.log(`\nBudget query returned ${budgetResult.rows.length} rows for "${groupInfo.group_name}"`);
    
    if (budgetResult.rows.length > 0) {
      console.log('\nFirst 5 budget entries:');
      budgetResult.rows.slice(0, 5).forEach(row => {
        console.log(`  ${row.customer} | ${row.country} | ${row.productgroup} | M${row.month_no}: ${row.mt_value} MT`);
      });
    } else {
      // Check what's actually in the budget table
      const checkResult = await pool.query(`
        SELECT DISTINCT sales_rep_group_name, data_source, COUNT(*) as cnt 
        FROM fp_budget_unified 
        WHERE budget_year = 2026 AND budget_type = 'SALES_REP'
        GROUP BY sales_rep_group_name, data_source
      `);
      console.log('\nActual budget data in table:');
      checkResult.rows.forEach(row => {
        console.log(`  "${row.sales_rep_group_name}" (${row.data_source}): ${row.cnt} records`);
      });
      
      // Check if name matching issue
      console.log('\nTrying exact match check:');
      const exactCheck = await pool.query(`
        SELECT COUNT(*) as cnt FROM fp_budget_unified 
        WHERE budget_year = 2026 AND budget_type = 'SALES_REP'
        AND sales_rep_group_name = $1
      `, [groupInfo.group_name]);
      console.log(`  Exact match for "${groupInfo.group_name}": ${exactCheck.rows[0].cnt}`);
      
      const upperCheck = await pool.query(`
        SELECT COUNT(*) as cnt FROM fp_budget_unified 
        WHERE budget_year = 2026 AND budget_type = 'SALES_REP'
        AND UPPER(TRIM(sales_rep_group_name)) = UPPER(TRIM($1))
      `, [groupInfo.group_name]);
      console.log(`  UPPER(TRIM()) match: ${upperCheck.rows[0].cnt}`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

main();
