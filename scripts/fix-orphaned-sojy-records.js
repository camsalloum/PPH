/**
 * Fix Orphaned "Sojy & Hisham & Direct Sales" Records
 * Update the 2 orphaned records in fp_customer_unified to use the correct group
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

async function fixOrphanedRecords() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔍 Finding orphaned "Sojy & Hisham & Direct Sales" records...\n');
    
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
    
    // Find orphaned records in fp_customer_unified
    const orphanedResult = await client.query(`
      SELECT customer_id, display_name, sales_rep_group_name, sales_rep_group_id
      FROM fp_customer_unified
      WHERE LOWER(sales_rep_group_name) = LOWER('Sojy & Hisham & Direct Sales')
    `);
    
    console.log(`Found ${orphanedResult.rows.length} orphaned records:\n`);
    
    orphanedResult.rows.forEach(row => {
      console.log(`  Customer ID: ${row.customer_id} | Customer: ${row.display_name}`);
      console.log(`    Old: "${row.sales_rep_group_name}" (ID: ${row.sales_rep_group_id})`);
      console.log(`    New: "${correctGroupName}" (ID: ${correctGroupId})\n`);
    });
    
    if (orphanedResult.rows.length === 0) {
      console.log('✅ No orphaned records found!');
      await client.query('COMMIT');
      return;
    }
    
    // Update the orphaned records
    const updateResult = await client.query(`
      UPDATE fp_customer_unified
      SET 
        sales_rep_group_name = $1,
        sales_rep_group_id = $2
      WHERE LOWER(sales_rep_group_name) = LOWER('Sojy & Hisham & Direct Sales')
    `, [correctGroupName, correctGroupId]);
    
    console.log(`✅ Updated ${updateResult.rowCount} records successfully!\n`);
    
    // Verify the fix
    const verifyResult = await client.query(`
      SELECT DISTINCT sales_rep_group_name, sales_rep_group_id, COUNT(*) as count
      FROM fp_customer_unified
      WHERE LOWER(sales_rep_group_name) LIKE '%sojy%'
      GROUP BY sales_rep_group_name, sales_rep_group_id
    `);
    
    console.log('📊 Verification - "Sojy" groups in fp_customer_unified:');
    verifyResult.rows.forEach(row => {
      console.log(`  "${row.sales_rep_group_name}" (ID: ${row.sales_rep_group_id}) - ${row.count} records`);
    });
    
    await client.query('COMMIT');
    console.log('\n✅ All done! The orphaned records have been fixed.');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixOrphanedRecords();
