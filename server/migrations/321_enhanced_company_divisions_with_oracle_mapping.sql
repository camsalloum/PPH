-- Migration 321: Enhanced Company Divisions with Oracle Mapping
-- Adds support for mapping admin-defined divisions to Oracle ERP divisions
-- Created: January 6, 2026

-- Create or replace company_divisions table
CREATE TABLE IF NOT EXISTS company_divisions (
    division_id SERIAL PRIMARY KEY,
    division_code VARCHAR(20) NOT NULL UNIQUE,
    division_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Oracle Integration: Map this division to Oracle division codes
    -- Example: FP division in system maps to ['FP', 'FB'] in Oracle
    mapped_oracle_codes TEXT[] DEFAULT '{}',
    
    -- Display & Control
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    color_code VARCHAR(7),  -- Hex color for UI
    icon VARCHAR(50),       -- Icon name for UI
    
    -- Audit Trail
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    
    CONSTRAINT division_code_not_empty CHECK (length(trim(division_code)) > 0),
    CONSTRAINT division_name_not_empty CHECK (length(trim(division_name)) > 0)
);

-- Create indexes for faster lookups
CREATE INDEX idx_company_divisions_code ON company_divisions(division_code);
CREATE INDEX idx_company_divisions_active ON company_divisions(is_active);
CREATE INDEX idx_company_divisions_oracle ON company_divisions USING GIN(mapped_oracle_codes);

-- Create trigger for updated_at
CREATE TRIGGER update_company_divisions_updated_at 
    BEFORE UPDATE ON company_divisions
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default divisions for Interplast (example)
-- Note: Only insert FP division. More divisions can be added via Company Info page dynamically.
INSERT INTO company_divisions (division_code, division_name, description, mapped_oracle_codes, display_order, color_code, icon)
VALUES 
    ('FP', 'Flexible Packaging', 'Flexible Packaging Division - aggregates Oracle FP & BF codes', ARRAY['FP', 'BF'], 1, '#0066CC', 'package')
ON CONFLICT (division_code) DO NOTHING;

-- Create table to track division mapping history (audit trail)
CREATE TABLE IF NOT EXISTS division_mapping_audit (
    mapping_id SERIAL PRIMARY KEY,
    division_id INTEGER NOT NULL REFERENCES company_divisions(division_id),
    oracle_code VARCHAR(20) NOT NULL,
    action VARCHAR(50) NOT NULL,  -- 'ADDED', 'REMOVED', 'CHANGED'
    old_mapped_codes TEXT[],
    new_mapped_codes TEXT[],
    changed_at TIMESTAMP DEFAULT NOW(),
    changed_by INTEGER REFERENCES users(id),
    reason TEXT
);

CREATE INDEX idx_division_mapping_audit_division ON division_mapping_audit(division_id);
CREATE INDEX idx_division_mapping_audit_date ON division_mapping_audit(changed_at);

-- Add company_divisions reference to company_settings if needed
-- (company_settings can now reference divisions by code)

COMMENT ON TABLE company_divisions IS 
    'Master division table with Oracle ERP mapping. Each division code maps to one or more Oracle division codes.
    Example: FP division → Oracle [FP, FB] divisions. Used in fp_actualdata for division field.';
    
COMMENT ON COLUMN company_divisions.division_code IS 
    'Unique division code (FP, HC, etc.) - used in fp_actualdata.division_code';
    
COMMENT ON COLUMN company_divisions.division_name IS 
    'Display name for division (Flexible Packaging, Home Care, etc.)';
    
COMMENT ON COLUMN company_divisions.mapped_oracle_codes IS 
    'Array of Oracle division codes that map to this division. 
    Example: {FP, FB} means Oracle FP & FB rows are combined under FP division.
    Used during fp_raw_data → fp_actualdata transformation.';
    
COMMENT ON COLUMN company_divisions.is_active IS 
    'Soft delete flag. Inactive divisions hidden from UI but data preserved.';

COMMENT ON TABLE division_mapping_audit IS 
    'Audit trail for division mapping changes. Tracks when Oracle codes are added/removed from divisions.';
