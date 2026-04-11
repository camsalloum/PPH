/**
 * Check if vw_unified_sales_data is a view or table
 * and understand where the NULL group_id is coming from
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

async function checkView() {
  try {
    // Check if it's a view or table
    const typeResult = await pool.query(`
      SELECT table_type
      FROM information_schema.tables
      WHERE table_name = 'vw_unified_sales_data'
    `);
    
    console.log(`vw_unified_sales_data is a: ${typeResult.rows[0]?.table_type}\n`);
    
    if (typeResult.rows[0]?.table_type === 'VIEW') {
      console.log('This is a VIEW - it pulls data from other tables.');
      console.log('The NULL group_id records are likely coming from the source tables.\n');
      
      // Get view definition
      const viewDefResult = await pool.query(`
        SELECT definition
        FROM pg_views
        WHERE viewname = 'vw_unified_sales_data'
      `);
      
      if (viewDefResult.rows.length > 0) {
        console.log('View definition (first 500 chars):');
        console.log(viewDefResult.rows[0].definition.substring(0, 500));
        console.log('...\n');
      }
    } else {
      console.log('This is a TABLE - we can update it directly.\n');
      
      // Sample some NULL records
      const sampleResult = await pool.query(`
        SELECT *
        FROM vw_unified_sales_data
        WHERE sales_rep_group_name = 'Sojy & Direct Sales'
          AND sales_rep_group_id IS NULL
        LIMIT 3
      `);
      
      console.log('Sample records with NULL group_id:');
      console.log(JSON.stringify(sampleResult.rows, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkView();
