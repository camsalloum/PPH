const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: 'fp_database'
});

async function debug() {
  try {
    const salesRep = 'Riad & Nidal';
    
    console.log('=== DEBUG: Tracing "Riad & Nidal" data flow ===\n');
    
    // 1. Check if group exists in sales_rep_groups table
    const groupCheck = await pool.query(`
      SELECT id, group_name, division FROM sales_rep_groups 
      WHERE UPPER(group_name) = UPPER($1)
    `, [salesRep]);
    console.log('1. Group in sales_rep_groups:', groupCheck.rows);
    
    // 2. Check members of this group
    if (groupCheck.rows.length > 0) {
      const membersCheck = await pool.query(`
        SELECT member_name FROM sales_rep_group_members 
        WHERE group_id = $1
      `, [groupCheck.rows[0].id]);
      console.log('2. Group members:', membersCheck.rows.map(r => r.member_name));
    }
    
    // 3. Check fp_actualcommon for this sales_rep_group_name
    const actualCheck = await pool.query(`
      SELECT COUNT(*) as count, SUM(qty_kgs) as total_kgs, SUM(amount) as total_amount
      FROM fp_actualcommon 
      WHERE TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($1))
      AND admin_division_code = 'FP'
    `, [salesRep]);
    console.log('3. fp_actualcommon data for group name:', actualCheck.rows[0]);
    
    // 4. Check fp_budget_unified for this sales_rep_group_name
    const budgetCheck = await pool.query(`
      SELECT budget_year, COUNT(*) as count, SUM(qty_kgs) as total_kgs, SUM(amount) as total_amount
      FROM fp_budget_unified 
      WHERE TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($1))
      AND UPPER(budget_type) = 'SALES_REP'
      AND is_budget = true
      GROUP BY budget_year
    `, [salesRep]);
    console.log('4. fp_budget_unified data for group name:', budgetCheck.rows);
    
    // 5. Check product groups for this group
    const pgCheck = await pool.query(`
      SELECT DISTINCT pgcombine, COUNT(*) as count
      FROM fp_actualcommon 
      WHERE TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($1))
      AND admin_division_code = 'FP'
      AND pgcombine IS NOT NULL
      GROUP BY pgcombine
      LIMIT 10
    `, [salesRep]);
    console.log('5. Product groups for this sales rep:', pgCheck.rows);
    
    // 6. Check customers for this group
    const custCheck = await pool.query(`
      SELECT DISTINCT customer_name
      FROM fp_actualcommon 
      WHERE TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($1))
      AND admin_division_code = 'FP'
      AND customer_name IS NOT NULL
      LIMIT 10
    `, [salesRep]);
    console.log('6. Customers for this sales rep:', custCheck.rows.map(r => r.customer_name));
    
    // 7. What sales_rep_group_name values exist?
    const allGroups = await pool.query(`
      SELECT DISTINCT sales_rep_group_name, COUNT(*) as count
      FROM fp_actualcommon 
      WHERE admin_division_code = 'FP'
      AND sales_rep_group_name IS NOT NULL
      GROUP BY sales_rep_group_name
      ORDER BY count DESC
    `);
    console.log('\n7. ALL sales_rep_group_name values in fp_actualcommon:');
    allGroups.rows.forEach(r => console.log(`   - "${r.sales_rep_group_name}": ${r.count} rows`));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

debug();
