/**
 * Run Migration 313 - Create fp_actualrmdata table for raw material data
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '***REDACTED***'
});

async function run() {
  console.log('Running Migration 313: Create fp_actualrmdata table...\n');
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '313_create_fp_actualrmdata.sql'), 'utf8');
    await client.query(sql);
    console.log('✅ fp_actualrmdata table created successfully');
    
    // Verify
    const result = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'fp_actualrmdata' ORDER BY ordinal_position`);
    console.log(`\nTable has ${result.rows.length} columns:`);
    result.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
