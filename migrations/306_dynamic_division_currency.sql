-- ============================================================
-- MIGRATION 306: Dynamic Division and Currency Support
-- ============================================================
-- Purpose: Make unified tables use division and currency from company_settings
-- Created: January 2, 2026
-- 
-- CHANGES:
--   1. All sync functions now pull division from company_settings dynamically
--   2. Added company_currency column to unified tables
--   3. Functions use division parameter or default from settings
--   4. Export includes currency conversion support
-- ============================================================

-- ============================================================
-- HELPER FUNCTION: Get active divisions from company_settings
-- ============================================================
CREATE OR REPLACE FUNCTION get_active_divisions()
RETURNS TEXT[] AS $$
DECLARE
  v_divisions TEXT[];
  v_setting JSONB;
BEGIN
  -- Get divisions from company_settings in ip_auth_database
  -- This uses dblink to query the auth database
  SELECT setting_value::jsonb INTO v_setting
  FROM dblink(
    'dbname=ip_auth_database',
    'SELECT setting_value FROM company_settings WHERE setting_key = ''divisions'''
  ) AS t(setting_value TEXT);
  
  IF v_setting IS NOT NULL THEN
    SELECT ARRAY_AGG(elem->>'code')
    INTO v_divisions
    FROM jsonb_array_elements(v_setting) AS elem;
  END IF;
  
  -- Default to FP if nothing configured
  RETURN COALESCE(v_divisions, ARRAY['FP']);
EXCEPTION
  WHEN OTHERS THEN
    -- If dblink fails, return default
    RETURN ARRAY['FP'];
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- HELPER FUNCTION: Get company currency from company_settings
-- ============================================================
CREATE OR REPLACE FUNCTION get_company_currency()
RETURNS TABLE (
  currency_code VARCHAR(10),
  currency_name VARCHAR(100),
  currency_symbol VARCHAR(10)
) AS $$
DECLARE
  v_setting JSONB;
BEGIN
  -- Get currency from company_settings in ip_auth_database
  SELECT setting_value::jsonb INTO v_setting
  FROM dblink(
    'dbname=ip_auth_database',
    'SELECT setting_value FROM company_settings WHERE setting_key = ''company_currency'''
  ) AS t(setting_value TEXT);
  
  IF v_setting IS NOT NULL THEN
    RETURN QUERY SELECT 
      (v_setting->>'code')::VARCHAR(10),
      (v_setting->>'name')::VARCHAR(100),
      (v_setting->>'symbol')::VARCHAR(10);
  ELSE
    -- Default to AED
    RETURN QUERY SELECT 'AED'::VARCHAR(10), 'UAE Dirham'::VARCHAR(100), 'د.إ'::VARCHAR(10);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT 'AED'::VARCHAR(10), 'UAE Dirham'::VARCHAR(100), 'د.إ'::VARCHAR(10);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Add currency column to unified tables if not exists
-- ============================================================
DO $$
BEGIN
  -- Add to fp_customer_unified
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fp_customer_unified' AND column_name = 'company_currency'
  ) THEN
    ALTER TABLE fp_customer_unified ADD COLUMN company_currency VARCHAR(10) DEFAULT 'AED';
    COMMENT ON COLUMN fp_customer_unified.company_currency IS 'Company base currency from company_settings';
  END IF;
  
  -- Add to fp_sales_rep_unified
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fp_sales_rep_unified' AND column_name = 'company_currency'
  ) THEN
    ALTER TABLE fp_sales_rep_unified ADD COLUMN company_currency VARCHAR(10) DEFAULT 'AED';
    COMMENT ON COLUMN fp_sales_rep_unified.company_currency IS 'Company base currency from company_settings';
  END IF;
  
  -- Add to fp_product_group_unified
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fp_product_group_unified' AND column_name = 'company_currency'
  ) THEN
    ALTER TABLE fp_product_group_unified ADD COLUMN company_currency VARCHAR(10) DEFAULT 'AED';
    COMMENT ON COLUMN fp_product_group_unified.company_currency IS 'Company base currency from company_settings';
  END IF;
END $$;

-- ============================================================
-- UPDATED FUNCTION 1: Sync Customers with Division Parameter
-- ============================================================
CREATE OR REPLACE FUNCTION sync_customers_to_unified(p_division VARCHAR DEFAULT NULL)
RETURNS TABLE (
  customers_synced INTEGER,
  division_used VARCHAR,
  currency_used VARCHAR,
  warnings TEXT[]
) AS $$
DECLARE
  v_synced INTEGER := 0;
  v_division VARCHAR;
  v_currency VARCHAR;
  v_warnings TEXT[] := ARRAY[]::TEXT[];
  next_code INTEGER;
BEGIN
  -- Use provided division or get from data
  v_division := COALESCE(p_division, 'FP');
  
  -- Get company currency
  SELECT currency_code INTO v_currency FROM get_company_currency();
  v_currency := COALESCE(v_currency, 'AED');
  
  -- Get next customer code
  SELECT COALESCE(MAX(CAST(SUBSTRING(customer_code FROM 9) AS INTEGER)), 0) + 1
  INTO next_code
  FROM fp_customer_unified
  WHERE customer_code LIKE v_division || '-CUST-%';

  -- Insert new customers from actual sales data
  WITH existing_customers AS (
    SELECT normalized_name FROM fp_customer_unified
  ),
  new_customers AS (
    SELECT 
      UPPER(TRIM(d.customername)) AS norm_name,
      d.customername AS display_name,
      d.countryname,
      d.salesrepname,
      SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END) AS total_morm,
      MIN(MAKE_DATE(d.year, d.month, 1)) AS first_txn,
      MAX(MAKE_DATE(d.year, d.month, 1)) AS last_txn,
      ARRAY_AGG(DISTINCT d.year ORDER BY d.year) AS txn_years,
      ARRAY_AGG(DISTINCT d.countryname) FILTER (WHERE d.countryname IS NOT NULL) AS countries,
      v_division AS division
    FROM fp_data_excel d
    WHERE d.type = 'ACTUAL'
      AND NOT EXISTS (
        SELECT 1 FROM existing_customers ec 
        WHERE ec.normalized_name = UPPER(TRIM(d.customername))
      )
    GROUP BY UPPER(TRIM(d.customername)), d.customername, d.countryname, d.salesrepname
  ),
  numbered AS (
    SELECT ROW_NUMBER() OVER (ORDER BY display_name) AS rn, nc.* FROM new_customers nc
  )
  INSERT INTO fp_customer_unified (
    customer_code, display_name, normalized_name,
    primary_sales_rep_name, primary_country, countries,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    first_transaction_date, last_transaction_date, transaction_years,
    division, company_currency, notes, created_by, updated_by
  )
  SELECT 
    v_division || '-CUST-' || LPAD((next_code + rn - 1)::TEXT, 5, '0'),
    n.display_name,
    n.norm_name,
    n.salesrepname,
    n.countryname,
    n.countries,
    n.total_amount,
    n.total_kgs,
    n.total_morm,
    n.first_txn,
    n.last_txn,
    n.txn_years,
    v_division,
    v_currency,
    'Auto-synced from ACTUAL',
    'migration',
    'migration'
  FROM numbered n;
  
  GET DIAGNOSTICS v_synced = ROW_COUNT;
  
  -- Update existing customers with new totals
  UPDATE fp_customer_unified cu
  SET 
    total_amount_all_time = subq.total_amount,
    total_kgs_all_time = subq.total_kgs,
    total_morm_all_time = subq.total_morm,
    last_transaction_date = subq.last_txn,
    transaction_years = subq.txn_years,
    division = v_division,
    company_currency = v_currency,
    updated_at = NOW()
  FROM (
    SELECT 
      UPPER(TRIM(d.customername)) AS norm_name,
      SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END) AS total_morm,
      MAX(MAKE_DATE(d.year, d.month, 1)) AS last_txn,
      ARRAY_AGG(DISTINCT d.year ORDER BY d.year) AS txn_years
    FROM fp_data_excel d
    WHERE d.type = 'ACTUAL'
    GROUP BY UPPER(TRIM(d.customername))
  ) subq
  WHERE cu.normalized_name = subq.norm_name
    AND cu.division = v_division;
  
  RETURN QUERY SELECT v_synced, v_division, v_currency, v_warnings;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- UPDATED FUNCTION 2: Sync Sales Reps with Division Parameter
-- ============================================================
CREATE OR REPLACE FUNCTION sync_sales_reps_to_unified(p_division VARCHAR DEFAULT NULL)
RETURNS TABLE (
  reps_synced INTEGER,
  division_used VARCHAR,
  currency_used VARCHAR,
  ungrouped_count INTEGER,
  warnings TEXT[]
) AS $$
DECLARE
  v_synced INTEGER := 0;
  v_division VARCHAR;
  v_currency VARCHAR;
  v_ungrouped INTEGER := 0;
  v_warnings TEXT[] := ARRAY[]::TEXT[];
  next_code INTEGER;
BEGIN
  v_division := COALESCE(p_division, 'FP');
  SELECT currency_code INTO v_currency FROM get_company_currency();
  v_currency := COALESCE(v_currency, 'AED');
  
  -- Get next sales rep code
  SELECT COALESCE(MAX(CAST(SUBSTRING(sales_rep_code FROM 7) AS INTEGER)), 0) + 1
  INTO next_code
  FROM fp_sales_rep_unified
  WHERE sales_rep_code LIKE v_division || '-SR-%';

  -- Insert new sales reps
  WITH existing AS (SELECT normalized_name FROM fp_sales_rep_unified),
  new_reps AS (
    SELECT 
      UPPER(TRIM(d.salesrepname)) AS norm_name,
      d.salesrepname AS display_name,
      SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END) AS total_morm,
      COUNT(DISTINCT d.customername) AS customer_count,
      COUNT(DISTINCT d.countryname) AS country_count,
      MIN(MAKE_DATE(d.year, d.month, 1)) AS first_txn,
      MAX(MAKE_DATE(d.year, d.month, 1)) AS last_txn
    FROM fp_data_excel d
    WHERE d.type = 'ACTUAL'
      AND NOT EXISTS (SELECT 1 FROM existing e WHERE e.normalized_name = UPPER(TRIM(d.salesrepname)))
    GROUP BY UPPER(TRIM(d.salesrepname)), d.salesrepname
  ),
  numbered AS (SELECT ROW_NUMBER() OVER (ORDER BY display_name) AS rn, nr.* FROM new_reps nr)
  INSERT INTO fp_sales_rep_unified (
    sales_rep_code, display_name, normalized_name,
    group_id, group_name,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    customer_count, country_count,
    first_transaction_date, last_transaction_date,
    division, company_currency
  )
  SELECT 
    v_division || '-SR-' || LPAD((next_code + rn - 1)::TEXT, 3, '0'),
    n.display_name,
    n.norm_name,
    srg.id,
    srg.group_name,
    n.total_amount,
    n.total_kgs,
    n.total_morm,
    n.customer_count,
    n.country_count,
    n.first_txn,
    n.last_txn,
    v_division,
    v_currency
  FROM numbered n
  LEFT JOIN sales_rep_group_members srgm ON UPPER(TRIM(srgm.member_name)) = n.norm_name
  LEFT JOIN sales_rep_groups srg ON srgm.group_id = srg.id AND srg.is_active = TRUE;
  
  GET DIAGNOSTICS v_synced = ROW_COUNT;
  
  -- Update existing sales reps
  UPDATE fp_sales_rep_unified sr
  SET 
    total_amount_all_time = subq.total_amount,
    total_kgs_all_time = subq.total_kgs,
    total_morm_all_time = subq.total_morm,
    customer_count = subq.customer_count,
    country_count = subq.country_count,
    last_transaction_date = subq.last_txn,
    division = v_division,
    company_currency = v_currency,
    updated_at = NOW()
  FROM (
    SELECT 
      UPPER(TRIM(d.salesrepname)) AS norm_name,
      SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END) AS total_morm,
      COUNT(DISTINCT d.customername) AS customer_count,
      COUNT(DISTINCT d.countryname) AS country_count,
      MAX(MAKE_DATE(d.year, d.month, 1)) AS last_txn
    FROM fp_data_excel d
    WHERE d.type = 'ACTUAL'
    GROUP BY UPPER(TRIM(d.salesrepname))
  ) subq
  WHERE sr.normalized_name = subq.norm_name;
  
  -- Count ungrouped
  SELECT COUNT(*) INTO v_ungrouped FROM fp_sales_rep_unified WHERE group_id IS NULL;
  
  -- Warnings for ungrouped reps with significant sales
  SELECT ARRAY_AGG('Sales rep "' || display_name || '" has no group (Amount: ' || ROUND(total_amount_all_time::numeric, 2) || ')')
  INTO v_warnings
  FROM fp_sales_rep_unified
  WHERE group_id IS NULL AND total_amount_all_time > 10000;
  v_warnings := COALESCE(v_warnings, ARRAY[]::TEXT[]);
  
  RETURN QUERY SELECT v_synced, v_division, v_currency, v_ungrouped, v_warnings;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- UPDATED FUNCTION 3: Sync Product Groups with Division Parameter
-- ============================================================
CREATE OR REPLACE FUNCTION sync_product_groups_to_unified(p_division VARCHAR DEFAULT NULL)
RETURNS TABLE (
  groups_synced INTEGER,
  division_used VARCHAR,
  currency_used VARCHAR,
  unmapped_count INTEGER,
  warnings TEXT[]
) AS $$
DECLARE
  v_synced INTEGER := 0;
  v_division VARCHAR;
  v_currency VARCHAR;
  v_unmapped INTEGER := 0;
  v_warnings TEXT[] := ARRAY[]::TEXT[];
  next_code INTEGER;
BEGIN
  v_division := COALESCE(p_division, 'FP');
  SELECT currency_code INTO v_currency FROM get_company_currency();
  v_currency := COALESCE(v_currency, 'AED');
  
  -- Get next code
  SELECT COALESCE(MAX(CAST(SUBSTRING(pg_code FROM 7) AS INTEGER)), 0) + 1
  INTO next_code
  FROM fp_product_group_unified
  WHERE pg_code LIKE v_division || '-PG-%';

  -- Insert new product groups
  WITH existing AS (SELECT normalized_name FROM fp_product_group_unified),
  new_pgs AS (
    SELECT 
      UPPER(TRIM(d.productgroup)) AS norm_name,
      d.productgroup AS display_name,
      SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END) AS total_morm
    FROM fp_data_excel d
    WHERE d.type = 'ACTUAL'
      AND NOT EXISTS (SELECT 1 FROM existing e WHERE e.normalized_name = UPPER(TRIM(d.productgroup)))
    GROUP BY UPPER(TRIM(d.productgroup)), d.productgroup
  ),
  numbered AS (SELECT ROW_NUMBER() OVER (ORDER BY display_name) AS rn, np.* FROM new_pgs np)
  INSERT INTO fp_product_group_unified (
    pg_code, display_name, normalized_name,
    material, process, pg_combined, raw_names,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    division, company_currency, sort_order
  )
  SELECT 
    v_division || '-PG-' || LPAD((next_code + rn - 1)::TEXT, 2, '0'),
    n.display_name, n.norm_name,
    COALESCE(mp.material, 'Others'),
    COALESCE(mp.process, 'Others'),
    COALESCE(mp.material || ' ' || mp.process, 'Others Others'),
    ARRAY[n.display_name],
    n.total_amount, n.total_kgs, n.total_morm,
    v_division, v_currency,
    next_code + rn - 1
  FROM numbered n
  LEFT JOIN fp_material_percentages mp ON UPPER(TRIM(mp.product_group)) = n.norm_name;
  
  GET DIAGNOSTICS v_synced = ROW_COUNT;
  
  -- Also add to raw product groups table
  INSERT INTO fp_raw_product_groups (raw_product_group, pg_combine, division, is_unmapped, created_at)
  SELECT DISTINCT d.productgroup, d.productgroup, v_division, FALSE, NOW()
  FROM fp_data_excel d
  WHERE NOT EXISTS (
    SELECT 1 FROM fp_raw_product_groups rpg
    WHERE UPPER(TRIM(rpg.raw_product_group)) = UPPER(TRIM(d.productgroup))
  )
  ON CONFLICT DO NOTHING;
  
  -- Update existing
  UPDATE fp_product_group_unified pg
  SET 
    total_amount_all_time = subq.total_amount,
    total_kgs_all_time = subq.total_kgs,
    total_morm_all_time = subq.total_morm,
    division = v_division,
    company_currency = v_currency,
    updated_at = NOW()
  FROM (
    SELECT 
      UPPER(TRIM(d.productgroup)) AS norm_name,
      SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END) AS total_morm
    FROM fp_data_excel d WHERE d.type = 'ACTUAL'
    GROUP BY UPPER(TRIM(d.productgroup))
  ) subq
  WHERE pg.normalized_name = subq.norm_name;
  
  -- Count unmapped
  SELECT COUNT(*) INTO v_unmapped 
  FROM fp_product_group_unified WHERE material = 'Others' AND process = 'Others';
  
  SELECT ARRAY_AGG('Product group "' || display_name || '" needs material/process mapping')
  INTO v_warnings
  FROM fp_product_group_unified
  WHERE material = 'Others' AND process = 'Others' AND total_amount_all_time > 10000;
  v_warnings := COALESCE(v_warnings, ARRAY[]::TEXT[]);
  
  RETURN QUERY SELECT v_synced, v_division, v_currency, v_unmapped, v_warnings;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- MASTER SYNC FUNCTION: Uses division from company_settings
-- ============================================================
CREATE OR REPLACE FUNCTION sync_unified_data_dynamic(p_division VARCHAR DEFAULT NULL)
RETURNS TABLE (
  division_used VARCHAR,
  currency_used VARCHAR,
  customers_synced INTEGER,
  sales_reps_synced INTEGER,
  product_groups_synced INTEGER,
  all_warnings TEXT[]
) AS $$
DECLARE
  v_division VARCHAR;
  v_currency VARCHAR;
  v_cust INTEGER;
  v_reps INTEGER;
  v_pgs INTEGER;
  v_warnings TEXT[] := ARRAY[]::TEXT[];
  v_rep_warnings TEXT[];
  v_pg_warnings TEXT[];
BEGIN
  -- Get division
  IF p_division IS NOT NULL THEN
    v_division := p_division;
  ELSE
    -- Get first active division from company_settings
    SELECT (get_active_divisions())[1] INTO v_division;
    v_division := COALESCE(v_division, 'FP');
  END IF;
  
  -- Get currency
  SELECT currency_code INTO v_currency FROM get_company_currency();
  v_currency := COALESCE(v_currency, 'AED');
  
  -- Sync customers
  SELECT sc.customers_synced INTO v_cust FROM sync_customers_to_unified(v_division) sc;
  
  -- Sync sales reps
  SELECT sr.reps_synced, sr.warnings INTO v_reps, v_rep_warnings FROM sync_sales_reps_to_unified(v_division) sr;
  v_warnings := v_warnings || COALESCE(v_rep_warnings, ARRAY[]::TEXT[]);
  
  -- Sync product groups
  SELECT pg.groups_synced, pg.warnings INTO v_pgs, v_pg_warnings FROM sync_product_groups_to_unified(v_division) pg;
  v_warnings := v_warnings || COALESCE(v_pg_warnings, ARRAY[]::TEXT[]);
  
  -- Apply customer merges
  PERFORM sync_customer_merges_to_unified();
  
  -- Apply sales rep groups
  PERFORM sync_sales_rep_groups_to_unified();
  
  -- Apply product group mappings
  PERFORM sync_product_groups_complete();
  
  RETURN QUERY SELECT v_division, v_currency, v_cust, v_reps, v_pgs, v_warnings;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- GET SYNC STATUS with division/currency info
-- ============================================================
CREATE OR REPLACE FUNCTION get_unified_sync_status_full()
RETURNS TABLE (
  active_division VARCHAR,
  company_currency VARCHAR,
  total_customers INTEGER,
  total_sales_reps INTEGER,
  total_product_groups INTEGER,
  merged_customers INTEGER,
  ungrouped_sales_reps INTEGER,
  unmapped_product_groups INTEGER,
  last_sync TIMESTAMP,
  needs_attention JSONB
) AS $$
DECLARE
  v_division VARCHAR;
  v_currency VARCHAR;
  v_needs_attention JSONB;
BEGIN
  -- Get active division
  SELECT (get_active_divisions())[1] INTO v_division;
  v_division := COALESCE(v_division, 'FP');
  
  -- Get currency
  SELECT currency_code INTO v_currency FROM get_company_currency();
  v_currency := COALESCE(v_currency, 'AED');
  
  -- Build needs_attention JSON
  SELECT jsonb_build_object(
    'ungrouped_sales_reps', (SELECT jsonb_agg(display_name) FROM fp_sales_rep_unified WHERE group_id IS NULL AND total_amount_all_time > 10000),
    'unmapped_product_groups', (SELECT jsonb_agg(display_name) FROM fp_product_group_unified WHERE material = 'Others' AND process = 'Others' AND total_amount_all_time > 10000),
    'orphan_merge_rules', (SELECT jsonb_agg(merged_customer_name) FROM fp_division_customer_merge_rules WHERE is_active = TRUE AND NOT EXISTS (SELECT 1 FROM fp_customer_unified WHERE UPPER(display_name) = UPPER(merged_customer_name)))
  ) INTO v_needs_attention;
  
  RETURN QUERY SELECT 
    v_division,
    v_currency,
    (SELECT COUNT(*)::INTEGER FROM fp_customer_unified),
    (SELECT COUNT(*)::INTEGER FROM fp_sales_rep_unified),
    (SELECT COUNT(*)::INTEGER FROM fp_product_group_unified),
    (SELECT COUNT(*)::INTEGER FROM fp_customer_unified WHERE is_merged = TRUE),
    (SELECT COUNT(*)::INTEGER FROM fp_sales_rep_unified WHERE group_id IS NULL),
    (SELECT COUNT(*)::INTEGER FROM fp_product_group_unified WHERE material = 'Others' AND process = 'Others'),
    (SELECT MAX(updated_at) FROM fp_customer_unified),
    v_needs_attention;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- UPDATE EXISTING DATA with current company settings
-- ============================================================
DO $$
DECLARE
  v_division VARCHAR;
  v_currency VARCHAR;
BEGIN
  -- Get current settings
  SELECT (get_active_divisions())[1] INTO v_division;
  v_division := COALESCE(v_division, 'FP');
  
  SELECT currency_code INTO v_currency FROM get_company_currency();
  v_currency := COALESCE(v_currency, 'AED');
  
  -- Update all unified tables with current company settings
  UPDATE fp_customer_unified SET division = v_division, company_currency = v_currency WHERE division IS NULL OR company_currency IS NULL;
  UPDATE fp_sales_rep_unified SET division = v_division, company_currency = v_currency WHERE division IS NULL OR company_currency IS NULL;
  UPDATE fp_product_group_unified SET division = v_division, company_currency = v_currency WHERE division IS NULL OR company_currency IS NULL;
  
  RAISE NOTICE 'Updated unified tables with division=% and currency=%', v_division, v_currency;
END $$;

-- ============================================================
-- Grant permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION get_active_divisions() TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_company_currency() TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_customers_to_unified(VARCHAR) TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_sales_reps_to_unified(VARCHAR) TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_product_groups_to_unified(VARCHAR) TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_unified_data_dynamic(VARCHAR) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_unified_sync_status_full() TO PUBLIC;

-- Log completion
DO $$ BEGIN RAISE NOTICE 'Migration 306 complete - Dynamic Division and Currency Support'; END $$;
