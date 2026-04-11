-- Migration 311: Auto-Sync Unified Tables on Data Upload
-- Creates triggers to automatically sync unified tables when fp_data_excel changes

-- ============================================================================
-- 1. CREATE OR REPLACE the main sync function (simplified for trigger use)
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_unified_on_data_change()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_norm TEXT;
  v_rep_norm TEXT;
  v_pg_norm TEXT;
  v_division TEXT := 'FP';
  v_currency TEXT := 'AED';
BEGIN
  -- Normalize names from the new row
  v_customer_norm := UPPER(TRIM(COALESCE(NEW.customername, '')));
  v_rep_norm := UPPER(TRIM(COALESCE(NEW.salesrepname, '')));
  v_pg_norm := UPPER(TRIM(COALESCE(NEW.productgroup, '')));

  -- ========== 1. SYNC CUSTOMER ==========
  IF v_customer_norm != '' AND NOT EXISTS (
    SELECT 1 FROM fp_customer_unified WHERE normalized_name = v_customer_norm
  ) THEN
    INSERT INTO fp_customer_unified (
      customer_code, display_name, normalized_name, is_active, is_merged,
      primary_sales_rep_name, primary_country, countries, 
      primary_product_group, product_groups,
      total_amount_all_time, total_kgs_all_time, total_morm_all_time,
      first_transaction_date, last_transaction_date, transaction_years,
      division, company_currency, created_at, updated_at
    )
    SELECT 
      'FP-CUST-AUTO-' || LPAD((COALESCE(MAX(customer_id), 0) + 1)::TEXT, 5, '0'),
      NEW.customername,
      v_customer_norm,
      true, false,
      NEW.salesrepname,
      COALESCE(NEW.countryname, 'Unknown'),
      ARRAY[COALESCE(NEW.countryname, 'Unknown')],
      NEW.productgroup,
      ARRAY[NEW.productgroup],
      0, 0, 0,
      CURRENT_DATE, CURRENT_DATE,
      ARRAY[NEW.year],
      v_division, v_currency, NOW(), NOW()
    FROM fp_customer_unified;
  END IF;

  -- ========== 2. SYNC SALES REP ==========
  IF v_rep_norm != '' AND NOT EXISTS (
    SELECT 1 FROM fp_sales_rep_unified WHERE normalized_name = v_rep_norm
  ) THEN
    -- Find group from sales_rep_groups
    INSERT INTO fp_sales_rep_unified (
      sales_rep_code, display_name, normalized_name,
      group_id, group_name, is_active,
      total_amount_all_time, total_kgs_all_time, total_morm_all_time,
      customer_count, country_count,
      first_transaction_date, last_transaction_date,
      division, company_currency, created_at, updated_at
    )
    SELECT 
      'FP-REP-AUTO-' || LPAD((COALESCE(MAX(sales_rep_id), 0) + 1)::TEXT, 4, '0'),
      NEW.salesrepname,
      v_rep_norm,
      COALESCE(srg.id, 2), -- 2 = 'Others' group
      COALESCE(srg.group_name, 'Others'),
      true,
      0, 0, 0, 0, 0,
      CURRENT_DATE, CURRENT_DATE,
      v_division, v_currency, NOW(), NOW()
    FROM fp_sales_rep_unified
    LEFT JOIN sales_rep_groups srg ON EXISTS (
      SELECT 1 FROM sales_rep_group_members srgm 
      WHERE srgm.group_id = srg.id 
      AND UPPER(TRIM(srgm.sales_rep_name)) = v_rep_norm
    );
  END IF;

  -- ========== 3. SYNC PRODUCT GROUP ==========
  IF v_pg_norm != '' AND NOT EXISTS (
    SELECT 1 FROM fp_product_group_unified WHERE normalized_name = v_pg_norm
  ) THEN
    -- Find pg_combine from mapping
    INSERT INTO fp_product_group_unified (
      pg_code, display_name, normalized_name,
      material, process, pg_combined, pg_combine_name,
      raw_pg_mapping, raw_names,
      total_amount_all_time, total_kgs_all_time, total_morm_all_time,
      is_active, division, company_currency, created_at, updated_at
    )
    SELECT 
      'FP-PG-AUTO-' || LPAD((COALESCE(MAX(pg_id), 0) + 1)::TEXT, 3, '0'),
      NEW.productgroup,
      v_pg_norm,
      COALESCE(rpg.material, 'Others'),
      COALESCE(rpg.process, 'Others'),
      COALESCE(rpg.material || ' ' || rpg.process, 'Others Others'),
      COALESCE(rpg.pg_combine, 'Others'),
      COALESCE(jsonb_build_array(jsonb_build_object('raw', NEW.productgroup, 'pg_combine', rpg.pg_combine)), '[]'::jsonb),
      ARRAY[NEW.productgroup],
      0, 0, 0,
      true, v_division, v_currency, NOW(), NOW()
    FROM fp_product_group_unified
    LEFT JOIN fp_raw_product_groups rpg ON UPPER(TRIM(rpg.raw_product_group)) = v_pg_norm;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. CREATE TRIGGER for auto-sync on INSERT
-- ============================================================================
DROP TRIGGER IF EXISTS trg_sync_unified_on_insert ON fp_data_excel;

CREATE TRIGGER trg_sync_unified_on_insert
  AFTER INSERT ON fp_data_excel
  FOR EACH ROW
  EXECUTE FUNCTION sync_unified_on_data_change();

-- ============================================================================
-- 3. CREATE function to refresh stats after bulk upload
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_unified_stats()
RETURNS TABLE(
  customers_updated INT,
  reps_updated INT,
  pgs_updated INT,
  mv_refreshed INT
) AS $$
DECLARE
  v_cust INT := 0;
  v_rep INT := 0;
  v_pg INT := 0;
  v_mv INT := 0;
BEGIN
  -- Update customer stats
  WITH cust_stats AS (
    SELECT 
      UPPER(TRIM(customername)) as norm_name,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as total_amt,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) as total_morm,
      MIN(MAKE_DATE(year, month, 1)) as first_txn,
      MAX(MAKE_DATE(year, month, 1)) as last_txn,
      ARRAY_AGG(DISTINCT year ORDER BY year) as years
    FROM fp_data_excel
    WHERE type = 'ACTUAL'
    GROUP BY UPPER(TRIM(customername))
  )
  UPDATE fp_customer_unified cu
  SET 
    total_amount_all_time = cs.total_amt,
    total_kgs_all_time = cs.total_kgs,
    total_morm_all_time = cs.total_morm,
    first_transaction_date = cs.first_txn,
    last_transaction_date = cs.last_txn,
    transaction_years = cs.years,
    updated_at = NOW()
  FROM cust_stats cs
  WHERE cu.normalized_name = cs.norm_name;
  
  GET DIAGNOSTICS v_cust = ROW_COUNT;

  -- Update sales rep stats
  WITH rep_stats AS (
    SELECT 
      UPPER(TRIM(salesrepname)) as norm_name,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as total_amt,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) as total_morm,
      COUNT(DISTINCT customername) as cust_count,
      COUNT(DISTINCT countryname) as country_count,
      MIN(MAKE_DATE(year, month, 1)) as first_txn,
      MAX(MAKE_DATE(year, month, 1)) as last_txn
    FROM fp_data_excel
    WHERE type = 'ACTUAL'
    GROUP BY UPPER(TRIM(salesrepname))
  )
  UPDATE fp_sales_rep_unified ru
  SET 
    total_amount_all_time = rs.total_amt,
    total_kgs_all_time = rs.total_kgs,
    total_morm_all_time = rs.total_morm,
    customer_count = rs.cust_count,
    country_count = rs.country_count,
    first_transaction_date = rs.first_txn,
    last_transaction_date = rs.last_txn,
    updated_at = NOW()
  FROM rep_stats rs
  WHERE ru.normalized_name = rs.norm_name;
  
  GET DIAGNOSTICS v_rep = ROW_COUNT;

  -- Update product group stats
  WITH pg_stats AS (
    SELECT 
      UPPER(TRIM(productgroup)) as norm_name,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as total_amt,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) as total_morm
    FROM fp_data_excel
    WHERE type = 'ACTUAL'
    GROUP BY UPPER(TRIM(productgroup))
  )
  UPDATE fp_product_group_unified pu
  SET 
    total_amount_all_time = ps.total_amt,
    total_kgs_all_time = ps.total_kgs,
    total_morm_all_time = ps.total_morm,
    updated_at = NOW()
  FROM pg_stats ps
  WHERE pu.normalized_name = ps.norm_name;
  
  GET DIAGNOSTICS v_pg = ROW_COUNT;

  -- Refresh materialized views
  REFRESH MATERIALIZED VIEW mv_sales_by_customer;
  REFRESH MATERIALIZED VIEW mv_sales_by_rep_group;
  REFRESH MATERIALIZED VIEW mv_sales_by_product_group;
  REFRESH MATERIALIZED VIEW mv_sales_by_country;
  v_mv := 4;

  RETURN QUERY SELECT v_cust, v_rep, v_pg, v_mv;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. GRANT permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION sync_unified_on_data_change() TO PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_unified_stats() TO PUBLIC;

-- Show confirmation
SELECT 'Migration 311 Complete - Auto-sync triggers installed' as status;
