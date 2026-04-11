-- Migration 320: Add missing fp_data_excel columns to vw_unified_sales_complete
-- Date: 2026-01-05
-- Purpose: Include all original fp_data_excel columns in the unified view so dashboards can migrate

DROP VIEW IF EXISTS vw_unified_sales_complete CASCADE;

CREATE OR REPLACE VIEW vw_unified_sales_complete AS
SELECT 
  -- Original fp_data_excel columns (preserve for backward compatibility)
  d.id,
  d.year,
  d.month,
  d.salesrepname,
  d.customername,
  d.countryname,
  d.productgroup,
  d.itemgroupdescription,
  d.values_type,
  d.values,
  d.type,
  d.division,
  d.sourcesheet,
  d.uploaded_by,
  d.currency_code,
  d.exchange_rate_to_base,
  d.created_at,
  d.updated_at,
  
  -- Customer (with merge handling)
  CASE 
    WHEN cu.is_merged = TRUE THEN cu_target.customer_id
    ELSE cu.customer_id
  END AS customer_id,
  CASE 
    WHEN cu.is_merged = TRUE THEN cu_target.display_name
    ELSE cu.display_name
  END AS customer_name_unified,
  CASE 
    WHEN cu.is_merged = TRUE THEN cu_target.customer_code
    ELSE cu.customer_code
  END AS customer_code,
  cu.is_merged,
  
  -- Sales Rep (with group)
  sr.sales_rep_id,
  sr.display_name AS sales_rep_name_unified,
  sr.group_id AS sales_rep_group_id,
  sr.group_name AS sales_rep_group_name,
  
  -- Product Group (with PGCombine)
  pg.pg_id AS product_group_id,
  COALESCE(rpg.pg_combine, d.productgroup) AS pg_combine,
  COALESCE(pg.material, 'Others') AS material,
  COALESCE(pg.process, 'Others') AS process,
  COALESCE(pg.pg_combined, 'Others Others') AS material_process,
  pg.is_active AS product_group_is_active,
  
  -- Country (unified)
  co.id AS country_id,
  co.region AS country_region,
  co.market_type AS country_market_type,
  co.currency_code AS country_currency,
  co.continent,
  
  -- Values in AED (for unified reporting)
  CASE 
    WHEN d.values_type = 'AMOUNT' THEN 
      COALESCE(d.values * d.exchange_rate_to_base, d.values)
    ELSE d.values
  END AS values_in_aed,
  
  -- Company currency (dynamic from company settings)
  COALESCE(cu.company_currency, 'AED') AS company_currency
  
FROM fp_data_excel d

-- Join customer unified (handles merges)
LEFT JOIN fp_customer_unified cu 
  ON cu.normalized_name = UPPER(TRIM(d.customername))
LEFT JOIN fp_customer_unified cu_target 
  ON cu.merged_into_id = cu_target.customer_id

-- Join sales rep unified (handles groups)
LEFT JOIN fp_sales_rep_unified sr 
  ON sr.normalized_name = UPPER(TRIM(d.salesrepname))

-- Join product group (handles PGCombine and exclusions)
LEFT JOIN fp_raw_product_groups rpg 
  ON UPPER(TRIM(rpg.raw_product_group)) = UPPER(TRIM(d.productgroup))
LEFT JOIN fp_product_group_unified pg 
  ON pg.pg_combine_name = rpg.pg_combine 
  OR pg.normalized_name = UPPER(TRIM(rpg.pg_combine))

-- Join country master for unified country data
LEFT JOIN master_countries co
  ON UPPER(TRIM(co.country_name)) = UPPER(TRIM(d.countryname))

-- Filter: Only include active product groups (from Migration 318)
WHERE COALESCE(pg.is_active, true) = true;

-- Recreate materialized views that depend on this view
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_customer CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_sales_rep CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_product_group CASCADE;

CREATE MATERIALIZED VIEW mv_sales_by_customer AS
SELECT 
  customer_id,
  customer_name_unified AS customer_name,
  customer_code,
  sales_rep_group_name,
  countryname AS country,
  year,
  type AS data_type,
  pg_combine,
  material_process,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
  division,
  company_currency
FROM vw_unified_sales_complete
WHERE customer_id IS NOT NULL
GROUP BY 
  customer_id, customer_name_unified, customer_code,
  sales_rep_group_name, countryname, year, type,
  pg_combine, material_process, division, company_currency;

CREATE INDEX idx_mv_customer_year ON mv_sales_by_customer(customer_id, year);
CREATE INDEX idx_mv_customer_pg ON mv_sales_by_customer(customer_id, pg_combine);

COMMENT ON VIEW vw_unified_sales_complete IS 
'Master unified view that includes ALL original fp_data_excel columns plus unified enrichments. 
Original columns preserved for backward compatibility. Use *_unified suffix columns for merged/grouped data.';
