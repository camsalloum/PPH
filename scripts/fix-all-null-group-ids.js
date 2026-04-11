/**
 * Fix ALL NULL sales_rep_group_id records
 * Map group names to their correct IDs from sales_rep_groups table
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

async function fixAllNullGroupIds() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔍 Loading sales rep groups mapping...\n');
    
    // Get all groups with their IDs
    const groupsResult = await client.query(`
      SELECT id, group_name, division
      FROM sales_rep_groups
      ORDER BY division, group_name
    `);
    
    console.log(`Found ${groupsResult.rows.length} groups:\n`);
    groupsResult.rows.forEach(row => {
      console.log(`  ${row.division}: "${row.group_name}" (ID: ${row.id})`);
    });
    
    // Create a mapping for quick lookup (case-insensitive)
    const groupMapping = {};
    groupsResult.rows.forEach(row => {
      const key = `${row.division}:${row.group_name.toLowerCase().trim()}`;
      groupMapping[key] = { id: row.id, name: row.group_name };
    });
    
    console.log('\n\n📋 Fixing fp_budget_unified...\n');
    
    // Get all NULL group_id records
    const nullRecordsResult = await client.query(`
      SELECT 
        sales_rep_group_name,
        division_code as division,
        COUNT(*) as count
      FROM fp_budget_unified
      WHERE sales_rep_group_id IS NULL
        AND sales_rep_group_name IS NOT NULL
        AND sales_rep_group_name != ''
      GROUP BY sales_rep_group_name, division_code
      ORDER BY count DESC
    `);
    
    console.log(`Found ${nullRecordsResult.rows.length} distinct group names with NULL IDs:\n`);
    
    let totalUpdated = 0;
    let notFound = [];
    
    for (const row of nullRecordsResult.rows) {
      const groupName = row.sales_rep_group_name;
      const division = row.division || 'FP';
      const count = parseInt(row.count);
      const key = `${division}:${groupName.toLowerCase().trim()}`;
      
      const mapping = groupMapping[key];
      
      if (mapping) {
        console.log(`✅ "${groupName}" (${division}) - ${count} records → ID: ${mapping.id}`);
        
        // Update records
        const updateResult = await client.query(`
          UPDATE fp_budget_unified
          SET sales_rep_group_id = $1
          WHERE sales_rep_group_name = $2
            AND division_code = $3
            AND sales_rep_group_id IS NULL
        `, [mapping.id, groupName, division]);
        
        totalUpdated += updateResult.rowCount;
        console.log(`   Updated ${updateResult.rowCount} records`);
      } else {
        console.log(`❌ "${groupName}" (${division}) - ${count} records → NOT FOUND in sales_rep_groups!`);
        notFound.push({ groupName, division, count });
      }
    }
    
    // Verify
    console.log('\n\n📊 Verification...\n');
    
    const verifyResult = await client.query(`
      SELECT 
        COUNT(*) as total_null
      FROM fp_budget_unified
      WHERE sales_rep_group_id IS NULL
        AND sales_rep_group_name IS NOT NULL
        AND sales_rep_group_name != ''
    `);
    
    console.log(`Remaining NULL group_ids: ${verifyResult.rows[0].total_null}`);
    
    if (notFound.length > 0) {
      console.log('\n⚠️  Groups not found in sales_rep_groups table:');
      notFound.forEach(item => {
        console.log(`  "${item.groupName}" (${item.division}) - ${item.count} records`);
      });
      console.log('\nThese groups may need to be created in the sales_rep_groups table.');
    }
    
    await client.query('COMMIT');
    console.log(`\n\n✅ SUCCESS! Updated ${totalUpdated} records.`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixAllNullGroupIds();
