/**
 * Direct migration runner - applies migrations to IP_AUTH (FP) database
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const multiTenantPool = require('../database/multiTenantPool');

async function runMigration() {
  const companyCode = 'IP_AUTH';  // The FP database
  
  try {
    // Initialize the pool
    await multiTenantPool.initialize();
    console.log(`\n📋 Applying migrations to ${companyCode} database\n`);

    // Create fp_raw_data table
    const createRawDataSQL = `
    CREATE TABLE IF NOT EXISTS fp_raw_data (
        id BIGSERIAL PRIMARY KEY,
        year1 INTEGER,
        month1 INTEGER,
        invoice_date DATE,
        invoice_no VARCHAR(100),
        delivery_date DATE,
        delivery_no VARCHAR(100),
        po_no VARCHAR(100),
        transaction_type VARCHAR(50),
        customer_code VARCHAR(100),
        customer_name VARCHAR(500),
        customer_country VARCHAR(100),
        sales_rep_code VARCHAR(50),
        sales_rep_name VARCHAR(255),
        division_code VARCHAR(50),
        division_name VARCHAR(255),
        product_group VARCHAR(255),
        product_code VARCHAR(100),
        product_name VARCHAR(500),
        material_code VARCHAR(100),
        material_name VARCHAR(255),
        process_code VARCHAR(50),
        process_name VARCHAR(100),
        delivered_qty_storage_units DECIMAL(15, 2),
        delivered_qty_units DECIMAL(15, 2),
        delivered_qty_kgs DECIMAL(15, 2),
        unit_description VARCHAR(100),
        morm_value DECIMAL(15, 2),
        net_amount NUMERIC(18, 4),
        gross_amount NUMERIC(18, 4),
        currency_code VARCHAR(10),
        region VARCHAR(100),
        country_code VARCHAR(10),
        cost_center VARCHAR(50),
        profit_center VARCHAR(50),
        order_type VARCHAR(50),
        order_status VARCHAR(50),
        custom_field_1 VARCHAR(255),
        custom_field_2 VARCHAR(255),
        custom_field_3 VARCHAR(255),
        custom_field_4 VARCHAR(255),
        custom_field_5 VARCHAR(255),
        custom_field_6 VARCHAR(255),
        custom_field_7 VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sync_batch_id VARCHAR(100),
        sync_timestamp TIMESTAMP,
        source_system VARCHAR(50) DEFAULT 'Oracle_ERP'
    );
    `;

    console.log('⏳ Creating fp_raw_data table...');
    await multiTenantPool.tenantQuery(companyCode, createRawDataSQL);
    console.log('✅ fp_raw_data created\n');

    // Create indexes
    const indexSQL = `
    CREATE INDEX IF NOT EXISTS idx_fp_raw_year ON fp_raw_data(year1);
    CREATE INDEX IF NOT EXISTS idx_fp_raw_month ON fp_raw_data(month1);
    CREATE INDEX IF NOT EXISTS idx_fp_raw_period ON fp_raw_data(year1, month1);
    `;

    console.log('⏳ Creating indexes...');
    await multiTenantPool.tenantQuery(companyCode, indexSQL);
    console.log('✅ Indexes created\n');

    // Create sync metadata table
    const syncMetaSQL = `
    CREATE TABLE IF NOT EXISTS erp_sync_metadata (
        sync_id BIGSERIAL PRIMARY KEY,
        batch_id VARCHAR(100) UNIQUE NOT NULL,
        sync_type VARCHAR(50),
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        records_processed INTEGER,
        records_inserted INTEGER,
        records_updated INTEGER,
        error_count INTEGER,
        status VARCHAR(50),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    );
    `;

    console.log('⏳ Creating erp_sync_metadata table...');
    await multiTenantPool.tenantQuery(companyCode, syncMetaSQL);
    console.log('✅ erp_sync_metadata created\n');

    console.log('✅ All migrations applied successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
