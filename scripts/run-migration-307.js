/**
 * Run Migration 307 - Add Sales Rep FK to Customer Unified
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
    console.log('Running Migration 307 - Add Sales Rep FK to Customer Unified...\n');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '307_customer_sales_rep_fk.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    console.log('Executing migration...');
    await client.query(sql);
    
    console.log('\n✅ Migration 307 completed successfully!\n');
    
    // Verify the new columns
    console.log('Verifying new columns in fp_customer_unified...');
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'fp_customer_unified' 
      AND column_name IN ('primary_sales_rep_id', 'sales_rep_group_id', 'sales_rep_group_name')
      ORDER BY ordinal_position
    `);
    cols.rows.forEach(r => console.log(`  ✅ ${r.column_name} (${r.data_type})`));
    
    // Check link status
    console.log('\nSales rep link status:');
    const stats = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE primary_sales_rep_id IS NOT NULL) as linked,
        COUNT(*) FILTER (WHERE primary_sales_rep_id IS NULL AND primary_sales_rep_name IS NOT NULL) as unlinked,
        COUNT(*) FILTER (WHERE primary_sales_rep_name IS NULL) as no_sales_rep
      FROM fp_customer_unified
    `);
    console.log(`  - Linked to sales rep: ${stats.rows[0].linked}`);
    console.log(`  - Unlinked (rep name but no match): ${stats.rows[0].unlinked}`);
    console.log(`  - No sales rep assigned: ${stats.rows[0].no_sales_rep}`);
    
    // Sample data with groups
    console.log('\nSample customers with sales rep groups:');
    const sample = await client.query(`
      SELECT display_name, primary_sales_rep_name, sales_rep_group_name
      FROM fp_customer_unified 
      WHERE sales_rep_group_name IS NOT NULL
      LIMIT 5
    `);
    sample.rows.forEach(r => {
      console.log(`  ${r.display_name?.substring(0,25)} | Rep: ${r.primary_sales_rep_name} | Group: ${r.sales_rep_group_name}`);
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
