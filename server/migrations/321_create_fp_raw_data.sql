-- Migration 321: Create fp_raw_data Table (Layer 1: Raw Oracle Data)
-- Purpose: Untouched copy of Oracle HAP111.XL_FPSALESVSCOST_FULL data
-- Created: January 7, 2026

CREATE TABLE IF NOT EXISTS fp_raw_data (
    -- System Columns
    id BIGSERIAL PRIMARY KEY,
    
    -- Oracle Original Columns (57 columns from HAP111.XL_FPSALESVSCOST_FULL)
    -- Year and Period
    year1 INTEGER,
    month1 INTEGER,
    
    -- Transaction Identifiers
    invoice_date DATE,
    invoice_no VARCHAR(100),
    delivery_date DATE,
    delivery_no VARCHAR(100),
    po_no VARCHAR(100),
    transaction_type VARCHAR(50),
    
    -- Customer Information
    customer_code VARCHAR(100),
    customer_name VARCHAR(500),
    customer_country VARCHAR(100),
    
    -- Sales Information
    sales_rep_code VARCHAR(50),
    sales_rep_name VARCHAR(255),
    division_code VARCHAR(50),
    division_name VARCHAR(255),
    
    -- Product Information
    product_group VARCHAR(255),
    product_code VARCHAR(100),
    product_name VARCHAR(500),
    material_code VARCHAR(100),
    material_name VARCHAR(255),
    process_code VARCHAR(50),
    process_name VARCHAR(100),
    
    -- Quantity Fields
    delivered_qty_storage_units DECIMAL(15, 2),
    delivered_qty_units DECIMAL(15, 2),
    delivered_qty_kgs DECIMAL(15, 2),
    unit_description VARCHAR(100),
    morm_value DECIMAL(15, 2),
    
    -- Amount Fields
    net_amount NUMERIC(18, 4),
    gross_amount NUMERIC(18, 4),
    currency_code VARCHAR(10),
    
    -- Additional Oracle Columns
    region VARCHAR(100),
    country_code VARCHAR(10),
    cost_center VARCHAR(50),
    profit_center VARCHAR(50),
    order_type VARCHAR(50),
    order_status VARCHAR(50),
    
    -- Remaining Oracle columns (placeholder for actual column names)
    custom_field_1 VARCHAR(255),
    custom_field_2 VARCHAR(255),
    custom_field_3 VARCHAR(255),
    custom_field_4 VARCHAR(255),
    custom_field_5 VARCHAR(255),
    custom_field_6 VARCHAR(255),
    custom_field_7 VARCHAR(255),
    
    -- System Columns (added by sync process)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_batch_id VARCHAR(100),
    sync_timestamp TIMESTAMP,
    source_system VARCHAR(50) DEFAULT 'Oracle_ERP',
    
    -- Indexes for Performance
    CONSTRAINT fk_raw_data_unique UNIQUE(year1, invoice_no, delivery_no)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_fp_raw_year ON fp_raw_data(year1);
CREATE INDEX IF NOT EXISTS idx_fp_raw_month ON fp_raw_data(month1);
CREATE INDEX IF NOT EXISTS idx_fp_raw_period ON fp_raw_data(year1, month1);
CREATE INDEX IF NOT EXISTS idx_fp_raw_customer ON fp_raw_data(customer_code);
CREATE INDEX IF NOT EXISTS idx_fp_raw_division ON fp_raw_data(division_code);
CREATE INDEX IF NOT EXISTS idx_fp_raw_sales_rep ON fp_raw_data(sales_rep_code);
CREATE INDEX IF NOT EXISTS idx_fp_raw_sync_batch ON fp_raw_data(sync_batch_id);
CREATE INDEX IF NOT EXISTS idx_fp_raw_created_at ON fp_raw_data(created_at);

-- Track sync metadata
CREATE TABLE IF NOT EXISTS erp_sync_metadata (
    sync_id BIGSERIAL PRIMARY KEY,
    batch_id VARCHAR(100) UNIQUE NOT NULL,
    sync_type VARCHAR(50),  -- 'FULL' or 'INCREMENTAL'
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    records_processed INTEGER,
    records_inserted INTEGER,
    records_updated INTEGER,
    error_count INTEGER,
    status VARCHAR(50),  -- 'SUCCESS', 'FAILED', 'PARTIAL'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_batch_id ON erp_sync_metadata(batch_id);
CREATE INDEX IF NOT EXISTS idx_sync_status ON erp_sync_metadata(status);
