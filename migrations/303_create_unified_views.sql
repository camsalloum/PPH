-- ============================================================
-- MIGRATION 303: Create Unified Views and Materialized Summaries
-- ============================================================
-- Purpose: Create the main unified view that joins all master tables
-- Created: January 1, 2026
-- ============================================================

-- Step 1: Create the main unified sales data view
CREATE OR REPLACE VIEW vw_unified_sales_data AS
SELECT 
  -- Source row reference
  d.id AS source_row_id,
  d.sourcesheet,
  
  -- Period
  d.year,
  d.month,
  d.type AS data_type,
  d.values_type,
  d.values,
  
  -- Customer (resolved)
  c.customer_id,
  c.customer_code,
  c.display_name AS customer_name,
  c.normalized_name AS customer_normalized,
  c.is_merged,
  c.primary_country AS customer_country,
  -- Effective customer (if merged, use parent)
  CASE 
    WHEN c.is_merged AND cm.customer_id IS NOT NULL THEN cm.customer_id
    ELSE c.customer_id
  END AS effective_customer_id,
  CASE 
    WHEN c.is_merged AND cm.customer_id IS NOT NULL THEN cm.customer_code
    ELSE c.customer_code
  END AS effective_customer_code,
  CASE 
    WHEN c.is_merged AND cm.customer_id IS NOT NULL THEN cm.display_name
    ELSE c.display_name
  END AS effective_customer_name,
  
  -- Sales Rep (resolved)
  sr.sales_rep_id,
  sr.sales_rep_code,
  sr.display_name AS sales_rep_name,
  sr.normalized_name AS sales_rep_normalized,
  sr.group_id AS sales_rep_group_id,
  sr.group_name AS sales_rep_group,
  
  -- Product Group (resolved)
  pg.pg_id,
  pg.pg_code,
  pg.display_name AS product_group,
  pg.normalized_name AS product_group_normalized,
  pg.material,
  pg.process,
  pg.pg_combined,
  
  -- Geography (from raw data)
  d.countryname AS country,
  d.division

FROM fp_data_excel d

-- Join to Customer Unified
LEFT JOIN fp_customer_unified c 
  ON UPPER(TRIM(d.customername)) = c.normalized_name
  AND c.division = d.division

-- If customer is merged, get the parent customer
LEFT JOIN fp_customer_unified cm 
  ON c.merged_into_id = cm.customer_id

-- Join to Sales Rep Unified
LEFT JOIN fp_sales_rep_unified sr 
  ON UPPER(TRIM(d.salesrepname)) = sr.normalized_name
  AND sr.division = d.division

-- Join to Product Group Unified
LEFT JOIN fp_product_group_unified pg 
  ON UPPER(TRIM(d.productgroup)) = pg.normalized_name
  AND pg.division = d.division;

-- Step 2: Create materialized view for customer period summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_period_summary AS
SELECT 
  effective_customer_id,
  effective_customer_code,
  effective_customer_name,
  customer_country,
  sales_rep_group_id,
  sales_rep_group,
  year,
  data_type,
  country,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS morm,
  COUNT(DISTINCT product_group) AS product_group_count
FROM vw_unified_sales_data
WHERE effective_customer_id IS NOT NULL
GROUP BY 
  effective_customer_id,
  effective_customer_code,
  effective_customer_name,
  customer_country,
  sales_rep_group_id,
  sales_rep_group,
  year,
  data_type,
  country;

CREATE INDEX IF NOT EXISTS idx_mv_cust_period_year ON mv_customer_period_summary(year, data_type);
CREATE INDEX IF NOT EXISTS idx_mv_cust_period_id ON mv_customer_period_summary(effective_customer_id);
CREATE INDEX IF NOT EXISTS idx_mv_cust_period_group ON mv_customer_period_summary(sales_rep_group_id);

-- Step 3: Create materialized view for sales rep period summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_sales_rep_period_summary AS
SELECT 
  sales_rep_id,
  sales_rep_code,
  sales_rep_name,
  sales_rep_group_id,
  sales_rep_group,
  year,
  data_type,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS morm,
  COUNT(DISTINCT effective_customer_id) AS customer_count,
  COUNT(DISTINCT country) AS country_count
FROM vw_unified_sales_data
WHERE sales_rep_id IS NOT NULL
GROUP BY 
  sales_rep_id,
  sales_rep_code,
  sales_rep_name,
  sales_rep_group_id,
  sales_rep_group,
  year,
  data_type;

CREATE INDEX IF NOT EXISTS idx_mv_sr_period_year ON mv_sales_rep_period_summary(year, data_type);
CREATE INDEX IF NOT EXISTS idx_mv_sr_period_id ON mv_sales_rep_period_summary(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_mv_sr_period_group ON mv_sales_rep_period_summary(sales_rep_group_id);

-- Step 4: Create materialized view for product group period summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_product_group_period_summary AS
SELECT 
  pg_id,
  pg_code,
  product_group,
  material,
  process,
  pg_combined,
  year,
  data_type,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS morm,
  COUNT(DISTINCT effective_customer_id) AS customer_count
FROM vw_unified_sales_data
WHERE pg_id IS NOT NULL
GROUP BY 
  pg_id,
  pg_code,
  product_group,
  material,
  process,
  pg_combined,
  year,
  data_type;

CREATE INDEX IF NOT EXISTS idx_mv_pg_period_year ON mv_product_group_period_summary(year, data_type);
CREATE INDEX IF NOT EXISTS idx_mv_pg_period_id ON mv_product_group_period_summary(pg_id);
CREATE INDEX IF NOT EXISTS idx_mv_pg_period_combined ON mv_product_group_period_summary(pg_combined);

-- Step 5: Create materialized view for country period summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_country_period_summary AS
SELECT 
  country,
  year,
  data_type,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS morm,
  COUNT(DISTINCT effective_customer_id) AS customer_count,
  COUNT(DISTINCT sales_rep_id) AS sales_rep_count,
  COUNT(DISTINCT pg_id) AS product_group_count
FROM vw_unified_sales_data
WHERE country IS NOT NULL
GROUP BY 
  country,
  year,
  data_type;

CREATE INDEX IF NOT EXISTS idx_mv_country_period_year ON mv_country_period_summary(year, data_type);
CREATE INDEX IF NOT EXISTS idx_mv_country_period_country ON mv_country_period_summary(country);

-- Step 6: Create function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_unified_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_period_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sales_rep_period_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_group_period_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_country_period_summary;
  RAISE NOTICE 'All materialized views refreshed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create a convenience function to get unified customer data with period
CREATE OR REPLACE FUNCTION get_unified_customer_sales(
  p_year INTEGER,
  p_data_type VARCHAR DEFAULT 'Actual',
  p_sales_rep_group VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  customer_id INTEGER,
  customer_code VARCHAR,
  customer_name VARCHAR,
  country VARCHAR,
  sales_rep_group VARCHAR,
  amount DECIMAL,
  kgs DECIMAL,
  morm DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.effective_customer_id,
    m.effective_customer_code,
    m.effective_customer_name,
    m.country,
    m.sales_rep_group,
    m.amount,
    m.kgs,
    m.morm
  FROM mv_customer_period_summary m
  WHERE m.year = p_year
    AND m.data_type = p_data_type
    AND (p_sales_rep_group IS NULL OR m.sales_rep_group = p_sales_rep_group)
  ORDER BY m.effective_customer_name;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Output summary
DO $$
DECLARE
  view_rows BIGINT;
  cust_summary_rows BIGINT;
  sr_summary_rows BIGINT;
  pg_summary_rows BIGINT;
  country_summary_rows BIGINT;
BEGIN
  SELECT COUNT(*) INTO view_rows FROM vw_unified_sales_data;
  SELECT COUNT(*) INTO cust_summary_rows FROM mv_customer_period_summary;
  SELECT COUNT(*) INTO sr_summary_rows FROM mv_sales_rep_period_summary;
  SELECT COUNT(*) INTO pg_summary_rows FROM mv_product_group_period_summary;
  SELECT COUNT(*) INTO country_summary_rows FROM mv_country_period_summary;
  
  RAISE NOTICE '=== MIGRATION 303 COMPLETE ===';
  RAISE NOTICE 'Unified view rows: %', view_rows;
  RAISE NOTICE 'Customer summary rows: %', cust_summary_rows;
  RAISE NOTICE 'Sales rep summary rows: %', sr_summary_rows;
  RAISE NOTICE 'Product group summary rows: %', pg_summary_rows;
  RAISE NOTICE 'Country summary rows: %', country_summary_rows;
END $$;
