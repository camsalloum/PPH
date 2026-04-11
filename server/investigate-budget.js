const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function investigate() {
  console.log('=== 1. Sales Rep Groups ===');
  const groups = await pool.query(`
    SELECT id, group_name, budget_filter, division_code
    FROM sales_rep_groups
    WHERE is_active = true
    ORDER BY group_name
  `);
  groups.rows.forEach(row => {
    console.log(`  ${row.group_name} (id: ${row.id})`);
    console.log(`    budget_filter: "${row.budget_filter || 'NULL'}"`);
    console.log(`    division_code: "${row.division_code}"`);
  });

  console.log('\n=== 2. Budget Data by Sales Rep Name ===');
  const budget = await pool.query(`
    SELECT DISTINCT sales_rep_name, sales_rep_group_name, budget_type, COUNT(*) as cnt
    FROM fp_budget_unified
    WHERE budget_year = 2025
    GROUP BY sales_rep_name, sales_rep_group_name, budget_type
    ORDER BY sales_rep_name
  `);
  budget.rows.forEach(row => {
    console.log(`  ${row.sales_rep_name || 'NULL'} | group: ${row.sales_rep_group_name || 'NULL'} | ${row.budget_type} | ${row.cnt} records`);
  });

  console.log('\n=== 3. Comparing budget_filter with sales_rep_name ===');
  for (const group of groups.rows) {
    const filter = group.budget_filter;
    if (filter) {
      const match = await pool.query(`
        SELECT budget_type, SUM(qty_kgs) as kgs, SUM(amount) as amount
        FROM fp_budget_unified
        WHERE budget_year = 2025 AND UPPER(sales_rep_name) = UPPER($1)
        GROUP BY budget_type
      `, [filter]);
      
      console.log(`\n  ${group.group_name} (budget_filter: "${filter}"):`);
      if (match.rows.length === 0) {
        console.log('    ❌ NO BUDGET DATA FOUND');
        
        // Try to find similar
        const similar = await pool.query(`
          SELECT DISTINCT sales_rep_name
          FROM fp_budget_unified
          WHERE budget_year = 2025 AND sales_rep_name ILIKE $1
        `, ['%' + filter.split(' ')[0] + '%']);
        if (similar.rows.length > 0) {
          console.log('    💡 Similar names found:', similar.rows.map(r => r.sales_rep_name).join(', '));
        }
      } else {
        match.rows.forEach(row => {
          console.log(`    ✅ ${row.budget_type}: ${Math.round(row.kgs || 0)} kgs, ${Math.round(row.amount || 0)} AED`);
        });
      }
    } else {
      console.log(`\n  ${group.group_name}: ⚠️ NO budget_filter SET`);
    }
  }

  process.exit(0);
}

investigate().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
