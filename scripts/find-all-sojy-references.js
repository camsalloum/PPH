/**
 * Find ALL references to "Sojy" in ALL tables
 * Search every table in the database for the old group name
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

async function findAllSojyReferences() {
  try {
    console.log('🔍 Finding ALL tables with sales_rep_group columns...\n');
    
    // Find all tables with sales_rep_group_name column
    const tablesResult = await pool.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'sales_rep_group_name'
      ORDER BY table_name
    `);
    
    console.log(`Found ${tablesResult.rows.length} tables with sales_rep_group_name column:\n`);
    
    for (const row of tablesResult.rows) {
      const tableName = row.table_name;
      console.log(`\n=== ${tableName} ===`);
      
      // Check for any Sojy references
      const sojyResult = await pool.query(`
        SELECT 
          sales_rep_group_name,
          sales_rep_group_id,
          COUNT(*) as count
        FROM ${tableName}
        WHERE LOWER(sales_rep_group_name) LIKE '%sojy%'
        GROUP BY sales_rep_group_name, sales_rep_group_id
        ORDER BY sales_rep_group_name
      `);
      
      if (sojyResult.rows.length === 0) {
        console.log('  No Sojy references found');
      } else {
        sojyResult.rows.forEach(r => {
          const status = r.sales_rep_group_id === null ? '❌ NULL ID' : 
                        r.sales_rep_group_id === 6 ? '✅' : '⚠️  Wrong ID';
          console.log(`  ${status} "${r.sales_rep_group_name}" (ID: ${r.sales_rep_group_id}) - ${r.count} records`);
        });
      }
    }
    
    // Also check for tables with sales_rep column (might have individual rep names)
    console.log('\n\n🔍 Checking tables with sales_rep or sales_rep_name columns...\n');
    
    const salesRepTablesResult = await pool.query(`
      SELECT DISTINCT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (column_name LIKE '%sales_rep%' OR column_name LIKE '%salesrep%')
        AND column_name NOT LIKE '%group%'
      ORDER BY table_name, column_name
    `);
    
    console.log(`Found ${salesRepTablesResult.rows.length} columns:\n`);
    salesRepTablesResult.rows.forEach(r => {
      console.log(`  ${r.table_name}.${r.column_name}`);
    });
    
    // Check specifically for "Hisham" in any sales rep related columns
    console.log('\n\n🔍 Searching for "Hisham" in all tables...\n');
    
    for (const row of tablesResult.rows) {
      const tableName = row.table_name;
      
      const hishamResult = await pool.query(`
        SELECT 
          sales_rep_group_name,
          sales_rep_group_id,
          COUNT(*) as count
        FROM ${tableName}
        WHERE LOWER(sales_rep_group_name) LIKE '%hisham%'
        GROUP BY sales_rep_group_name, sales_rep_group_id
      `);
      
      if (hishamResult.rows.length > 0) {
        console.log(`\n❌ Found "Hisham" in ${tableName}:`);
        hishamResult.rows.forEach(r => {
          console.log(`  "${r.sales_rep_group_name}" (ID: ${r.sales_rep_group_id}) - ${r.count} records`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

findAllSojyReferences();
