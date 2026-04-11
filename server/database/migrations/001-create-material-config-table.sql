-- Migration: Create Dynamic Material Configuration Table
-- Purpose: Replace hardcoded material columns with database-driven configuration
-- Date: 2026-01-08

-- This table stores the list of materials and their properties for each division
-- Instead of hardcoding ['PE', 'PP', 'PET', 'Alu', 'Paper', 'PVC/PET', 'Mix'],
-- materials are now stored as records and can be added/removed without code changes

CREATE TABLE IF NOT EXISTS material_config (
  id SERIAL PRIMARY KEY,
  division VARCHAR(10) NOT NULL,
  material_code VARCHAR(50) NOT NULL,
  material_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(division, material_code),
  CHECK (division IN ('fp', 'sb', 'tf', 'hcm'))
);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_material_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS material_config_timestamp ON material_config;
CREATE TRIGGER material_config_timestamp
BEFORE UPDATE ON material_config
FOR EACH ROW
EXECUTE FUNCTION update_material_config_timestamp();

-- Insert default materials for all divisions
INSERT INTO material_config (division, material_code, material_name, display_name, description, display_order)
VALUES 
  ('fp', 'PE', 'Polyethylene', 'PE', 'Polyethylene material', 1),
  ('fp', 'PP', 'Polypropylene', 'PP', 'Polypropylene material', 2),
  ('fp', 'PET', 'Polyethylene Terephthalate', 'PET', 'PET material', 3),
  ('fp', 'ALU', 'Aluminum', 'Alu', 'Aluminum material', 4),
  ('fp', 'PAPER', 'Paper', 'Paper', 'Paper material', 5),
  ('fp', 'PVC_PET', 'PVC/PET', 'PVC/PET', 'PVC and PET blend', 6),
  ('fp', 'MIX', 'Mix', 'Mix', 'Mixed materials', 7),
  ('sb', 'PE', 'Polyethylene', 'PE', 'Polyethylene material', 1),
  ('sb', 'PP', 'Polypropylene', 'PP', 'Polypropylene material', 2),
  ('sb', 'PET', 'Polyethylene Terephthalate', 'PET', 'PET material', 3),
  ('sb', 'ALU', 'Aluminum', 'Alu', 'Aluminum material', 4),
  ('sb', 'PAPER', 'Paper', 'Paper', 'Paper material', 5),
  ('sb', 'PVC_PET', 'PVC/PET', 'PVC/PET', 'PVC and PET blend', 6),
  ('sb', 'MIX', 'Mix', 'Mix', 'Mixed materials', 7),
  ('tf', 'PE', 'Polyethylene', 'PE', 'Polyethylene material', 1),
  ('tf', 'PP', 'Polypropylene', 'PP', 'Polypropylene material', 2),
  ('tf', 'PET', 'Polyethylene Terephthalate', 'PET', 'PET material', 3),
  ('tf', 'ALU', 'Aluminum', 'Alu', 'Aluminum material', 4),
  ('tf', 'PAPER', 'Paper', 'Paper', 'Paper material', 5),
  ('tf', 'PVC_PET', 'PVC/PET', 'PVC/PET', 'PVC and PET blend', 6),
  ('tf', 'MIX', 'Mix', 'Mix', 'Mixed materials', 7),
  ('hcm', 'PE', 'Polyethylene', 'PE', 'Polyethylene material', 1),
  ('hcm', 'PP', 'Polypropylene', 'PP', 'Polypropylene material', 2),
  ('hcm', 'PET', 'Polyethylene Terephthalate', 'PET', 'PET material', 3),
  ('hcm', 'ALU', 'Aluminum', 'Alu', 'Aluminum material', 4),
  ('hcm', 'PAPER', 'Paper', 'Paper', 'Paper material', 5),
  ('hcm', 'PVC_PET', 'PVC/PET', 'PVC/PET', 'PVC and PET blend', 6),
  ('hcm', 'MIX', 'Mix', 'Mix', 'Mixed materials', 7)
ON CONFLICT (division, material_code) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_material_config_division ON material_config(division);
CREATE INDEX IF NOT EXISTS idx_material_config_active ON material_config(is_active);
