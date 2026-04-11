-- ============================================================
-- MIGRATION 305: Complete Dynamic Sync System
-- ============================================================
-- Purpose: Fix all gaps found in audit - make system truly dynamic
-- Created: January 1, 2026
-- 
-- GAPS FIXED:
--   1. Customer merging now syncs from fp_division_customer_merge_rules
--   2. Sales rep group changes propagate to unified table
--   3. New product groups auto-add to fp_raw_product_groups
--   4. Returns detailed warnings for items needing admin attention
-- ============================================================

-- ============================================================
-- FUNCTION 1: Sync Customer Merges from Rules → Unified
-- ============================================================
CREATE OR REPLACE FUNCTION sync_customer_merges_to_unified()
RETURNS TABLE (
  merges_applied INTEGER,
  customers_marked_merged INTEGER,
  warnings TEXT[]
) AS $$
DECLARE
  v_merges_applied INTEGER := 0;
  v_customers_marked INTEGER := 0;
  v_warnings TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Step 1: Reset all is_merged flags first
  UPDATE fp_customer_unified 
  SET is_merged = FALSE, merged_into_id = NULL, original_names = ARRAY[]::TEXT[]
  WHERE is_merged = TRUE;

  -- Step 2: For each active merge rule, mark source customers as merged
  WITH active_rules AS (
    SELECT 
      mr.id AS rule_id,
      mr.merged_customer_name,
      mr.original_customers,
      mr.division
    FROM fp_division_customer_merge_rules mr
    WHERE mr.is_active = TRUE 
      AND mr.status = 'ACTIVE'
  ),
  -- Find the target customer (the one to merge INTO)
  target_customers AS (
    SELECT 
      ar.rule_id,
      ar.merged_customer_name,
      ar.original_customers,
      cu.customer_id AS target_id
    FROM active_rules ar
    LEFT JOIN fp_customer_unified cu 
      ON UPPER(TRIM(cu.display_name)) = UPPER(TRIM(ar.merged_customer_name))
      OR cu.normalized_name = UPPER(TRIM(ar.merged_customer_name))
  )
  -- Update source customers to point to target
  UPDATE fp_customer_unified cu
  SET 
    is_merged = TRUE,
    merged_into_id = tc.target_id,
    updated_at = NOW()
  FROM target_customers tc
  WHERE cu.normalized_name = ANY(
    SELECT UPPER(TRIM(jsonb_array_elements_text(tc.original_customers)))
  )
  AND cu.customer_id != COALESCE(tc.target_id, -1);
  
  GET DIAGNOSTICS v_customers_marked = ROW_COUNT;
  
  -- Step 3: Update target customers with merged names list
  UPDATE fp_customer_unified cu
  SET 
    original_names = (
      SELECT ARRAY_AGG(DISTINCT cu2.display_name)
      FROM fp_customer_unified cu2
      WHERE cu2.merged_into_id = cu.customer_id
    ),
    updated_at = NOW()
  WHERE cu.customer_id IN (
    SELECT DISTINCT merged_into_id FROM fp_customer_unified WHERE merged_into_id IS NOT NULL
  );
  
  -- Count merges
  SELECT COUNT(DISTINCT merged_into_id) INTO v_merges_applied
  FROM fp_customer_unified WHERE merged_into_id IS NOT NULL;
  
  -- Check for orphan rules (rules where target customer doesn't exist)
  SELECT ARRAY_AGG('Merge rule "' || merged_customer_name || '" has no matching customer in unified table')
  INTO v_warnings
  FROM fp_division_customer_merge_rules mr
  WHERE mr.is_active = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM fp_customer_unified cu 
      WHERE UPPER(TRIM(cu.display_name)) = UPPER(TRIM(mr.merged_customer_name))
    );
  
  v_warnings := COALESCE(v_warnings, ARRAY[]::TEXT[]);
  
  RETURN QUERY SELECT v_merges_applied, v_customers_marked, v_warnings;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 2: Sync Sales Rep Groups → Unified (Re-link all)
-- ============================================================
CREATE OR REPLACE FUNCTION sync_sales_rep_groups_to_unified()
RETURNS TABLE (
  reps_updated INTEGER,
  ungrouped_reps INTEGER,
  warnings TEXT[]
) AS $$
DECLARE
  v_updated INTEGER := 0;
  v_ungrouped INTEGER := 0;
  v_warnings TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Update ALL sales reps with their current group assignment
  -- This handles regrouping, new groups, and removed groups
  UPDATE fp_sales_rep_unified sr
  SET 
    group_id = subq.new_group_id,
    group_name = subq.new_group_name,
    updated_at = NOW()
  FROM (
    SELECT 
      sru.sales_rep_id,
      srg.id AS new_group_id,
      srg.group_name AS new_group_name
    FROM fp_sales_rep_unified sru
    LEFT JOIN sales_rep_group_members srgm 
      ON UPPER(TRIM(srgm.member_name)) = sru.normalized_name
    LEFT JOIN sales_rep_groups srg 
      ON srgm.group_id = srg.id AND srg.is_active = TRUE
  ) subq
  WHERE sr.sales_rep_id = subq.sales_rep_id
    AND (sr.group_id IS DISTINCT FROM subq.new_group_id 
         OR sr.group_name IS DISTINCT FROM subq.new_group_name);
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  -- Count ungrouped sales reps
  SELECT COUNT(*) INTO v_ungrouped
  FROM fp_sales_rep_unified
  WHERE group_id IS NULL;
  
  -- Generate warnings for ungrouped reps with significant sales
  SELECT ARRAY_AGG('Sales rep "' || display_name || '" has no group assigned (Amount: ' || 
                   ROUND(total_amount_all_time::numeric, 2) || ')')
  INTO v_warnings
  FROM fp_sales_rep_unified
  WHERE group_id IS NULL
    AND total_amount_all_time > 10000;  -- Only warn if significant
  
  v_warnings := COALESCE(v_warnings, ARRAY[]::TEXT[]);
  
  RETURN QUERY SELECT v_updated, v_ungrouped, v_warnings;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 3: Sync Product Groups to BOTH unified AND raw tables
-- ============================================================
CREATE OR REPLACE FUNCTION sync_product_groups_complete()
RETURNS TABLE (
  new_in_unified INTEGER,
  new_in_raw INTEGER,
  unmapped_count INTEGER,
  warnings TEXT[]
) AS $$
DECLARE
  v_new_unified INTEGER := 0;
  v_new_raw INTEGER := 0;
  v_unmapped INTEGER := 0;
  v_warnings TEXT[] := ARRAY[]::TEXT[];
  next_code INTEGER;
BEGIN
  -- Get next product group code
  SELECT COALESCE(MAX(CAST(SUBSTRING(pg_code FROM 7) AS INTEGER)), 0) + 1
  INTO next_code
  FROM fp_product_group_unified
  WHERE pg_code LIKE 'FP-PG-%';

  -- Step 1: Add new product groups to fp_product_group_unified
  WITH new_pgs AS (
    SELECT 
      UPPER(TRIM(d.productgroup)) AS norm_name,
      d.productgroup AS display_name,
      SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END) AS total_morm
    FROM fp_data_excel d
    WHERE NOT EXISTS (
      SELECT 1 FROM fp_product_group_unified pg 
      WHERE pg.normalized_name = UPPER(TRIM(d.productgroup))
    )
    GROUP BY UPPER(TRIM(d.productgroup)), d.productgroup
  ),
  numbered AS (
    SELECT 
      ROW_NUMBER() OVER (ORDER BY display_name) AS rn,
      np.*
    FROM new_pgs np
  )
  INSERT INTO fp_product_group_unified (
    pg_code, display_name, normalized_name,
    material, process, pg_combined,
    raw_names,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    division, sort_order
  )
  SELECT 
    'FP-PG-' || LPAD((next_code + rn - 1)::TEXT, 2, '0'),
    n.display_name,
    n.norm_name,
    COALESCE(mp.material, 'Others'),
    COALESCE(mp.process, 'Others'),
    COALESCE(mp.material || ' ' || mp.process, 'Others Others'),
    ARRAY[n.display_name],
    n.total_amount,
    n.total_kgs,
    n.total_morm,
    'FP',
    next_code + rn - 1
  FROM numbered n
  LEFT JOIN fp_material_percentages mp ON UPPER(TRIM(mp.product_group)) = n.norm_name;
  
  GET DIAGNOSTICS v_new_unified = ROW_COUNT;

  -- Step 2: Add new product groups to fp_raw_product_groups (CRITICAL!)
  -- This ensures they appear in dashboard queries
  INSERT INTO fp_raw_product_groups (raw_product_group, pg_combine, division, is_unmapped, created_at)
  SELECT DISTINCT
    d.productgroup,
    COALESCE(
      (SELECT pg_combine FROM fp_raw_product_groups WHERE UPPER(TRIM(raw_product_group)) = UPPER(TRIM(d.productgroup)) LIMIT 1),
      d.productgroup  -- Default: map to itself
    ),
    'FP',
    FALSE,
    NOW()
  FROM fp_data_excel d
  WHERE NOT EXISTS (
    SELECT 1 FROM fp_raw_product_groups rpg
    WHERE UPPER(TRIM(rpg.raw_product_group)) = UPPER(TRIM(d.productgroup))
  )
  ON CONFLICT DO NOTHING;
  
  GET DIAGNOSTICS v_new_raw = ROW_COUNT;
  
  -- Step 3: Add to fp_material_percentages if not exists (with Others/Others default)
  INSERT INTO fp_material_percentages (product_group, material, process, created_at, updated_at)
  SELECT DISTINCT
    COALESCE(rpg.pg_combine, d.productgroup),
    'Others',
    'Others',
    NOW(),
    NOW()
  FROM fp_data_excel d
  LEFT JOIN fp_raw_product_groups rpg ON UPPER(TRIM(rpg.raw_product_group)) = UPPER(TRIM(d.productgroup))
  WHERE NOT EXISTS (
    SELECT 1 FROM fp_material_percentages mp
    WHERE UPPER(TRIM(mp.product_group)) = UPPER(TRIM(COALESCE(rpg.pg_combine, d.productgroup)))
  )
  ON CONFLICT DO NOTHING;
  
  -- Step 4: Update existing product group aggregations
  UPDATE fp_product_group_unified pg
  SET 
    total_amount_all_time = agg.total_amount,
    total_kgs_all_time = agg.total_kgs,
    total_morm_all_time = agg.total_morm,
    updated_at = NOW()
  FROM (
    SELECT 
      UPPER(TRIM(productgroup)) AS norm_name,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm
    FROM fp_data_excel
    GROUP BY UPPER(TRIM(productgroup))
  ) agg
  WHERE pg.normalized_name = agg.norm_name;
  
  -- Count unmapped (material = Others)
  SELECT COUNT(*) INTO v_unmapped
  FROM fp_product_group_unified
  WHERE material = 'Others';
  
  -- Generate warnings for new product groups that need material assignment
  SELECT ARRAY_AGG('New product group "' || display_name || 
                   '" needs material/process classification (Amount: ' || 
                   ROUND(total_amount_all_time::numeric, 2) || ')')
  INTO v_warnings
  FROM fp_product_group_unified
  WHERE material = 'Others'
    AND total_amount_all_time > 10000;
  
  v_warnings := COALESCE(v_warnings, ARRAY[]::TEXT[]);
  
  RETURN QUERY SELECT v_new_unified, v_new_raw, v_unmapped, v_warnings;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 4: Sync ALL new entities from fp_data_excel
-- ============================================================
CREATE OR REPLACE FUNCTION sync_new_data_entities()
RETURNS TABLE (
  new_customers INTEGER,
  new_sales_reps INTEGER,
  new_product_groups INTEGER,
  warnings TEXT[]
) AS $$
DECLARE
  v_new_customers INTEGER := 0;
  v_new_sales_reps INTEGER := 0;
  v_new_pgs INTEGER := 0;
  v_all_warnings TEXT[] := ARRAY[]::TEXT[];
  next_cust_code INTEGER;
  next_sr_code INTEGER;
BEGIN
  -- =======================================
  -- CUSTOMERS
  -- =======================================
  SELECT COALESCE(MAX(CAST(SUBSTRING(customer_code FROM 9) AS INTEGER)), 0) + 1
  INTO next_cust_code
  FROM fp_customer_unified
  WHERE customer_code LIKE 'FP-CUST-%';

  WITH new_customers AS (
    SELECT 
      UPPER(TRIM(d.customername)) AS norm_name,
      MIN(d.customername) AS display_name,
      ARRAY_AGG(DISTINCT d.countryname) AS countries,
      SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END) AS total_morm,
      MIN(MAKE_DATE(d.year, d.month, 1)) AS first_trans,
      MAX(MAKE_DATE(d.year, d.month, 1)) AS last_trans,
      ARRAY_AGG(DISTINCT d.year ORDER BY d.year) AS years
    FROM fp_data_excel d
    WHERE NOT EXISTS (
      SELECT 1 FROM fp_customer_unified cu 
      WHERE cu.normalized_name = UPPER(TRIM(d.customername))
    )
    GROUP BY UPPER(TRIM(d.customername))
  ),
  numbered AS (
    SELECT ROW_NUMBER() OVER (ORDER BY display_name) AS rn, nc.*
    FROM new_customers nc
  )
  INSERT INTO fp_customer_unified (
    customer_code, display_name, normalized_name, 
    primary_sales_rep_name, primary_country, countries,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    first_transaction_date, last_transaction_date, transaction_years,
    division
  )
  SELECT 
    'FP-CUST-' || LPAD((next_cust_code + rn - 1)::TEXT, 5, '0'),
    n.display_name, n.norm_name,
    (SELECT salesrepname FROM fp_data_excel WHERE UPPER(TRIM(customername)) = n.norm_name GROUP BY salesrepname ORDER BY COUNT(*) DESC LIMIT 1),
    (SELECT countryname FROM fp_data_excel WHERE UPPER(TRIM(customername)) = n.norm_name GROUP BY countryname ORDER BY COUNT(*) DESC LIMIT 1),
    n.countries, n.total_amount, n.total_kgs, n.total_morm,
    n.first_trans, n.last_trans, n.years, 'FP'
  FROM numbered n;
  
  GET DIAGNOSTICS v_new_customers = ROW_COUNT;

  -- Update existing customer aggregations
  UPDATE fp_customer_unified cu
  SET 
    total_amount_all_time = agg.total_amount,
    total_kgs_all_time = agg.total_kgs,
    total_morm_all_time = agg.total_morm,
    last_transaction_date = agg.last_trans,
    transaction_years = agg.years,
    countries = agg.countries,
    updated_at = NOW()
  FROM (
    SELECT 
      UPPER(TRIM(customername)) AS norm_name,
      ARRAY_AGG(DISTINCT countryname) AS countries,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
      MAX(MAKE_DATE(year, month, 1)) AS last_trans,
      ARRAY_AGG(DISTINCT year ORDER BY year) AS years
    FROM fp_data_excel GROUP BY UPPER(TRIM(customername))
  ) agg
  WHERE cu.normalized_name = agg.norm_name;

  -- =======================================
  -- SALES REPS
  -- =======================================
  SELECT COALESCE(MAX(CAST(SUBSTRING(sales_rep_code FROM 7) AS INTEGER)), 0) + 1
  INTO next_sr_code
  FROM fp_sales_rep_unified
  WHERE sales_rep_code LIKE 'FP-SR-%';

  WITH new_reps AS (
    SELECT 
      UPPER(TRIM(d.salesrepname)) AS norm_name,
      d.salesrepname AS display_name,
      SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END) AS total_morm,
      COUNT(DISTINCT d.customername) AS customer_count,
      COUNT(DISTINCT d.countryname) AS country_count,
      MIN(MAKE_DATE(d.year, d.month, 1)) AS first_trans,
      MAX(MAKE_DATE(d.year, d.month, 1)) AS last_trans
    FROM fp_data_excel d
    WHERE NOT EXISTS (
      SELECT 1 FROM fp_sales_rep_unified sr 
      WHERE sr.normalized_name = UPPER(TRIM(d.salesrepname))
    )
    GROUP BY UPPER(TRIM(d.salesrepname)), d.salesrepname
  ),
  numbered AS (
    SELECT ROW_NUMBER() OVER (ORDER BY display_name) AS rn, nr.*
    FROM new_reps nr
  )
  INSERT INTO fp_sales_rep_unified (
    sales_rep_code, display_name, normalized_name,
    group_id, group_name,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    customer_count, country_count,
    first_transaction_date, last_transaction_date,
    division
  )
  SELECT 
    'FP-SR-' || LPAD((next_sr_code + rn - 1)::TEXT, 3, '0'),
    n.display_name, n.norm_name,
    srg.id, srg.group_name,
    n.total_amount, n.total_kgs, n.total_morm,
    n.customer_count, n.country_count,
    n.first_trans, n.last_trans, 'FP'
  FROM numbered n
  LEFT JOIN sales_rep_group_members srgm ON UPPER(TRIM(srgm.member_name)) = n.norm_name
  LEFT JOIN sales_rep_groups srg ON srgm.group_id = srg.id;
  
  GET DIAGNOSTICS v_new_sales_reps = ROW_COUNT;

  -- Update existing sales rep aggregations
  UPDATE fp_sales_rep_unified sr
  SET 
    total_amount_all_time = agg.total_amount,
    total_kgs_all_time = agg.total_kgs,
    total_morm_all_time = agg.total_morm,
    customer_count = agg.customer_count,
    country_count = agg.country_count,
    last_transaction_date = agg.last_trans,
    updated_at = NOW()
  FROM (
    SELECT 
      UPPER(TRIM(salesrepname)) AS norm_name,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
      COUNT(DISTINCT customername) AS customer_count,
      COUNT(DISTINCT countryname) AS country_count,
      MAX(MAKE_DATE(year, month, 1)) AS last_trans
    FROM fp_data_excel GROUP BY UPPER(TRIM(salesrepname))
  ) agg
  WHERE sr.normalized_name = agg.norm_name;

  -- =======================================
  -- PRODUCT GROUPS (via complete sync function)
  -- =======================================
  SELECT new_in_unified INTO v_new_pgs FROM sync_product_groups_complete();

  -- Collect warnings for new entities
  SELECT ARRAY_AGG(warning) INTO v_all_warnings FROM (
    SELECT 'New customer: "' || display_name || '"' AS warning
    FROM fp_customer_unified 
    WHERE created_at > NOW() - INTERVAL '1 minute' AND customer_id > next_cust_code - 1
    UNION ALL
    SELECT 'New sales rep (ungrouped): "' || display_name || '"' AS warning
    FROM fp_sales_rep_unified 
    WHERE created_at > NOW() - INTERVAL '1 minute' AND group_id IS NULL AND sales_rep_id > next_sr_code - 1
  ) sub;
  
  v_all_warnings := COALESCE(v_all_warnings, ARRAY[]::TEXT[]);
  
  RETURN QUERY SELECT v_new_customers, v_new_sales_reps, v_new_pgs, v_all_warnings;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 5: MASTER SYNC (Call this after ANY data change)
-- ============================================================
DROP FUNCTION IF EXISTS sync_unified_data();

CREATE OR REPLACE FUNCTION sync_unified_data()
RETURNS TABLE (
  new_customers INTEGER,
  new_sales_reps INTEGER,
  new_product_groups INTEGER,
  merges_applied INTEGER,
  ungrouped_sales_reps INTEGER,
  unmapped_product_groups INTEGER,
  all_warnings TEXT[],
  sync_time TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_new_cust INTEGER;
  v_new_sr INTEGER;
  v_new_pg INTEGER;
  v_merges INTEGER;
  v_ungrouped INTEGER;
  v_unmapped INTEGER;
  v_warnings TEXT[] := ARRAY[]::TEXT[];
  v_temp_warnings TEXT[];
BEGIN
  -- Step 1: Sync new entities from raw data
  SELECT ne.new_customers, ne.new_sales_reps, ne.new_product_groups, ne.warnings
  INTO v_new_cust, v_new_sr, v_new_pg, v_temp_warnings
  FROM sync_new_data_entities() ne;
  v_warnings := v_warnings || COALESCE(v_temp_warnings, ARRAY[]::TEXT[]);
  
  -- Step 2: Sync customer merges
  SELECT cm.merges_applied, cm.warnings
  INTO v_merges, v_temp_warnings
  FROM sync_customer_merges_to_unified() cm;
  v_warnings := v_warnings || COALESCE(v_temp_warnings, ARRAY[]::TEXT[]);
  
  -- Step 3: Sync sales rep groups
  SELECT sg.ungrouped_reps, sg.warnings
  INTO v_ungrouped, v_temp_warnings
  FROM sync_sales_rep_groups_to_unified() sg;
  v_warnings := v_warnings || COALESCE(v_temp_warnings, ARRAY[]::TEXT[]);
  
  -- Step 4: Get unmapped product groups count
  SELECT COUNT(*) INTO v_unmapped
  FROM fp_product_group_unified WHERE material = 'Others';
  
  -- Step 5: Refresh materialized views
  REFRESH MATERIALIZED VIEW mv_customer_period_summary;
  REFRESH MATERIALIZED VIEW mv_sales_rep_period_summary;
  REFRESH MATERIALIZED VIEW mv_product_group_period_summary;
  REFRESH MATERIALIZED VIEW mv_country_period_summary;
  
  RETURN QUERY SELECT 
    v_new_cust, v_new_sr, v_new_pg, v_merges, v_ungrouped, v_unmapped,
    v_warnings, NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 6: Get sync status (check for items needing attention)
-- ============================================================
CREATE OR REPLACE FUNCTION get_unified_sync_status()
RETURNS TABLE (
  total_customers INTEGER,
  total_sales_reps INTEGER,
  total_product_groups INTEGER,
  merged_customers INTEGER,
  ungrouped_sales_reps INTEGER,
  unmapped_product_groups INTEGER,
  data_coverage_pct NUMERIC,
  items_needing_attention JSONB
) AS $$
DECLARE
  v_total_cust INTEGER;
  v_total_sr INTEGER;
  v_total_pg INTEGER;
  v_merged INTEGER;
  v_ungrouped INTEGER;
  v_unmapped INTEGER;
  v_coverage NUMERIC;
  v_attention JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total_cust FROM fp_customer_unified;
  SELECT COUNT(*) INTO v_total_sr FROM fp_sales_rep_unified;
  SELECT COUNT(*) INTO v_total_pg FROM fp_product_group_unified;
  SELECT COUNT(*) INTO v_merged FROM fp_customer_unified WHERE is_merged = TRUE;
  SELECT COUNT(*) INTO v_ungrouped FROM fp_sales_rep_unified WHERE group_id IS NULL;
  SELECT COUNT(*) INTO v_unmapped FROM fp_product_group_unified WHERE material = 'Others';
  
  -- Calculate data coverage (rows in view vs raw)
  SELECT ROUND(
    (SELECT COUNT(*)::NUMERIC FROM vw_unified_sales_data WHERE customer_id IS NOT NULL) /
    NULLIF((SELECT COUNT(*) FROM fp_data_excel), 0) * 100, 2
  ) INTO v_coverage;
  
  -- Build attention items
  SELECT jsonb_build_object(
    'ungrouped_sales_reps', (
      SELECT jsonb_agg(jsonb_build_object('name', display_name, 'amount', total_amount_all_time))
      FROM fp_sales_rep_unified WHERE group_id IS NULL AND total_amount_all_time > 10000
    ),
    'unmapped_product_groups', (
      SELECT jsonb_agg(jsonb_build_object('name', display_name, 'amount', total_amount_all_time))
      FROM fp_product_group_unified WHERE material = 'Others' AND total_amount_all_time > 10000
    ),
    'orphan_merge_rules', (
      SELECT jsonb_agg(jsonb_build_object('rule', merged_customer_name))
      FROM fp_division_customer_merge_rules mr
      WHERE mr.is_active = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM fp_customer_unified cu 
          WHERE UPPER(TRIM(cu.display_name)) = UPPER(TRIM(mr.merged_customer_name))
        )
    )
  ) INTO v_attention;
  
  RETURN QUERY SELECT 
    v_total_cust, v_total_sr, v_total_pg, v_merged, v_ungrouped, v_unmapped, v_coverage, v_attention;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Output success message
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '=== MIGRATION 305 COMPLETE ===';
  RAISE NOTICE '';
  RAISE NOTICE 'DYNAMIC SYNC SYSTEM NOW INCLUDES:';
  RAISE NOTICE '  1. sync_unified_data() - Master sync (call after data upload)';
  RAISE NOTICE '  2. sync_customer_merges_to_unified() - Sync merge rules';
  RAISE NOTICE '  3. sync_sales_rep_groups_to_unified() - Sync group changes';
  RAISE NOTICE '  4. sync_product_groups_complete() - Sync PGs to both tables';
  RAISE NOTICE '  5. get_unified_sync_status() - Check what needs attention';
  RAISE NOTICE '';
  RAISE NOTICE 'ALL GAPS FIXED:';
  RAISE NOTICE '  ✓ Customer merges now propagate from rules to unified';
  RAISE NOTICE '  ✓ Sales rep group changes propagate to unified';
  RAISE NOTICE '  ✓ New product groups added to both unified AND raw tables';
  RAISE NOTICE '  ✓ Warnings returned for items needing admin attention';
END $$;
