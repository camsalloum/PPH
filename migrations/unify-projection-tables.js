/**
 * Migration: Unify fp_product_group_estimates and fp_forecast_sales
 * into a single fp_product_group_projections table
 * 
 * Benefits:
 * - Single table for all user-entered product group projections
 * - 'type' column distinguishes ESTIMATE vs FORECAST
 * - Simpler data model, easier maintenance
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: '***REDACTED***'
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔄 Creating unified fp_product_group_projections table...');
    
    // 1. Create the new unified table
    await client.query(`
      CREATE TABLE IF NOT EXISTS fp_product_group_projections (
        id SERIAL PRIMARY KEY,
        division_code VARCHAR(10) NOT NULL,
        year INTEGER NOT NULL,
        month_no INTEGER,  -- NULL for yearly forecasts, 1-12 for monthly estimates
        pgcombine VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('ESTIMATE', 'FORECAST')),
        qty_kgs DECIMAL(18, 2) DEFAULT 0,
        amount DECIMAL(18, 2) DEFAULT 0,
        morm DECIMAL(18, 2) DEFAULT 0,
        sls_per_kg DECIMAL(18, 4) DEFAULT 0,  -- For forecast calculations
        rm_per_kg DECIMAL(18, 4) DEFAULT 0,   -- For forecast calculations
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        created_by VARCHAR(255),
        UNIQUE(division_code, year, month_no, pgcombine, type)
      )
    `);
    console.log('✅ Table created');
    
    // 2. Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projections_division_year 
      ON fp_product_group_projections(division_code, year)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projections_type 
      ON fp_product_group_projections(type)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projections_pgcombine 
      ON fp_product_group_projections(pgcombine)
    `);
    console.log('✅ Indexes created');
    
    // 3. Migrate data from fp_product_group_estimates (if exists and has data)
    const estimatesExist = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'fp_product_group_estimates'
      )
    `);
    
    if (estimatesExist.rows[0].exists) {
      const estimateCount = await client.query('SELECT COUNT(*) FROM fp_product_group_estimates');
      if (parseInt(estimateCount.rows[0].count) > 0) {
        await client.query(`
          INSERT INTO fp_product_group_projections 
            (division_code, year, month_no, pgcombine, type, qty_kgs, amount, morm, created_at, updated_at, created_by)
          SELECT 
            division_code, year, month_no, pgcombine, 'ESTIMATE',
            qty_kgs, amount, morm, created_at, updated_at, created_by
          FROM fp_product_group_estimates
          ON CONFLICT (division_code, year, month_no, pgcombine, type) DO NOTHING
        `);
        console.log(`✅ Migrated ${estimateCount.rows[0].count} estimate records`);
      } else {
        console.log('ℹ️  No estimate records to migrate');
      }
    }
    
    // 4. Migrate data from fp_forecast_sales (if exists and has data)
    const forecastExist = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'fp_forecast_sales'
      )
    `);
    
    if (forecastExist.rows[0].exists) {
      const forecastCount = await client.query('SELECT COUNT(*) FROM fp_forecast_sales');
      if (parseInt(forecastCount.rows[0].count) > 0) {
        await client.query(`
          INSERT INTO fp_product_group_projections 
            (division_code, year, month_no, pgcombine, type, qty_kgs, amount, morm, sls_per_kg, rm_per_kg, created_at, updated_at, created_by)
          SELECT 
            division, year, NULL, product_group, 'FORECAST',
            kgs, sales, morm, sls_per_kg, rm_per_kg, created_at, updated_at, created_by
          FROM fp_forecast_sales
          ON CONFLICT (division_code, year, month_no, pgcombine, type) DO NOTHING
        `);
        console.log(`✅ Migrated ${forecastCount.rows[0].count} forecast records`);
      } else {
        console.log('ℹ️  No forecast records to migrate');
      }
    }
    
    // 5. Create updated_at trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION update_projections_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_projections_timestamp ON fp_product_group_projections
    `);
    
    await client.query(`
      CREATE TRIGGER update_projections_timestamp
      BEFORE UPDATE ON fp_product_group_projections
      FOR EACH ROW EXECUTE FUNCTION update_projections_timestamp()
    `);
    console.log('✅ Trigger created');
    
    await client.query('COMMIT');
    
    console.log('\n✅ Migration complete!');
    console.log('\nNew table: fp_product_group_projections');
    console.log('  - type = "ESTIMATE" for EstimateTab data');
    console.log('  - type = "FORECAST" for ForecastTab +2/+3 year data');
    
    // Show final count
    const finalCount = await pool.query('SELECT type, COUNT(*) FROM fp_product_group_projections GROUP BY type');
    console.log('\nRecords by type:');
    finalCount.rows.forEach(r => console.log(`  ${r.type}: ${r.count}`));
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
