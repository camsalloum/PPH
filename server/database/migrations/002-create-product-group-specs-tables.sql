-- Migration: Create Product Group Specifications Tables
-- Creates tables for Material Group and Material Condition configurations
-- Each division can have custom values for these dropdown specifications

-- Material Group Configuration Table
-- Used for the "Material Group" column dropdown (e.g., PE, Non PE)
CREATE TABLE IF NOT EXISTS material_group_config (
  id SERIAL PRIMARY KEY,
  division VARCHAR(10) NOT NULL,
  group_code VARCHAR(50) NOT NULL,
  group_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(division, group_code)
);

-- Material Condition Configuration Table  
-- Used for the "Material Condition" column dropdown (e.g., Plain, Printed)
CREATE TABLE IF NOT EXISTS material_condition_config (
  id SERIAL PRIMARY KEY,
  division VARCHAR(10) NOT NULL,
  condition_code VARCHAR(50) NOT NULL,
  condition_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(division, condition_code)
);

-- Insert default Material Groups for each division based on existing data
-- FP Division
INSERT INTO material_group_config (division, group_code, group_name, display_name, description, display_order) VALUES
('fp', 'PE', 'PE', 'PE', 'Polyethylene material group', 1),
('fp', 'NON_PE', 'Non PE', 'Non PE', 'Non-polyethylene material group', 2)
ON CONFLICT (division, group_code) DO NOTHING;

-- SB Division
INSERT INTO material_group_config (division, group_code, group_name, display_name, description, display_order) VALUES
('sb', 'PE', 'PE', 'PE', 'Polyethylene material group', 1),
('sb', 'NON_PE', 'Non PE', 'Non PE', 'Non-polyethylene material group', 2)
ON CONFLICT (division, group_code) DO NOTHING;

-- TF Division
INSERT INTO material_group_config (division, group_code, group_name, display_name, description, display_order) VALUES
('tf', 'PE', 'PE', 'PE', 'Polyethylene material group', 1),
('tf', 'NON_PE', 'Non PE', 'Non PE', 'Non-polyethylene material group', 2)
ON CONFLICT (division, group_code) DO NOTHING;

-- HCM Division
INSERT INTO material_group_config (division, group_code, group_name, display_name, description, display_order) VALUES
('hcm', 'PE', 'PE', 'PE', 'Polyethylene material group', 1),
('hcm', 'NON_PE', 'Non PE', 'Non PE', 'Non-polyethylene material group', 2)
ON CONFLICT (division, group_code) DO NOTHING;

-- Insert default Material Conditions for each division based on existing data
-- FP Division
INSERT INTO material_condition_config (division, condition_code, condition_name, display_name, description, display_order) VALUES
('fp', 'PLAIN', 'Plain', 'Plain', 'Plain material condition', 1),
('fp', 'PRINTED', 'Printed', 'Printed', 'Printed material condition', 2)
ON CONFLICT (division, condition_code) DO NOTHING;

-- SB Division
INSERT INTO material_condition_config (division, condition_code, condition_name, display_name, description, display_order) VALUES
('sb', 'PLAIN', 'Plain', 'Plain', 'Plain material condition', 1),
('sb', 'PRINTED', 'Printed', 'Printed', 'Printed material condition', 2)
ON CONFLICT (division, condition_code) DO NOTHING;

-- TF Division
INSERT INTO material_condition_config (division, condition_code, condition_name, display_name, description, display_order) VALUES
('tf', 'PLAIN', 'Plain', 'Plain', 'Plain material condition', 1),
('tf', 'PRINTED', 'Printed', 'Printed', 'Printed material condition', 2)
ON CONFLICT (division, condition_code) DO NOTHING;

-- HCM Division
INSERT INTO material_condition_config (division, condition_code, condition_name, display_name, description, display_order) VALUES
('hcm', 'PLAIN', 'Plain', 'Plain', 'Plain material condition', 1),
('hcm', 'PRINTED', 'Printed', 'Printed', 'Printed material condition', 2)
ON CONFLICT (division, condition_code) DO NOTHING;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_material_group_division ON material_group_config(division);
CREATE INDEX IF NOT EXISTS idx_material_group_active ON material_group_config(is_active);
CREATE INDEX IF NOT EXISTS idx_material_condition_division ON material_condition_config(division);
CREATE INDEX IF NOT EXISTS idx_material_condition_active ON material_condition_config(is_active);

-- Add comments
COMMENT ON TABLE material_group_config IS 'Configurable material groups for product group specifications (e.g., PE, Non PE)';
COMMENT ON TABLE material_condition_config IS 'Configurable material conditions for product group specifications (e.g., Plain, Printed)';
