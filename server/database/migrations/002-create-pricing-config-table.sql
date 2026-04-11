-- Migration: Create Dynamic Pricing Configuration Table
-- Purpose: Replace hardcoded pricing fields (ASP, MoRM, RM) with database-driven configuration
-- Date: 2026-01-08

-- This table stores the list of pricing fields/metrics for each division
-- Instead of hardcoding asp_round, morm_round, rm_round columns,
-- pricing fields are now stored as records and can be added/removed without code changes

CREATE TABLE IF NOT EXISTS pricing_config (
  id SERIAL PRIMARY KEY,
  division VARCHAR(10) NOT NULL,
  field_code VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  min_value NUMERIC(18,4) DEFAULT 0,
  max_value NUMERIC(18,4) DEFAULT 1000,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(division, field_code),
  CHECK (division IN ('fp', 'sb', 'tf', 'hcm')),
  CHECK (min_value <= max_value)
);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pricing_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pricing_config_timestamp ON pricing_config;
CREATE TRIGGER pricing_config_timestamp
BEFORE UPDATE ON pricing_config
FOR EACH ROW
EXECUTE FUNCTION update_pricing_config_timestamp();

-- Insert default pricing fields for all divisions
INSERT INTO pricing_config (division, field_code, field_name, display_name, description, min_value, max_value, display_order)
VALUES 
  ('fp', 'ASP', 'asp_round', 'ASP Rounding', 'Average Selling Price rounding value', 0, 1000, 1),
  ('fp', 'MORM', 'morm_round', 'MoRM Rounding', 'Margin Over Raw Material rounding value', 0, 1000, 2),
  ('fp', 'RM', 'rm_round', 'RM Rounding', 'Raw Material rounding value', 0, 1000, 3),
  ('sb', 'ASP', 'asp_round', 'ASP Rounding', 'Average Selling Price rounding value', 0, 1000, 1),
  ('sb', 'MORM', 'morm_round', 'MoRM Rounding', 'Margin Over Raw Material rounding value', 0, 1000, 2),
  ('sb', 'RM', 'rm_round', 'RM Rounding', 'Raw Material rounding value', 0, 1000, 3),
  ('tf', 'ASP', 'asp_round', 'ASP Rounding', 'Average Selling Price rounding value', 0, 1000, 1),
  ('tf', 'MORM', 'morm_round', 'MoRM Rounding', 'Margin Over Raw Material rounding value', 0, 1000, 2),
  ('tf', 'RM', 'rm_round', 'RM Rounding', 'Raw Material rounding value', 0, 1000, 3),
  ('hcm', 'ASP', 'asp_round', 'ASP Rounding', 'Average Selling Price rounding value', 0, 1000, 1),
  ('hcm', 'MORM', 'morm_round', 'MoRM Rounding', 'Margin Over Raw Material rounding value', 0, 1000, 2),
  ('hcm', 'RM', 'rm_round', 'RM Rounding', 'Raw Material rounding value', 0, 1000, 3)
ON CONFLICT (division, field_code) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pricing_config_division ON pricing_config(division);
CREATE INDEX IF NOT EXISTS idx_pricing_config_active ON pricing_config(is_active);
