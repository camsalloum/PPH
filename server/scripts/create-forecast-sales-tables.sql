-- Forecast Sales Tables
-- Stores user input forecast data for Base +2 and +3 years

-- FP Division Forecast Sales Table
CREATE TABLE IF NOT EXISTS fp_forecast_sales (
  id SERIAL PRIMARY KEY,
  division VARCHAR(10) NOT NULL DEFAULT 'FP',
  year INTEGER NOT NULL,
  product_group VARCHAR(100) NOT NULL,
  kgs NUMERIC(18,2) DEFAULT 0,
  sls_per_kg NUMERIC(18,4) DEFAULT 0,
  rm_per_kg NUMERIC(18,4) DEFAULT 0,
  -- Calculated fields (stored for reporting convenience)
  sales NUMERIC(18,2) GENERATED ALWAYS AS (kgs * sls_per_kg) STORED,
  morm_per_kg NUMERIC(18,4) GENERATED ALWAYS AS (sls_per_kg - rm_per_kg) STORED,
  morm NUMERIC(18,2) GENERATED ALWAYS AS (kgs * (sls_per_kg - rm_per_kg)) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  UNIQUE(division, year, product_group)
);

-- HC Division Forecast Sales Table
CREATE TABLE IF NOT EXISTS hc_forecast_sales (
  id SERIAL PRIMARY KEY,
  division VARCHAR(10) NOT NULL DEFAULT 'HC',
  year INTEGER NOT NULL,
  product_group VARCHAR(100) NOT NULL,
  kgs NUMERIC(18,2) DEFAULT 0,
  sls_per_kg NUMERIC(18,4) DEFAULT 0,
  rm_per_kg NUMERIC(18,4) DEFAULT 0,
  -- Calculated fields (stored for reporting convenience)
  sales NUMERIC(18,2) GENERATED ALWAYS AS (kgs * sls_per_kg) STORED,
  morm_per_kg NUMERIC(18,4) GENERATED ALWAYS AS (sls_per_kg - rm_per_kg) STORED,
  morm NUMERIC(18,2) GENERATED ALWAYS AS (kgs * (sls_per_kg - rm_per_kg)) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  UNIQUE(division, year, product_group)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fp_forecast_year ON fp_forecast_sales(year);
CREATE INDEX IF NOT EXISTS idx_fp_forecast_pg ON fp_forecast_sales(product_group);
CREATE INDEX IF NOT EXISTS idx_hc_forecast_year ON hc_forecast_sales(year);
CREATE INDEX IF NOT EXISTS idx_hc_forecast_pg ON hc_forecast_sales(product_group);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_forecast_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fp_forecast_updated ON fp_forecast_sales;
CREATE TRIGGER fp_forecast_updated
  BEFORE UPDATE ON fp_forecast_sales
  FOR EACH ROW EXECUTE FUNCTION update_forecast_timestamp();

DROP TRIGGER IF EXISTS hc_forecast_updated ON hc_forecast_sales;
CREATE TRIGGER hc_forecast_updated
  BEFORE UPDATE ON hc_forecast_sales
  FOR EACH ROW EXECUTE FUNCTION update_forecast_timestamp();
