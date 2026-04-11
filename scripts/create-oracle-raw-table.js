/**
 * Create Oracle Direct Raw Table
 * Creates fp_raw_oracle table that mirrors the Oracle ERP view structure
 * This table will feed into fp_actualcommon (bypassing Excel export)
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

async function createOracleRawTable() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Creating fp_raw_oracle table...\n');
    
    // Drop if exists (for fresh start during development)
    await client.query(`DROP TABLE IF EXISTS fp_raw_oracle CASCADE`);
    console.log('   Dropped existing table (if any)');
    
    // Create the table with all 57 columns from Oracle view
    // All columns as TEXT initially for flexibility (will be cast during transform)
    const createTableSQL = `
      CREATE TABLE fp_raw_oracle (
        id SERIAL PRIMARY KEY,
        
        -- Oracle View Columns (57 columns from HAP111.XL_FPSALESVSCOST_FULL)
        division TEXT,
        subdivision TEXT,
        customertitle TEXT,
        itemcode TEXT,
        itemgroupcode TEXT,
        itemgroupdescription TEXT,
        subgroup TEXT,
        itemdescription TEXT,
        weight NUMERIC,
        financialcustomer TEXT,
        customer TEXT,
        customername TEXT,
        firstrandate TIMESTAMP,
        countryname TEXT,
        salesrepname TEXT,
        salesrepcode TEXT,
        unitdescription TEXT,
        selectioncodedescription TEXT,
        selectioncode TEXT,
        producttype TEXT,
        invoicedate TIMESTAMP,
        transactiontype TEXT,
        invoiceno TEXT,
        productgroup TEXT,
        year1 INTEGER,
        month1 TEXT,
        monthno INTEGER,
        deliveredqtyinstorageunits NUMERIC,
        deliveredquantity NUMERIC,
        deliveredquantitykgs NUMERIC,
        invoicedamount NUMERIC,
        materialvalue NUMERIC,
        opvalue NUMERIC,
        marginoverrm NUMERIC,
        totalvalue NUMERIC,
        marginovertotal NUMERIC,
        machineno TEXT,
        machinename TEXT,
        titlecode TEXT,
        titlename TEXT,
        address_1 TEXT,
        address_2 TEXT,
        postbox TEXT,
        phone TEXT,
        building TEXT,
        creditlimit NUMERIC,
        paymentcode TEXT,
        termsofpayment TEXT,
        paymentdays INTEGER,
        contactname TEXT,
        contactposition TEXT,
        contdepartment TEXT,
        conttel TEXT,
        contmob TEXT,
        contemail TEXT,
        businesspartnertype TEXT,
        deliveryterms TEXT,
        
        -- Metadata columns
        oracle_sync_batch_id UUID,
        synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await client.query(createTableSQL);
    console.log('   ✅ Table fp_raw_oracle created with 57 Oracle columns + metadata\n');
    
    // Create indexes for performance
    console.log('   Creating indexes...');
    await client.query(`CREATE INDEX idx_fp_raw_oracle_division ON fp_raw_oracle(division)`);
    await client.query(`CREATE INDEX idx_fp_raw_oracle_year ON fp_raw_oracle(year1)`);
    await client.query(`CREATE INDEX idx_fp_raw_oracle_monthno ON fp_raw_oracle(monthno)`);
    await client.query(`CREATE INDEX idx_fp_raw_oracle_customername ON fp_raw_oracle(customername)`);
    await client.query(`CREATE INDEX idx_fp_raw_oracle_salesrepname ON fp_raw_oracle(salesrepname)`);
    await client.query(`CREATE INDEX idx_fp_raw_oracle_productgroup ON fp_raw_oracle(productgroup)`);
    await client.query(`CREATE INDEX idx_fp_raw_oracle_sync_batch ON fp_raw_oracle(oracle_sync_batch_id)`);
    console.log('   ✅ Indexes created\n');
    
    // Show table structure
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'fp_raw_oracle' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Table Structure (fp_raw_oracle):');
    console.log('   ' + '-'.repeat(50));
    result.rows.forEach((row, i) => {
      console.log(`   ${(i+1).toString().padStart(2)}. ${row.column_name.padEnd(30)} ${row.data_type}`);
    });
    console.log('   ' + '-'.repeat(50));
    console.log(`   Total: ${result.rows.length} columns\n`);
    
    console.log('🎉 fp_raw_oracle table created successfully!');
    console.log('   Next step: Run sync-oracle-direct.js to populate data from Oracle ERP');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

createOracleRawTable();
