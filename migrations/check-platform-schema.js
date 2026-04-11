/**
 * Check the platform database schema
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');

async function check() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    database: 'propackhub_platform',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  
  try {
    // Get all tables
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    console.log('All tables:', tables.rows.map(r => r.table_name));
    
    // Get companies columns
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'companies' ORDER BY ordinal_position
    `);
    console.log('\ncompanies columns:', cols.rows.map(r => r.column_name));
    
    // Check for company_divisions table
    const cdCols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'company_divisions' ORDER BY ordinal_position
    `);
    console.log('\ncompany_divisions columns:', cdCols.rows.map(r => r.column_name));
    
    // Get company_divisions data
    const cdData = await pool.query('SELECT * FROM company_divisions');
    console.log('\ncompany_divisions data:', JSON.stringify(cdData.rows, null, 2));
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  await pool.end();
  process.exit(0);
}

check();
