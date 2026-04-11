/**
 * Migration: Create Product Group Estimates Table
 * 
 * This table stores estimates at the product group level (not customer level).
 * Used by:
 * - EstimateTab: To store and display yearly estimates per product group
 * - ForecastTab: To fetch estimate data for the base year
 * 
 * Run: node migrations/create-product-group-estimates-table.js
 */

const { Pool } = require('pg');
require('dotenv').config({ path: './server/.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '***REDACTED***'
});

async function createTable() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Creating fp_product_group_estimates table...\n');
    
    // Create the new estimates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS fp_product_group_estimates (
        id SERIAL PRIMARY KEY,
        division_code VARCHAR(10) NOT NULL,
        year INTEGER NOT NULL,
        month_no INTEGER NOT NULL CHECK (month_no >= 1 AND month_no <= 12),
        pgcombine VARCHAR(255) NOT NULL,
        amount DECIMAL(18, 2) DEFAULT 0,
        qty_kgs DECIMAL(18, 2) DEFAULT 0,
        morm DECIMAL(18, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255),
        
        -- Unique constraint to prevent duplicates
        CONSTRAINT uk_fp_pg_estimates_unique 
          UNIQUE (division_code, year, month_no, pgcombine)
      )
    `);
    console.log('✅ Table fp_product_group_estimates created');
    
    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fp_pg_estimates_division_year 
      ON fp_product_group_estimates (division_code, year)
    `);
    console.log('✅ Index on (division_code, year) created');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fp_pg_estimates_pgcombine 
      ON fp_product_group_estimates (pgcombine)
    `);
    console.log('✅ Index on (pgcombine) created');
    
    // Create trigger to update updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_fp_pg_estimates_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    
    await client.query(`
      DROP TRIGGER IF EXISTS trg_fp_pg_estimates_updated_at ON fp_product_group_estimates
    `);
    
    await client.query(`
      CREATE TRIGGER trg_fp_pg_estimates_updated_at
      BEFORE UPDATE ON fp_product_group_estimates
      FOR EACH ROW
      EXECUTE FUNCTION update_fp_pg_estimates_updated_at()
    `);
    console.log('✅ Update trigger created');
    
    // Verify table structure
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'fp_product_group_estimates'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Table Structure:');
    console.log('─'.repeat(50));
    result.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(15)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\nTable: fp_product_group_estimates');
    console.log('Purpose: Store product group level estimates for EstimateTab and ForecastTab');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createTable().catch(console.error);
