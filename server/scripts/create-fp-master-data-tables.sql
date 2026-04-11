-- Create FP Master Data Tables
-- This script creates the necessary tables for FP division master data management

-- 1. Material Percentages Table
CREATE TABLE IF NOT EXISTS fp_material_percentages (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL,
  pe_percentage DECIMAL(5,2) DEFAULT 0,
  bopp_percentage DECIMAL(5,2) DEFAULT 0,
  pet_percentage DECIMAL(5,2) DEFAULT 0,
  alu_percentage DECIMAL(5,2) DEFAULT 0,
  paper_percentage DECIMAL(5,2) DEFAULT 0,
  pvc_pet_percentage DECIMAL(5,2) DEFAULT 0,
  material VARCHAR(255) DEFAULT '',
  process VARCHAR(255) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_group)
);

-- 2. Master Config Table
CREATE TABLE IF NOT EXISTS fp_master_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(255) NOT NULL UNIQUE,
  config_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_fp_material_percentages_product_group ON fp_material_percentages(product_group);
CREATE INDEX IF NOT EXISTS idx_fp_master_config_key ON fp_master_config(config_key);

-- 4. Add Constraints for Data Integrity (simplified)
ALTER TABLE fp_material_percentages 
ADD CONSTRAINT check_percentages_range 
CHECK (
  pe_percentage >= 0 AND pe_percentage <= 100 AND
  bopp_percentage >= 0 AND bopp_percentage <= 100 AND
  pet_percentage >= 0 AND pet_percentage <= 100 AND
  alu_percentage >= 0 AND alu_percentage <= 100 AND
  paper_percentage >= 0 AND paper_percentage <= 100 AND
  pvc_pet_percentage >= 0 AND pvc_pet_percentage <= 100
);

-- 5. Create Trigger for Updated At
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_fp_material_percentages_updated_at 
    BEFORE UPDATE ON fp_material_percentages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fp_master_config_updated_at 
    BEFORE UPDATE ON fp_master_config 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Insert Initial Configuration
INSERT INTO fp_master_config (config_key, config_value, description) 
VALUES (
  'excluded_product_groups', 
  '["Service Charges", "Others", "Other", "Miscellaneous", "Service", "Charges"]'::jsonb,
  'Product groups to exclude from material percentage management'
) ON CONFLICT (config_key) DO NOTHING;
