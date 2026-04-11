-- Migration: Create Unified Product Group Master Table
-- Date: 2026-01-09
-- Purpose: Single source of truth for material percentages + pricing data

-- Step 1: Create unified master table
CREATE TABLE IF NOT EXISTS fp_product_group_master (
  product_group VARCHAR(255) PRIMARY KEY,
  
  -- Material Percentages (standard columns)
  pe_percentage NUMERIC(5,2) DEFAULT 0 CHECK (pe_percentage >= 0 AND pe_percentage <= 100),
  bopp_percentage NUMERIC(5,2) DEFAULT 0 CHECK (bopp_percentage >= 0 AND bopp_percentage <= 100),
  pet_percentage NUMERIC(5,2) DEFAULT 0 CHECK (pet_percentage >= 0 AND pet_percentage <= 100),
  alu_percentage NUMERIC(5,2) DEFAULT 0 CHECK (alu_percentage >= 0 AND alu_percentage <= 100),
  paper_percentage NUMERIC(5,2) DEFAULT 0 CHECK (paper_percentage >= 0 AND paper_percentage <= 100),
  pvc_pet_percentage NUMERIC(5,2) DEFAULT 0 CHECK (pvc_pet_percentage >= 0 AND pvc_pet_percentage <= 100),
  mix_percentage NUMERIC(5,2) DEFAULT 0 CHECK (mix_percentage >= 0 AND mix_percentage <= 100),
  
  -- Material/Process metadata
  material VARCHAR(255),
  process VARCHAR(255),
  
  -- Pricing Actual (cached values from fp_actualcommon)
  asp_actual NUMERIC(18,4),
  morm_actual NUMERIC(18,4),
  rm_actual NUMERIC(18,4),
  actual_year INTEGER,
  actual_last_calculated_at TIMESTAMP,
  
  -- Pricing Rounded (user-entered values)
  asp_round NUMERIC(18,4) CHECK (asp_round IS NULL OR (asp_round >= 0 AND asp_round <= 1000)),
  morm_round NUMERIC(18,4) CHECK (morm_round IS NULL OR (morm_round >= 0 AND morm_round <= 1000)),
  rm_round NUMERIC(18,4) CHECK (rm_round IS NULL OR (rm_round >= 0 AND rm_round <= 1000)),
  
  -- Audit fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraint: Material percentages sum must not exceed 100%
  CONSTRAINT chk_material_percentages_sum CHECK (
    pe_percentage + bopp_percentage + pet_percentage + 
    alu_percentage + paper_percentage + pvc_pet_percentage + mix_percentage <= 100.01
  )
);

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_fp_pg_master_updated ON fp_product_group_master(updated_at);
CREATE INDEX IF NOT EXISTS idx_fp_pg_master_actual_year ON fp_product_group_master(actual_year);

-- Step 3: Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_fp_product_group_master_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_fp_product_group_master_updated_at ON fp_product_group_master;
CREATE TRIGGER trigger_fp_product_group_master_updated_at
  BEFORE UPDATE ON fp_product_group_master
  FOR EACH ROW
  EXECUTE FUNCTION update_fp_product_group_master_updated_at();

-- Step 4: Create pricing field config table (if not exists)
CREATE TABLE IF NOT EXISTS pricing_field_config (
  id SERIAL PRIMARY KEY,
  division VARCHAR(10) NOT NULL,
  field_code VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) DEFAULT 'actual_round', -- 'actual', 'rounded', 'actual_round'
  min_value NUMERIC(18,4) DEFAULT 0,
  max_value NUMERIC(18,4) DEFAULT 1000,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_pricing_field UNIQUE (division, field_code)
);

-- Insert default pricing fields for FP division
INSERT INTO pricing_field_config (division, field_code, field_name, field_type, display_order)
VALUES 
  ('fp', 'asp_actual', 'Selling Price (Actual)', 'actual', 1),
  ('fp', 'morm_actual', 'Margin over RM (Actual)', 'actual', 2),
  ('fp', 'rm_actual', 'RM Price (Actual)', 'actual', 3),
  ('fp', 'asp_round', 'Selling Price (Rounded)', 'rounded', 4),
  ('fp', 'morm_round', 'Margin over RM (Rounded)', 'rounded', 5),
  ('fp', 'rm_round', 'RM Price (Rounded)', 'rounded', 6)
ON CONFLICT (division, field_code) DO NOTHING;

-- Step 5: Add comments for documentation
COMMENT ON TABLE fp_product_group_master IS 'Unified master table for product group data including material percentages and pricing';
COMMENT ON COLUMN fp_product_group_master.product_group IS 'Product group name (pg_combine from raw_product_group_mappings)';
COMMENT ON COLUMN fp_product_group_master.asp_actual IS 'Cached actual average selling price from fp_actualcommon';
COMMENT ON COLUMN fp_product_group_master.asp_round IS 'User-entered rounded selling price for planning';

-- Success message
DO $$ 
BEGIN 
  RAISE NOTICE '✅ Migration 001 completed: fp_product_group_master table created';
END $$;
