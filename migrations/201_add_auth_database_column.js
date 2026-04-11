/**
 * Add auth_database_name column to companies table
 * and update existing data
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    database: 'propackhub_platform',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  
  try {
    console.log('Adding auth_database_name column to companies table...');
    
    // Check if column exists
    const check = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'companies' AND column_name = 'auth_database_name'
    `);
    
    if (check.rows.length === 0) {
      await pool.query(`
        ALTER TABLE companies 
        ADD COLUMN auth_database_name VARCHAR(100)
      `);
      console.log('Column added!');
    } else {
      console.log('Column already exists.');
    }
    
    // Update Interplast to use ip_auth_database as auth database
    await pool.query(`
      UPDATE companies 
      SET auth_database_name = 'ip_auth_database'
      WHERE company_code = 'interplast'
    `);
    console.log('Updated Interplast to use ip_auth_database for auth.');
    
    // Verify
    const verify = await pool.query(`
      SELECT company_code, company_name, database_name, auth_database_name 
      FROM companies
    `);
    console.log('\nCompanies:');
    console.log(JSON.stringify(verify.rows, null, 2));
    
    console.log('\n✅ Migration complete!');
    console.log('- database_name: stores the DATA database (e.g., fp_database)');
    console.log('- auth_database_name: stores the AUTH database with company_settings (e.g., ip_auth_database)');
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  await pool.end();
  process.exit(0);
}

migrate();
