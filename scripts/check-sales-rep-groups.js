/**
 * Check Sales Rep Groups
 * Lists all sales rep groups to identify any issues
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

async function checkGroups() {
  try {
    console.log('📋 All Sales Rep Groups:\n');
    
    const result = await pool.query(`
      SELECT 
        id,
        division,
        group_name,
        created_at,
        updated_at,
        (SELECT COUNT(*) FROM sales_rep_group_members WHERE group_id = sales_rep_groups.id) as member_count
      FROM sales_rep_groups
      ORDER BY division, group_name
    `);
    
    console.log(`Total groups: ${result.rows.length}\n`);
    
    let currentDivision = null;
    for (const row of result.rows) {
      if (row.division !== currentDivision) {
        currentDivision = row.division;
        console.log(`\n=== ${currentDivision} ===`);
      }
      console.log(`  ID: ${row.id} | "${row.group_name}" | Members: ${row.member_count}`);
      console.log(`    Created: ${row.created_at} | Updated: ${row.updated_at}`);
    }
    
    // Check for similar names (case-insensitive, trimmed)
    console.log('\n\n🔍 Checking for similar group names...\n');
    
    const similarCheck = await pool.query(`
      SELECT 
        division,
        group_name,
        LOWER(TRIM(group_name)) as normalized,
        COUNT(*) OVER (PARTITION BY division, LOWER(TRIM(group_name))) as similar_count
      FROM sales_rep_groups
      ORDER BY division, normalized
    `);
    
    const potentialDuplicates = similarCheck.rows.filter(r => r.similar_count > 1);
    
    if (potentialDuplicates.length > 0) {
      console.log('⚠️  Found groups with similar names:');
      for (const row of potentialDuplicates) {
        console.log(`  ${row.division}: "${row.group_name}" (normalized: "${row.normalized}")`);
      }
    } else {
      console.log('✅ No similar group names found');
    }
    
    // Check references in actual data
    console.log('\n\n📊 Checking group usage in fp_actualcommon...\n');
    
    const usageCheck = await pool.query(`
      SELECT 
        sales_rep_group_name,
        sales_rep_group_id,
        COUNT(*) as record_count
      FROM fp_actualcommon
      WHERE sales_rep_group_name IS NOT NULL
      GROUP BY sales_rep_group_name, sales_rep_group_id
      ORDER BY sales_rep_group_name
    `);
    
    console.log(`Distinct group references: ${usageCheck.rows.length}\n`);
    
    for (const row of usageCheck.rows) {
      // Check if this group_id exists
      const groupExists = await pool.query(
        'SELECT id, group_name FROM sales_rep_groups WHERE id = $1',
        [row.sales_rep_group_id]
      );
      
      const status = groupExists.rows.length > 0 ? '✅' : '❌ ORPHANED';
      const actualName = groupExists.rows[0]?.group_name || 'N/A';
      
      console.log(`  ${status} "${row.sales_rep_group_name}" (ID: ${row.sales_rep_group_id})`);
      console.log(`      Records: ${row.record_count} | Actual group name: "${actualName}"`);
      
      if (actualName !== row.sales_rep_group_name && groupExists.rows.length > 0) {
        console.log(`      ⚠️  NAME MISMATCH!`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkGroups();
