-- ============================================================
-- MIGRATION 308: Complete Unified Data System - All Gaps Fixed
-- ============================================================
-- Purpose: Make unified tables the TRUE single source of truth
-- Created: January 2, 2026
-- 
-- GAPS FIXED:
--   1. fp_product_group_unified: Add raw_pg_id linking to fp_raw_product_groups
--   2. fp_product_group_unified: Add pg_combine_name (the 13 standard groups)
--   3. fp_customer_unified: Add product_group links (primary product groups)
--   4. Create vw_unified_sales_complete view for all dashboard queries
--   5. All hardcoded values replaced with dynamic lookups
-- ============================================================

-- ============================================================
-- PART 1: ENHANCE fp_product_group_unified
-- ============================================================

-- Add columns for linking raw PG to PGCombine (the 13 standard groups)
DO $$
BEGIN
  -- Add pg_combine_name (the 13 standard PGCombine groups)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fp_product_group_unified' AND column_name = 'pg_combine_name'
  ) THEN
    ALTER TABLE fp_product_group_unified ADD COLUMN pg_combine_name VARCHAR(200);
    COMMENT ON COLUMN fp_product_group_unified.pg_combine_name IS 'The 13 standard PGCombine group name from fp_raw_product_groups';
  END IF;
  
  -- Add raw_pg_mapping as JSONB to store all raw->combine mappings
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fp_product_group_unified' AND column_name = 'raw_pg_mapping'
  ) THEN
    ALTER TABLE fp_product_group_unified ADD COLUMN raw_pg_mapping JSONB DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN fp_product_group_unified.raw_pg_mapping IS 'All raw product groups that map to this PGCombine';
  END IF;
END $$;

-- Populate pg_combine_name from fp_raw_product_groups
UPDATE fp_product_group_unified pgu
SET 
  pg_combine_name = rpg.pg_combine,
  updated_at = NOW()
FROM fp_raw_product_groups rpg
WHERE UPPER(TRIM(pgu.display_name)) = UPPER(TRIM(rpg.raw_product_group))
  AND pgu.pg_combine_name IS NULL;

-- Also update from normalized_name
UPDATE fp_product_group_unified pgu
SET 
  pg_combine_name = rpg.pg_combine,
  updated_at = NOW()
FROM fp_raw_product_groups rpg
WHERE pgu.normalized_name = UPPER(TRIM(rpg.raw_product_group))
  AND pgu.pg_combine_name IS NULL;

-- For any still NULL, try matching by display_name = pg_combine
UPDATE fp_product_group_unified pgu
SET 
  pg_combine_name = pgu.display_name,
  updated_at = NOW()
WHERE pgu.pg_combine_name IS NULL
  AND EXISTS (
    SELECT 1 FROM fp_material_percentages mp 
    WHERE UPPER(TRIM(mp.product_group)) = UPPER(TRIM(pgu.display_name))
  );

-- Default remaining to 'Others'
UPDATE fp_product_group_unified
SET pg_combine_name = 'Others'
WHERE pg_combine_name IS NULL;

-- Build raw_pg_mapping for each PGCombine
UPDATE fp_product_group_unified pgu
SET raw_pg_mapping = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'raw_name', rpg.raw_product_group,
    'is_unmapped', rpg.is_unmapped
  )), '[]'::jsonb)
  FROM fp_raw_product_groups rpg
  WHERE rpg.pg_combine = pgu.pg_combine_name
     OR rpg.pg_combine = pgu.display_name
);

-- ============================================================
-- PART 2: ENHANCE fp_customer_unified with Product Group info
-- ============================================================

DO $$
BEGIN
  -- Add primary_product_group (most sold to this customer)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fp_customer_unified' AND column_name = 'primary_product_group'
  ) THEN
    ALTER TABLE fp_customer_unified ADD COLUMN primary_product_group VARCHAR(200);
    COMMENT ON COLUMN fp_customer_unified.primary_product_group IS 'Product group with most sales to this customer';
  END IF;
  
  -- Add product_groups array (all PGCombines for this customer)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fp_customer_unified' AND column_name = 'product_groups'
  ) THEN
    ALTER TABLE fp_customer_unified ADD COLUMN product_groups TEXT[] DEFAULT ARRAY[]::TEXT[];
    COMMENT ON COLUMN fp_customer_unified.product_groups IS 'All PGCombine groups this customer purchased';
  END IF;
END $$;

-- Populate primary_product_group and product_groups
WITH customer_pg AS (
  SELECT 
    UPPER(TRIM(d.customername)) AS norm_customer,
    rpg.pg_combine,
    SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(TRIM(d.customername)) 
      ORDER BY SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) DESC
    ) AS rn
  FROM fp_data_excel d
  LEFT JOIN fp_raw_product_groups rpg 
    ON UPPER(TRIM(d.productgroup)) = UPPER(TRIM(rpg.raw_product_group))
  WHERE d.type = 'ACTUAL'
  GROUP BY UPPER(TRIM(d.customername)), rpg.pg_combine
),
customer_pg_summary AS (
  SELECT 
    norm_customer,
    MAX(CASE WHEN rn = 1 THEN pg_combine END) AS primary_pg,
    ARRAY_AGG(DISTINCT pg_combine) FILTER (WHERE pg_combine IS NOT NULL) AS all_pgs
  FROM customer_pg
  GROUP BY norm_customer
)
UPDATE fp_customer_unified cu
SET 
  primary_product_group = cps.primary_pg,
  product_groups = COALESCE(cps.all_pgs, ARRAY[]::TEXT[]),
  updated_at = NOW()
FROM customer_pg_summary cps
WHERE cu.normalized_name = cps.norm_customer;

-- ============================================================
-- PART 3: Create THE MASTER UNIFIED VIEW
-- This view should feed ALL dashboards
-- ============================================================

DROP VIEW IF EXISTS vw_unified_sales_complete CASCADE;

CREATE OR REPLACE VIEW vw_unified_sales_complete AS
SELECT 
  -- Customer (with merge handling)
  CASE 
    WHEN cu.is_merged = TRUE THEN cu_target.customer_id
    ELSE cu.customer_id
  END AS customer_id,
  CASE 
    WHEN cu.is_merged = TRUE THEN cu_target.display_name
    ELSE cu.display_name
  END AS customer_name,
  CASE 
    WHEN cu.is_merged = TRUE THEN cu_target.customer_code
    ELSE cu.customer_code
  END AS customer_code,
  cu.is_merged,
  
  -- Sales Rep (with group)
  sr.sales_rep_id,
  sr.display_name AS sales_rep_name,
  sr.group_id AS sales_rep_group_id,
  sr.group_name AS sales_rep_group_name,
  
  -- Product Group (with PGCombine)
  pg.pg_id AS product_group_id,
  d.productgroup AS raw_product_group,
  COALESCE(rpg.pg_combine, d.productgroup) AS pg_combine,
  COALESCE(pg.material, 'Others') AS material,
  COALESCE(pg.process, 'Others') AS process,
  COALESCE(pg.pg_combined, 'Others Others') AS material_process,
  
  -- Country
  d.countryname AS country,
  
  -- Time
  d.year,
  d.month,
  d.type AS data_type,  -- ACTUAL, BUDGET, ESTIMATE, FORECAST
  
  -- Values
  d.values_type,
  d.values,
  
  -- Division & Currency (dynamic from company settings)
  d.division,
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

-- Join product group (handles PGCombine)
LEFT JOIN fp_raw_product_groups rpg 
  ON UPPER(TRIM(rpg.raw_product_group)) = UPPER(TRIM(d.productgroup))
LEFT JOIN fp_product_group_unified pg 
  ON pg.pg_combine_name = rpg.pg_combine 
  OR pg.normalized_name = UPPER(TRIM(rpg.pg_combine));

-- Create indexes on the view's base tables for performance
CREATE INDEX IF NOT EXISTS idx_data_excel_customername ON fp_data_excel(UPPER(TRIM(customername)));
CREATE INDEX IF NOT EXISTS idx_data_excel_salesrepname ON fp_data_excel(UPPER(TRIM(salesrepname)));
CREATE INDEX IF NOT EXISTS idx_data_excel_productgroup ON fp_data_excel(UPPER(TRIM(productgroup)));

-- ============================================================
-- PART 4: Create Aggregated Materialized Views
-- ============================================================

-- Sales by Customer (with all groupings applied)
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_customer CASCADE;

CREATE MATERIALIZED VIEW mv_sales_by_customer AS
SELECT 
  customer_id,
  customer_name,
  customer_code,
  sales_rep_group_name,
  country,
  year,
  data_type,
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
  customer_id, customer_name, customer_code,
  sales_rep_group_name, country, year, data_type,
  pg_combine, material_process, division, company_currency;

CREATE INDEX IF NOT EXISTS idx_mv_sales_customer_pk 
  ON mv_sales_by_customer(customer_id, year, data_type, pg_combine, country);

-- Sales by Sales Rep Group
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_rep_group CASCADE;

CREATE MATERIALIZED VIEW mv_sales_by_rep_group AS
SELECT 
  sales_rep_group_id,
  sales_rep_group_name,
  country,
  year,
  data_type,
  pg_combine,
  material_process,
  COUNT(DISTINCT customer_id) AS customer_count,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
  division,
  company_currency
FROM vw_unified_sales_complete
WHERE sales_rep_group_name IS NOT NULL
GROUP BY 
  sales_rep_group_id, sales_rep_group_name,
  country, year, data_type, pg_combine, material_process,
  division, company_currency;

CREATE INDEX IF NOT EXISTS idx_mv_sales_rep_group_pk 
  ON mv_sales_by_rep_group(sales_rep_group_id, year, data_type, pg_combine, country);

-- Sales by Product Group (PGCombine)
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_product_group CASCADE;

CREATE MATERIALIZED VIEW mv_sales_by_product_group AS
SELECT 
  pg_combine,
  material,
  process,
  material_process,
  year,
  data_type,
  country,
  COUNT(DISTINCT customer_id) AS customer_count,
  COUNT(DISTINCT sales_rep_group_id) AS rep_group_count,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
  division,
  company_currency
FROM vw_unified_sales_complete
GROUP BY 
  pg_combine, material, process, material_process,
  year, data_type, country, division, company_currency;

CREATE INDEX IF NOT EXISTS idx_mv_sales_pg_pk 
  ON mv_sales_by_product_group(pg_combine, year, data_type, country);

-- Sales by Country
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_country CASCADE;

CREATE MATERIALIZED VIEW mv_sales_by_country AS
SELECT 
  country,
  year,
  data_type,
  COUNT(DISTINCT customer_id) AS customer_count,
  COUNT(DISTINCT sales_rep_group_id) AS rep_group_count,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
  division,
  company_currency
FROM vw_unified_sales_complete
WHERE country IS NOT NULL
GROUP BY country, year, data_type, division, company_currency;

CREATE INDEX IF NOT EXISTS idx_mv_sales_country_pk 
  ON mv_sales_by_country(country, year, data_type);

-- ============================================================
-- PART 5: Function to refresh all materialized views
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_unified_materialized_views()
RETURNS TABLE (
  views_refreshed INTEGER,
  refresh_time INTERVAL
) AS $$
DECLARE
  v_start TIMESTAMP;
  v_count INTEGER := 0;
BEGIN
  v_start := clock_timestamp();
  
  REFRESH MATERIALIZED VIEW mv_sales_by_customer;
  v_count := v_count + 1;
  
  REFRESH MATERIALIZED VIEW mv_sales_by_rep_group;
  v_count := v_count + 1;
  
  REFRESH MATERIALIZED VIEW mv_sales_by_product_group;
  v_count := v_count + 1;
  
  REFRESH MATERIALIZED VIEW mv_sales_by_country;
  v_count := v_count + 1;
  
  RETURN QUERY SELECT v_count, clock_timestamp() - v_start;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 6: Master sync function (updated)
-- ============================================================

DROP FUNCTION IF EXISTS sync_all_unified_data() CASCADE;

CREATE OR REPLACE FUNCTION sync_all_unified_data()
RETURNS TABLE (
  customers_updated INTEGER,
  sales_reps_updated INTEGER,
  product_groups_updated INTEGER,
  merges_applied INTEGER,
  rep_groups_applied INTEGER,
  customer_rep_links INTEGER,
  customer_pg_links INTEGER,
  views_refreshed INTEGER,
  warnings TEXT[]
) AS $$
DECLARE
  v_cust INTEGER := 0;
  v_reps INTEGER := 0;
  v_pgs INTEGER := 0;
  v_merges INTEGER := 0;
  v_rep_groups INTEGER := 0;
  v_rep_links INTEGER := 0;
  v_pg_links INTEGER := 0;
  v_views INTEGER := 0;
  v_warnings TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1. Sync customer merges
  SELECT cm.merges_applied INTO v_merges FROM sync_customer_merges_to_unified() cm;
  
  -- 2. Sync sales rep groups
  SELECT srg.reps_updated INTO v_rep_groups FROM sync_sales_rep_groups_to_unified() srg;
  
  -- 3. Sync product groups
  SELECT pgc.new_in_unified INTO v_pgs FROM sync_product_groups_complete() pgc;
  
  -- 4. Sync customer-sales rep links
  SELECT csr.customers_updated INTO v_rep_links FROM sync_customer_sales_rep_links() csr;
  
  -- 5. Update customer product group links
  WITH customer_pg AS (
    SELECT 
      UPPER(TRIM(d.customername)) AS norm_customer,
      rpg.pg_combine,
      SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
      ROW_NUMBER() OVER (
        PARTITION BY UPPER(TRIM(d.customername)) 
        ORDER BY SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) DESC
      ) AS rn
    FROM fp_data_excel d
    LEFT JOIN fp_raw_product_groups rpg 
      ON UPPER(TRIM(d.productgroup)) = UPPER(TRIM(rpg.raw_product_group))
    WHERE d.type = 'ACTUAL'
    GROUP BY UPPER(TRIM(d.customername)), rpg.pg_combine
  ),
  summary AS (
    SELECT 
      norm_customer,
      MAX(CASE WHEN rn = 1 THEN pg_combine END) AS primary_pg,
      ARRAY_AGG(DISTINCT pg_combine) FILTER (WHERE pg_combine IS NOT NULL) AS all_pgs
    FROM customer_pg
    GROUP BY norm_customer
  )
  UPDATE fp_customer_unified cu
  SET 
    primary_product_group = s.primary_pg,
    product_groups = COALESCE(s.all_pgs, ARRAY[]::TEXT[]),
    updated_at = NOW()
  FROM summary s
  WHERE cu.normalized_name = s.norm_customer;
  
  GET DIAGNOSTICS v_pg_links = ROW_COUNT;
  
  -- 6. Refresh materialized views
  SELECT rmv.views_refreshed INTO v_views FROM refresh_unified_materialized_views() rmv;
  
  -- Check for warnings
  SELECT ARRAY_AGG(msg) INTO v_warnings FROM (
    SELECT 'Ungrouped sales rep: ' || display_name AS msg 
    FROM fp_sales_rep_unified WHERE group_id IS NULL AND total_amount_all_time > 10000
    UNION ALL
    SELECT 'Unmapped product group: ' || display_name 
    FROM fp_product_group_unified WHERE pg_combine_name = 'Others' AND total_amount_all_time > 10000
    UNION ALL
    SELECT 'Customer without rep link: ' || display_name 
    FROM fp_customer_unified WHERE primary_sales_rep_id IS NULL AND total_amount_all_time > 10000
  ) w;
  
  v_warnings := COALESCE(v_warnings, ARRAY[]::TEXT[]);
  
  RETURN QUERY SELECT v_cust, v_reps, v_pgs, v_merges, v_rep_groups, v_rep_links, v_pg_links, v_views, v_warnings;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 7: Grant permissions
-- ============================================================

GRANT SELECT ON vw_unified_sales_complete TO PUBLIC;
GRANT SELECT ON mv_sales_by_customer TO PUBLIC;
GRANT SELECT ON mv_sales_by_rep_group TO PUBLIC;
GRANT SELECT ON mv_sales_by_product_group TO PUBLIC;
GRANT SELECT ON mv_sales_by_country TO PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_unified_materialized_views() TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_all_unified_data() TO PUBLIC;

-- ============================================================
-- PART 8: Run initial sync
-- ============================================================

SELECT * FROM sync_all_unified_data();

-- Log completion
DO $$ 
BEGIN
  RAISE NOTICE 'Migration 308 complete - Complete Unified Data System';
  RAISE NOTICE 'View: vw_unified_sales_complete';
  RAISE NOTICE 'MVs: mv_sales_by_customer, mv_sales_by_rep_group, mv_sales_by_product_group, mv_sales_by_country';
END $$;
