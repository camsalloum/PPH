/**
 * Check where company_settings table exists
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');

async function check() {
  const databases = ['ip_auth_database', 'fp_database'];
  
  for (const db of databases) {
    console.log(`\nChecking ${db}...`);
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: 5432,
      database: db,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    
    try {
      const result = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name LIKE '%settings%'
      `);
      console.log('Tables with "settings":', result.rows.map(r => r.table_name));
      
      // Try to read company_settings
      try {
        const cs = await pool.query('SELECT * FROM company_settings LIMIT 1');
        console.log('company_settings data:', JSON.stringify(cs.rows[0], null, 2));
      } catch (e) {
        console.log('company_settings: NOT FOUND');
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
    
    await pool.end();
  }
  
  process.exit(0);
}

check();
