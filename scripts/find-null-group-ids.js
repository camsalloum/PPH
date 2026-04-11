/**
 * Find all tables with NULL sales_rep_group_id
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

async function findNullGroupIds() {
  try {
    console.log('🔍 Finding tables with NULL sales_rep_group_id...\n');
    
    // Find all tables with sales_rep_group_id column
    const tablesResult = await pool.query(`
      SELECT DISTINCT table_name, table_type
      FROM information_schema.columns c
      JOIN information_schema.tables t USING (table_name, table_schema)
      WHERE table_schema = 'public'
        AND column_name = 'sales_rep_group_id'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log(`Found ${tablesResult.rows.length} BASE TABLES with sales_rep_group_id column:\n`);
    
    for (const row of tablesResult.rows) {
      const tableName = row.table_name;
      
      // Check for NULL group_ids
      const nullResult = await pool.query(`
        SELECT 
          sales_rep_group_name,
          COUNT(*) as count
        FROM ${tableName}
        WHERE sales_rep_group_id IS NULL
          AND sales_rep_group_name IS NOT NULL
          AND sales_rep_group_name != ''
        GROUP BY sales_rep_group_name
        ORDER BY count DESC
      `);
      
      if (nullResult.rows.length > 0) {
        console.log(`\n❌ ${tableName} - ${nullResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0)} records with NULL group_id:`);
        nullResult.rows.forEach(r => {
          console.log(`    "${r.sales_rep_group_name}" - ${r.count} records`);
        });
      } else {
        console.log(`✅ ${tableName} - No NULL group_ids`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

findNullGroupIds();
