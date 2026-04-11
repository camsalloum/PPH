/**
 * Check table structure
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

async function checkStructure() {
  try {
    console.log('Checking fp_customer_unified structure:\n');
    
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'fp_customer_unified'
      ORDER BY ordinal_position
    `);
    
    console.log('Columns:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('\n\nSample data with Sojy:');
    const sampleResult = await pool.query(`
      SELECT *
      FROM fp_customer_unified
      WHERE LOWER(sales_rep_group_name) LIKE '%sojy%'
      LIMIT 3
    `);
    
    console.log(JSON.stringify(sampleResult.rows, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkStructure();
