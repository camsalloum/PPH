/**
 * Migration: Add pin tracking fields to fp_customer_master
 * 
 * Adds:
 * - pin_confirmed: boolean - TRUE if user manually confirmed the pin location
 * - pin_source: varchar - 'user', 'ai', 'import', 'geocode' - who/what set the pin
 * - pin_confirmed_by: varchar - username who confirmed
 * - pin_confirmed_at: timestamp - when confirmed
 * 
 * Also updates is_active based on transaction history (last 12 months)
 */

const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'fp_database',
  password: process.env.DB_PASSWORD || '***REDACTED***',
  port: parseInt(process.env.DB_PORT) || 5432
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('Starting migration: add pin tracking fields...\n');
    
    await client.query('BEGIN');
    
    // Step 1: Add pin tracking columns
    console.log('1. Adding pin tracking columns...');
    
    // Check if columns exist first
    const checkCol = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'fp_customer_master' AND column_name = 'pin_confirmed'
    `);
    
    if (checkCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE fp_customer_master 
        ADD COLUMN IF NOT EXISTS pin_confirmed BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS pin_source VARCHAR(50),
        ADD COLUMN IF NOT EXISTS pin_confirmed_by VARCHAR(100),
        ADD COLUMN IF NOT EXISTS pin_confirmed_at TIMESTAMP
      `);
      console.log('   ✅ Added pin_confirmed, pin_source, pin_confirmed_by, pin_confirmed_at columns');
    } else {
      console.log('   ⏭️  Pin tracking columns already exist, skipping...');
    }
    
    // Step 2: Mark existing pins as unconfirmed (they were set by AI/import)
    console.log('\n2. Marking existing pins as unconfirmed (set by AI/import)...');
    const updateExisting = await client.query(`
      UPDATE fp_customer_master 
      SET pin_source = 'ai_geocode',
          pin_confirmed = FALSE
      WHERE latitude IS NOT NULL 
        AND longitude IS NOT NULL 
        AND pin_source IS NULL
    `);
    console.log(`   ✅ Updated ${updateExisting.rowCount} customers with existing pins`);
    
    // Step 3: Identify and mark inactive customers (no transactions in 12 months)
    console.log('\n3. Checking customer activity based on last 12 months transactions...');
    
    // Get last transaction date for each customer
    const lastTransactions = await client.query(`
      SELECT 
        LOWER(TRIM(customername)) as customer_name_norm,
        MAX(CONCAT(year, '-', LPAD(month::text, 2, '0'), '-01')::date) as last_transaction
      FROM fp_data_excel 
      WHERE customername IS NOT NULL
      GROUP BY LOWER(TRIM(customername))
    `);
    
    console.log(`   Found ${lastTransactions.rows.length} customers with transaction history`);
    
    // Mark customers as inactive if no transaction in last 12 months
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 12);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    
    console.log(`   Cutoff date for activity: ${cutoffStr}`);
    
    let inactiveCount = 0;
    let activeCount = 0;
    
    for (const row of lastTransactions.rows) {
      const lastTx = new Date(row.last_transaction);
      const isActive = lastTx >= cutoffDate;
      
      const result = await client.query(`
        UPDATE fp_customer_master 
        SET is_active = $1
        WHERE LOWER(TRIM(customer_name)) = $2
      `, [isActive, row.customer_name_norm]);
      
      if (isActive) {
        activeCount += result.rowCount;
      } else {
        inactiveCount += result.rowCount;
      }
    }
    
    console.log(`   ✅ Active customers (transaction in last 12 months): ${activeCount}`);
    console.log(`   ⚠️  Inactive customers (no transaction in 12 months): ${inactiveCount}`);
    
    // Step 4: Customers with no transaction history at all
    const noHistoryResult = await client.query(`
      UPDATE fp_customer_master 
      SET is_active = FALSE
      WHERE LOWER(TRIM(customer_name)) NOT IN (
        SELECT DISTINCT LOWER(TRIM(customername)) 
        FROM fp_data_excel 
        WHERE customername IS NOT NULL
      )
      AND is_active = TRUE
    `);
    console.log(`   ⚠️  Customers with no transaction history marked inactive: ${noHistoryResult.rowCount}`);
    
    await client.query('COMMIT');
    
    // Summary
    console.log('\n========================================');
    console.log('Migration completed successfully!');
    console.log('========================================');
    
    const summary = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_active = TRUE) as active_customers,
        COUNT(*) FILTER (WHERE is_active = FALSE) as inactive_customers,
        COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as with_pins,
        COUNT(*) FILTER (WHERE pin_confirmed = TRUE) as confirmed_pins,
        COUNT(*) FILTER (WHERE pin_source = 'ai_geocode') as ai_pins
      FROM fp_customer_master
    `);
    
    console.log('\nCustomer Summary:');
    console.log(`  Active customers: ${summary.rows[0].active_customers}`);
    console.log(`  Inactive customers: ${summary.rows[0].inactive_customers}`);
    console.log(`  Customers with pins: ${summary.rows[0].with_pins}`);
    console.log(`  Confirmed pins: ${summary.rows[0].confirmed_pins}`);
    console.log(`  AI-generated pins: ${summary.rows[0].ai_pins}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
