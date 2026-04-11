-- Create FP Master Data Tables (Simplified)

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

-- 3. Insert Initial Configuration
INSERT INTO fp_master_config (config_key, config_value, description) 
VALUES (
  'excluded_product_groups', 
  '["Service Charges", "Services Charges", "Others", "Other", "Miscellaneous", "Service", "Charges"]'::jsonb,
  'Product groups to exclude from material percentage management'
) ON CONFLICT (config_key) DO NOTHING;
