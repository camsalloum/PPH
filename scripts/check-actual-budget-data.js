/**
 * Check Sales Rep Group Names in Actual and Budget Data
 * Find where old group names still exist in the data tables
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function checkData() {
  try {
    console.log('🔍 Checking sales rep group names in actual and budget data...\n');
    
    // Check fp_actualcommon
    console.log('=== fp_actualcommon ===');
    const actualResult = await pool.query(`
      SELECT 
        sales_rep_group_name,
        sales_rep_group_id,
        COUNT(*) as record_count
      FROM fp_actualcommon
      WHERE sales_rep_group_name IS NOT NULL
        AND sales_rep_group_name != ''
      GROUP BY sales_rep_group_name, sales_rep_group_id
      ORDER BY sales_rep_group_name
    `);
    
    console.log(`Total distinct groups in fp_actualcommon: ${actualResult.rows.length}\n`);
    
    for (const row of actualResult.rows) {
      // Check if this group exists in sales_rep_groups
      const groupCheck = await pool.query(
        'SELECT id, group_name FROM sales_rep_groups WHERE id = $1',
        [row.sales_rep_group_id]
      );
      
      const exists = groupCheck.rows.length > 0;
      const actualGroupName = groupCheck.rows[0]?.group_name;
      const status = exists ? '✅' : '❌ ORPHANED';
      
      console.log(`${status} "${row.sales_rep_group_name}" (ID: ${row.sales_rep_group_id})`);
      console.log(`    Records: ${row.record_count}`);
      
      if (exists && actualGroupName !== row.sales_rep_group_name) {
        console.log(`    ⚠️  MISMATCH! Actual group name is: "${actualGroupName}"`);
        console.log(`    📝 Need to update ${row.record_count} records`);
      }
      console.log('');
    }
    
    // Check fp_customer_unified
    console.log('\n=== fp_customer_unified ===');
    const customerResult = await pool.query(`
      SELECT 
        sales_rep_group_name,
        sales_rep_group_id,
        COUNT(*) as record_count
      FROM fp_customer_unified
      WHERE sales_rep_group_name IS NOT NULL
        AND sales_rep_group_name != ''
      GROUP BY sales_rep_group_name, sales_rep_group_id
      ORDER BY sales_rep_group_name
    `);
    
    console.log(`Total distinct groups in fp_customer_unified: ${customerResult.rows.length}\n`);
    
    for (const row of customerResult.rows) {
      const groupCheck = await pool.query(
        'SELECT id, group_name FROM sales_rep_groups WHERE id = $1',
        [row.sales_rep_group_id]
      );
      
      const exists = groupCheck.rows.length > 0;
      const actualGroupName = groupCheck.rows[0]?.group_name;
      const status = exists ? '✅' : '❌ ORPHANED';
      
      console.log(`${status} "${row.sales_rep_group_name}" (ID: ${row.sales_rep_group_id})`);
      console.log(`    Records: ${row.record_count}`);
      
      if (exists && actualGroupName !== row.sales_rep_group_name) {
        console.log(`    ⚠️  MISMATCH! Actual group name is: "${actualGroupName}"`);
        console.log(`    📝 Need to update ${row.record_count} records`);
      }
      console.log('');
    }
    
    // Check fp_budget_customer_unified
    console.log('\n=== fp_budget_customer_unified ===');
    const budgetResult = await pool.query(`
      SELECT 
        sales_rep_group_name,
        sales_rep_group_id,
        COUNT(*) as record_count
      FROM fp_budget_customer_unified
      WHERE sales_rep_group_name IS NOT NULL
        AND sales_rep_group_name != ''
      GROUP BY sales_rep_group_name, sales_rep_group_id
      ORDER BY sales_rep_group_name
    `);
    
    console.log(`Total distinct groups in fp_budget_customer_unified: ${budgetResult.rows.length}\n`);
    
    for (const row of budgetResult.rows) {
      const groupCheck = await pool.query(
        'SELECT id, group_name FROM sales_rep_groups WHERE id = $1',
        [row.sales_rep_group_id]
      );
      
      const exists = groupCheck.rows.length > 0;
      const actualGroupName = groupCheck.rows[0]?.group_name;
      const status = exists ? '✅' : '❌ ORPHANED';
      
      console.log(`${status} "${row.sales_rep_group_name}" (ID: ${row.sales_rep_group_id})`);
      console.log(`    Records: ${row.record_count}`);
      
      if (exists && actualGroupName !== row.sales_rep_group_name) {
        console.log(`    ⚠️  MISMATCH! Actual group name is: "${actualGroupName}"`);
        console.log(`    📝 Need to update ${row.record_count} records`);
      }
      console.log('');
    }
    
    // Check for "Sojy" specifically
    console.log('\n=== Searching for "Sojy" variations ===');
    
    const sojyActual = await pool.query(`
      SELECT DISTINCT sales_rep_group_name, sales_rep_group_id, COUNT(*) as count
      FROM fp_actualcommon
      WHERE LOWER(sales_rep_group_name) LIKE '%sojy%'
      GROUP BY sales_rep_group_name, sales_rep_group_id
    `);
    
    console.log('\nIn fp_actualcommon:');
    sojyActual.rows.forEach(row => {
      console.log(`  "${row.sales_rep_group_name}" (ID: ${row.sales_rep_group_id}) - ${row.count} records`);
    });
    
    const sojyCustomer = await pool.query(`
      SELECT DISTINCT sales_rep_group_name, sales_rep_group_id, COUNT(*) as count
      FROM fp_customer_unified
      WHERE LOWER(sales_rep_group_name) LIKE '%sojy%'
      GROUP BY sales_rep_group_name, sales_rep_group_id
    `);
    
    console.log('\nIn fp_customer_unified:');
    sojyCustomer.rows.forEach(row => {
      console.log(`  "${row.sales_rep_group_name}" (ID: ${row.sales_rep_group_id}) - ${row.count} records`);
    });
    
    const sojyBudget = await pool.query(`
      SELECT DISTINCT sales_rep_group_name, sales_rep_group_id, COUNT(*) as count
      FROM fp_budget_customer_unified
      WHERE LOWER(sales_rep_group_name) LIKE '%sojy%'
      GROUP BY sales_rep_group_name, sales_rep_group_id
    `);
    
    console.log('\nIn fp_budget_customer_unified:');
    sojyBudget.rows.forEach(row => {
      console.log(`  "${row.sales_rep_group_name}" (ID: ${row.sales_rep_group_id}) - ${row.count} records`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkData();
