/**
 * Run Migration 306 - Dynamic Division and Currency Support
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'fp_database',
  max: 5
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Running Migration 306 - Dynamic Division and Currency Support...\n');
    
    // First, enable dblink extension if not exists
    console.log('Enabling dblink extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS dblink');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '306_dynamic_division_currency.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    console.log('Executing migration...');
    await client.query(sql);
    
    console.log('\n✅ Migration 306 completed successfully!\n');
    
    // Verify the new columns
    console.log('Verifying new columns...');
    
    const customerCols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'fp_customer_unified' AND column_name IN ('company_currency', 'division')
    `);
    console.log('fp_customer_unified columns:', customerCols.rows.map(r => r.column_name).join(', '));
    
    const repCols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'fp_sales_rep_unified' AND column_name IN ('company_currency', 'division')
    `);
    console.log('fp_sales_rep_unified columns:', repCols.rows.map(r => r.column_name).join(', '));
    
    // Check current values
    console.log('\nCurrent unified table values:');
    const sample = await client.query(`
      SELECT division, company_currency, COUNT(*) as count 
      FROM fp_customer_unified 
      GROUP BY division, company_currency
    `);
    sample.rows.forEach(r => {
      console.log(`  Customers: division=${r.division}, currency=${r.company_currency}, count=${r.count}`);
    });
    
    const repSample = await client.query(`
      SELECT division, company_currency, COUNT(*) as count 
      FROM fp_sales_rep_unified 
      GROUP BY division, company_currency
    `);
    repSample.rows.forEach(r => {
      console.log(`  Sales Reps: division=${r.division}, currency=${r.company_currency}, count=${r.count}`);
    });
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    if (err.position) {
      console.error('Error position:', err.position);
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().then(() => process.exit(0)).catch(() => process.exit(1));
