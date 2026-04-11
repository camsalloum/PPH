/**
 * Fix ALL "Sojy & Hisham & Direct Sales" Records
 * Update all tables with the old group name to use the correct current name
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

async function fixAllRecords() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔍 Finding correct group information...\n');
    
    // Find the correct group ID for "Sojy & Direct Sales"
    const groupResult = await client.query(`
      SELECT id, group_name 
      FROM sales_rep_groups 
      WHERE LOWER(group_name) = LOWER('Sojy & Direct Sales')
        AND division = 'FP'
    `);
    
    if (groupResult.rows.length === 0) {
      console.error('❌ Could not find "Sojy & Direct Sales" group!');
      await client.query('ROLLBACK');
      return;
    }
    
    const correctGroupId = groupResult.rows[0].id;
    const correctGroupName = groupResult.rows[0].group_name;
    
    console.log(`✅ Found correct group: "${correctGroupName}" (ID: ${correctGroupId})\n`);
    
    // Tables to update
    const tablesToUpdate = [
      'fp_budget_unified',
      'fp_sales_rep_group_budget_allocation'
    ];
    
    let totalUpdated = 0;
    
    for (const tableName of tablesToUpdate) {
      console.log(`\n📋 Checking ${tableName}...`);
      
      // Check current state
      const checkResult = await client.query(`
        SELECT 
          sales_rep_group_name,
          sales_rep_group_id,
          COUNT(*) as count
        FROM ${tableName}
        WHERE LOWER(sales_rep_group_name) LIKE '%hisham%'
        GROUP BY sales_rep_group_name, sales_rep_group_id
      `);
      
      if (checkResult.rows.length === 0) {
        console.log(`  ✅ No records with "Hisham" found`);
        continue;
      }
      
      checkResult.rows.forEach(row => {
        console.log(`  Found: "${row.sales_rep_group_name}" (ID: ${row.sales_rep_group_id}) - ${row.count} records`);
      });
      
      // Update the records
      const updateResult = await client.query(`
        UPDATE ${tableName}
        SET 
          sales_rep_group_name = $1,
          sales_rep_group_id = $2
        WHERE LOWER(sales_rep_group_name) = LOWER('Sojy & Hisham & Direct Sales')
      `, [correctGroupName, correctGroupId]);
      
      console.log(`  ✅ Updated ${updateResult.rowCount} records`);
      totalUpdated += updateResult.rowCount;
      
      // Verify
      const verifyResult = await client.query(`
        SELECT 
          sales_rep_group_name,
          sales_rep_group_id,
          COUNT(*) as count
        FROM ${tableName}
        WHERE LOWER(sales_rep_group_name) LIKE '%sojy%'
        GROUP BY sales_rep_group_name, sales_rep_group_id
      `);
      
      console.log(`  📊 After update:`);
      verifyResult.rows.forEach(row => {
        const status = row.sales_rep_group_id === correctGroupId ? '✅' : '⚠️';
        console.log(`    ${status} "${row.sales_rep_group_name}" (ID: ${row.sales_rep_group_id}) - ${row.count} records`);
      });
    }
    
    await client.query('COMMIT');
    console.log(`\n\n✅ SUCCESS! Updated ${totalUpdated} total records across all tables.`);
    console.log(`\nAll "Sojy & Hisham & Direct Sales" references have been changed to "${correctGroupName}"`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixAllRecords();
