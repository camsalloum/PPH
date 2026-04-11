/**
 * Migration: Create fp_budget_unified_draft table
 * This replaces fp_sales_rep_budget_draft with a structure matching fp_budget_unified
 * 
 * Run: node migrations/create-budget-unified-draft.js
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
    
    console.log('Creating fp_budget_unified_draft table...');
    
    // Create new draft table with same structure as fp_budget_unified
    await client.query(`
      CREATE TABLE IF NOT EXISTS fp_budget_unified_draft (
        id SERIAL PRIMARY KEY,
        division_name VARCHAR(255),
        division_code VARCHAR(50),
        budget_year INTEGER,
        month_no INTEGER,
        customer_name VARCHAR(255),
        country VARCHAR(100),
        sales_rep_name VARCHAR(255),
        sales_rep_code VARCHAR(50),
        pgcombine VARCHAR(255),
        qty_kgs NUMERIC(15, 2) DEFAULT 0,
        amount NUMERIC(15, 2) DEFAULT 0,
        morm NUMERIC(15, 4) DEFAULT 0,
        material VARCHAR(100),
        process VARCHAR(100),
        material_value NUMERIC(15, 2),
        op_value NUMERIC(15, 2),
        total_value NUMERIC(15, 2),
        margin_over_total NUMERIC(15, 4),
        sales_rep_group_id INTEGER,
        sales_rep_group_name VARCHAR(255),
        is_budget BOOLEAN DEFAULT TRUE,
        budget_type VARCHAR(50) DEFAULT 'SALES_REP',
        budget_version VARCHAR(50),
        budget_status VARCHAR(50) DEFAULT 'draft',
        budget_notes TEXT,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        uploaded_at TIMESTAMP,
        reviewed_by VARCHAR(100),
        reviewed_at TIMESTAMP,
        last_auto_save TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Creating indexes...');
    
    // Create indexes for common queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_budget_unified_draft_division 
      ON fp_budget_unified_draft(division_name)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_budget_unified_draft_year 
      ON fp_budget_unified_draft(budget_year)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_budget_unified_draft_salesrep 
      ON fp_budget_unified_draft(sales_rep_name)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_budget_unified_draft_lookup 
      ON fp_budget_unified_draft(division_name, budget_year, month_no, sales_rep_name, customer_name, pgcombine)
    `);
    
    console.log('Migrating existing draft data...');
    
    // Check if old table has data
    const oldDataResult = await client.query(`
      SELECT COUNT(*) as count FROM fp_sales_rep_budget_draft
    `);
    
    const oldDataCount = parseInt(oldDataResult.rows[0].count);
    
    if (oldDataCount > 0) {
      console.log(`Found ${oldDataCount} rows in old draft table, migrating...`);
      
      // Migrate data - need to pivot the old format (3 rows per record) to new format (1 row)
      // Old format: type = 'KGS' | 'Amount' | 'MoRM', values = the value
      // New format: qty_kgs, amount, morm in single row
      
      await client.query(`
        INSERT INTO fp_budget_unified_draft (
          division_name, budget_year, month_no, sales_rep_name, customer_name, 
          country, pgcombine, qty_kgs, amount, morm, budget_status, 
          created_at, updated_at, last_auto_save
        )
        SELECT 
          division,
          budget_year,
          month,
          salesrepname,
          customername,
          countryname,
          productgroup,
          MAX(CASE WHEN type = 'KGS' THEN values ELSE 0 END) as qty_kgs,
          MAX(CASE WHEN type = 'Amount' THEN values ELSE 0 END) as amount,
          MAX(CASE WHEN type = 'MoRM' THEN values ELSE 0 END) as morm,
          'draft',
          MIN(created_at),
          MAX(updated_at),
          MAX(last_auto_save)
        FROM fp_sales_rep_budget_draft
        GROUP BY division, budget_year, month, salesrepname, customername, countryname, productgroup
      `);
      
      const newDataResult = await client.query(`
        SELECT COUNT(*) as count FROM fp_budget_unified_draft
      `);
      
      console.log(`Migrated to ${newDataResult.rows[0].count} rows in new draft table`);
    } else {
      console.log('No existing draft data to migrate');
    }
    
    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');
    console.log('New table: fp_budget_unified_draft');
    console.log('Old table fp_sales_rep_budget_draft can be dropped after verification');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
