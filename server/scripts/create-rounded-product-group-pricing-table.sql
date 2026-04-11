-- Create table to store manually rounded product group pricing values
CREATE TABLE IF NOT EXISTS product_group_pricing_rounding (
  id SERIAL PRIMARY KEY,
  division VARCHAR(10) NOT NULL,
  year INTEGER NOT NULL,
  product_group VARCHAR(255) NOT NULL,
  asp_round NUMERIC(18,4),
  morm_round NUMERIC(18,4),
  rm_round NUMERIC(18,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_division_year_product_group UNIQUE (division, year, product_group)
);

CREATE OR REPLACE FUNCTION update_product_group_pricing_rounding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_product_group_pricing_rounding_updated_at ON product_group_pricing_rounding;

CREATE TRIGGER trg_update_product_group_pricing_rounding_updated_at
BEFORE UPDATE ON product_group_pricing_rounding
FOR EACH ROW
EXECUTE FUNCTION update_product_group_pricing_rounding_updated_at();



