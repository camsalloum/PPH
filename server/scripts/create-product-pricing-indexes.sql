-- Performance Indexes for Product Group Pricing Queries
-- These indexes optimize queries used by the Product Group Pricing feature

-- Index for pricing averages query (year, type, productgroup, values_type)
-- This covers the main query pattern: WHERE year = X AND type = 'ACTUAL' AND productgroup IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_fp_data_pricing_averages 
ON fp_data_excel (year, type, productgroup, values_type) 
WHERE productgroup IS NOT NULL AND TRIM(productgroup) != '';

CREATE INDEX IF NOT EXISTS idx_sb_data_pricing_averages 
ON sb_data_excel (year, type, productgroup, values_type) 
WHERE productgroup IS NOT NULL AND TRIM(productgroup) != '';

CREATE INDEX IF NOT EXISTS idx_tf_data_pricing_averages 
ON tf_data_excel (year, type, productgroup, values_type) 
WHERE productgroup IS NOT NULL AND TRIM(productgroup) != '';

CREATE INDEX IF NOT EXISTS idx_hcm_data_pricing_averages 
ON hcm_data_excel (year, type, productgroup, values_type) 
WHERE productgroup IS NOT NULL AND TRIM(productgroup) != '';

-- Index for getting available years (type, year)
CREATE INDEX IF NOT EXISTS idx_fp_data_years_actual 
ON fp_data_excel (type, year) 
WHERE type = 'ACTUAL';

CREATE INDEX IF NOT EXISTS idx_sb_data_years_actual 
ON sb_data_excel (type, year) 
WHERE type = 'ACTUAL';

CREATE INDEX IF NOT EXISTS idx_tf_data_years_actual 
ON tf_data_excel (type, year) 
WHERE type = 'ACTUAL';

CREATE INDEX IF NOT EXISTS idx_hcm_data_years_actual 
ON hcm_data_excel (type, year) 
WHERE type = 'ACTUAL';

-- Index for rounded pricing table lookups
CREATE INDEX IF NOT EXISTS idx_product_pricing_rounding_lookup 
ON product_group_pricing_rounding (division, year, product_group);

-- Analyze tables to update statistics
ANALYZE fp_data_excel;
ANALYZE sb_data_excel;
ANALYZE tf_data_excel;
ANALYZE hcm_data_excel;
ANALYZE product_group_pricing_rounding;



