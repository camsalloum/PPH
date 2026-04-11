-- Migration Script: Create Product Group Pricing Rounding Table
-- This script should be run once during initial setup or migration
-- The table will be created if it doesn't exist

CREATE TABLE IF NOT EXISTS product_group_pricing_rounding (
  id SERIAL PRIMARY KEY,
  division VARCHAR(10) NOT NULL,
  year INTEGER NOT NULL,
  product_group VARCHAR(255) NOT NULL,
  asp_round NUMERIC(18,4) CHECK (asp_round IS NULL OR (asp_round >= 0 AND asp_round <= 1000)),
  morm_round NUMERIC(18,4) CHECK (morm_round IS NULL OR (morm_round >= 0 AND morm_round <= 1000)),
  rm_round NUMERIC(18,4) CHECK (rm_round IS NULL OR (rm_round >= 0 AND rm_round <= 1000)),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_division_year_product_group UNIQUE (division, year, product_group)
);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_product_group_pricing_rounding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_product_group_pricing_rounding_updated_at'
  ) THEN
    CREATE TRIGGER trg_update_product_group_pricing_rounding_updated_at
    BEFORE UPDATE ON product_group_pricing_rounding
    FOR EACH ROW
    EXECUTE FUNCTION update_product_group_pricing_rounding_updated_at();
  END IF;
END$$;

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_product_pricing_rounding_lookup 
ON product_group_pricing_rounding (division, year, product_group);

-- Analyze table
ANALYZE product_group_pricing_rounding;

-- Display confirmation
SELECT 'Product Group Pricing Rounding table created successfully' AS status;



