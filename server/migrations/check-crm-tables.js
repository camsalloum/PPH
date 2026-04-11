const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'fp_database',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT) || 5432
});

async function checkCRMTables() {
  try {
    // Check all tables
    const allTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('=== ALL Tables in Database ===\n');
    allTables.rows.forEach(r => console.log('  -', r.table_name));
    
    // Check if customer_master table exists
    const cmCheck = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'customer_master'
      ORDER BY ordinal_position
    `);
    
    if (cmCheck.rows.length > 0) {
      console.log('\n=== customer_master table columns ===\n');
      cmCheck.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));
      
      // Count rows
      const count = await pool.query('SELECT COUNT(*) FROM customer_master');
      console.log('\n  Row count:', count.rows[0].count);
    } else {
      console.log('\n  customer_master table does NOT exist\n');
    }
    
    // Check fp_customer_master
    const fpCmCheck = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'fp_customer_master'
      ORDER BY ordinal_position
    `);
    
    if (fpCmCheck.rows.length > 0) {
      console.log('\n=== fp_customer_master table columns ===\n');
      fpCmCheck.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));
      
      // Count rows
      const count = await pool.query('SELECT COUNT(*) FROM fp_customer_master');
      console.log('\n  Row count:', count.rows[0].count);
    } else {
      console.log('\n  fp_customer_master table does NOT exist\n');
    }
    
    // Check lookup tables
    const lookups = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE 'crm_lookup%'
      ORDER BY table_name
    `);
    
    console.log('\n=== CRM Lookup Tables ===\n');
    if (lookups.rows.length === 0) {
      console.log('  No CRM lookup tables found.\n');
    } else {
      for (const r of lookups.rows) {
        const count = await pool.query(`SELECT COUNT(*) FROM ${r.table_name}`);
        console.log(`  - ${r.table_name} (${count.rows[0].count} rows)`);
      }
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

checkCRMTables();
