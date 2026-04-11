-- Migration 322: Create fp_actualdata Table (Layer 2: Transformed Data)
-- Purpose: Main table for actual sales data from ERP with business logic applied
-- Created: January 6, 2026

CREATE TABLE IF NOT EXISTS fp_actualdata (
    -- Primary Keys & References
    actual_id BIGSERIAL PRIMARY KEY,
    erp_row_id VARCHAR(255) UNIQUE NOT NULL,  -- Reference back to fp_raw_data for audit trail
    raw_data_id BIGINT REFERENCES fp_raw_data(id) ON DELETE SET NULL,
    
    -- Core Transaction Fields (from Oracle)
    invoice_date DATE NOT NULL,
    invoice_no VARCHAR(100),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    monthno INTEGER,
    transaction_type VARCHAR(50),
    
    -- Division (Mapped from Oracle to Admin-defined divisions)
    division_code VARCHAR(20) NOT NULL,      -- Admin-defined: 'FP', 'HC', etc.
    division_name VARCHAR(255) NOT NULL,     -- Admin-defined: 'Flexible Packaging', etc.
    mapped_from_oracle_division VARCHAR(20), -- Original Oracle division code ('FP', 'FB', 'HC', etc.)
    
    -- Product Group (to be linked after Product Groups clarification)
    -- product_group_id INTEGER REFERENCES fp_product_group_unified(pg_id),
    -- product_group_name VARCHAR(255),
    -- pg_combine VARCHAR(50),
    
    -- Customer (to be linked after Customer clarification)
    -- customer_id INTEGER REFERENCES fp_customer_unified(customer_id),
    -- customer_name VARCHAR(500),
    -- customer_code VARCHAR(100),
    
    -- Sales Rep (to be linked after Sales Rep clarification)
    -- sales_rep_id INTEGER REFERENCES fp_sales_rep_unified(sales_rep_id),
    -- sales_rep_name VARCHAR(255),
    -- sales_rep_code VARCHAR(50),
    -- sales_rep_group_id INTEGER REFERENCES sales_rep_groups(group_id),
    
    -- Country (to be linked after Country clarification)
    -- country_id INTEGER REFERENCES master_countries(country_id),
    -- country_name VARCHAR(100),
    -- region VARCHAR(100),
    
    -- Quantities
    delivered_qty_storage_units DECIMAL(15, 2),
    delivered_qty_units DECIMAL(15, 2),
    delivered_qty_kgs DECIMAL(15, 2),
    unit_description VARCHAR(100),
    
    -- Financial Fields
    invoiced_amount DECIMAL(15, 2),          -- Original amount
    amount_aed DECIMAL(15, 2),               -- Converted to AED
    material_value DECIMAL(15, 2),
    op_value DECIMAL(15, 2),
    margin_over_rm DECIMAL(15, 2),
    total_value DECIMAL(15, 2),
    margin_over_total DECIMAL(15, 2),
    
    -- Machine Info
    machine_no VARCHAR(50),
    machine_name VARCHAR(255),
    
    -- Data Quality & Audit
    data_quality_score INTEGER CHECK (data_quality_score >= 0 AND data_quality_score <= 100),
    quality_warnings TEXT[],  -- Array of warnings if any
    transformation_applied TEXT[],  -- Array of transformations applied (merge rules, conversions, etc.)
    
    -- System Audit Trail
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    erp_sync_id INTEGER,  -- Reference to which ERP sync job created this
    
    -- Constraints
    CONSTRAINT invoice_date_required CHECK (invoice_date IS NOT NULL),
    CONSTRAINT division_code_required CHECK (length(trim(division_code)) > 0),
    CONSTRAINT division_name_required CHECK (length(trim(division_name)) > 0)
);

-- Create Indexes for Performance
CREATE INDEX idx_fp_actualdata_division_code ON fp_actualdata(division_code);
CREATE INDEX idx_fp_actualdata_invoice_date ON fp_actualdata(invoice_date);
CREATE INDEX idx_fp_actualdata_year_month ON fp_actualdata(year, month);
CREATE INDEX idx_fp_actualdata_erp_row_id ON fp_actualdata(erp_row_id);
CREATE INDEX idx_fp_actualdata_raw_data_id ON fp_actualdata(raw_data_id);
CREATE INDEX idx_fp_actualdata_mapped_oracle_div ON fp_actualdata(mapped_from_oracle_division);

-- Composite Indexes (for common queries)
CREATE INDEX idx_fp_actualdata_division_date ON fp_actualdata(division_code, invoice_date);
CREATE INDEX idx_fp_actualdata_division_year_month ON fp_actualdata(division_code, year, month);

-- Create Trigger for updated_at
CREATE TRIGGER update_fp_actualdata_updated_at 
    BEFORE UPDATE ON fp_actualdata
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create audit table to track transformations
CREATE TABLE IF NOT EXISTS fp_actualdata_transformation_audit (
    audit_id BIGSERIAL PRIMARY KEY,
    actual_id BIGINT REFERENCES fp_actualdata(actual_id) ON DELETE CASCADE,
    erp_row_id VARCHAR(255) NOT NULL,
    transformation_step VARCHAR(100) NOT NULL,  -- e.g., 'division_mapping', 'customer_merge', 'pg_consolidation'
    input_data JSONB,  -- Data before transformation
    output_data JSONB,  -- Data after transformation
    rule_applied VARCHAR(500),  -- Which rule was applied
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_transformation_audit_actual_id (actual_id),
    INDEX idx_transformation_audit_step (transformation_step),
    INDEX idx_transformation_audit_date (created_at)
);

-- Comments
COMMENT ON TABLE fp_actualdata IS 
    'Layer 2: Transformed and enriched actual sales data from Oracle ERP.
    - Raw Oracle data from fp_raw_data is transformed with business logic applied
    - Includes: division mapping, customer merging, product group consolidation, currency conversion
    - Used for all dashboard queries and KPI calculations
    - Audit trail maintained in fp_actualdata_transformation_audit';

COMMENT ON COLUMN fp_actualdata.actual_id IS 
    'Primary key for transformed actual data record';

COMMENT ON COLUMN fp_actualdata.erp_row_id IS 
    'Unique identifier from Oracle ERP (HAP111.XL_FPSALESVSCOST_FULL)
    Format: depends on Oracle''s natural key definition
    Used for idempotent updates (UPSERT logic)';

COMMENT ON COLUMN fp_actualdata.division_code IS 
    'Admin-defined division code (e.g., ''FP'', ''HC'')
    Mapped from Oracle division via company_divisions.mapped_oracle_codes
    Example: Oracle division ''FB'' maps to admin division_code ''FP''';

COMMENT ON COLUMN fp_actualdata.division_name IS 
    'Admin-defined division name (e.g., ''Flexible Packaging'', ''Home Care'')
    Pulled from company_divisions.division_name during transformation';

COMMENT ON COLUMN fp_actualdata.mapped_from_oracle_division IS 
    'Original Oracle division code (before mapping)
    Kept for audit trail to show which Oracle divisions were consolidated';

COMMENT ON TABLE fp_actualdata_transformation_audit IS 
    'Detailed audit trail of all transformations applied to each ERP record
    Tracks: which rule was applied, input/output data, transformation timestamp
    Used for debugging and compliance reporting';
