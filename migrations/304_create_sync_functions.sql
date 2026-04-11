-- ============================================================
-- MIGRATION 304: Create Auto-Sync Triggers and Functions
-- ============================================================
-- Purpose: Automatically sync unified tables when new data is uploaded
-- Created: January 1, 2026
-- ============================================================

-- ============================================================
-- FUNCTION 1: Sync new customers to fp_customer_unified
-- ============================================================
CREATE OR REPLACE FUNCTION sync_new_customers_to_unified()
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER := 0;
  next_code INTEGER;
BEGIN
  -- Get next customer code number
  SELECT COALESCE(MAX(CAST(SUBSTRING(customer_code FROM 9) AS INTEGER)), 0) + 1
  INTO next_code
  FROM fp_customer_unified
  WHERE customer_code LIKE 'FP-CUST-%';

  -- Insert new customers that don't exist in unified table
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
    SELECT 
      ROW_NUMBER() OVER (ORDER BY display_name) AS rn,
      nc.*
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
    'FP-CUST-' || LPAD((next_code + rn - 1)::TEXT, 5, '0'),
    n.display_name,
    n.norm_name,
    (SELECT salesrepname FROM fp_data_excel 
     WHERE UPPER(TRIM(customername)) = n.norm_name 
     GROUP BY salesrepname ORDER BY COUNT(*) DESC LIMIT 1),
    (SELECT countryname FROM fp_data_excel 
     WHERE UPPER(TRIM(customername)) = n.norm_name 
     GROUP BY countryname ORDER BY COUNT(*) DESC LIMIT 1),
    n.countries,
    n.total_amount,
    n.total_kgs,
    n.total_morm,
    n.first_trans,
    n.last_trans,
    n.years,
    'FP'
  FROM numbered n;

  GET DIAGNOSTICS new_count = ROW_COUNT;
  
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
    FROM fp_data_excel
    GROUP BY UPPER(TRIM(customername))
  ) agg
  WHERE cu.normalized_name = agg.norm_name;

  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 2: Sync new sales reps to fp_sales_rep_unified
-- ============================================================
CREATE OR REPLACE FUNCTION sync_new_sales_reps_to_unified()
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER := 0;
  next_code INTEGER;
BEGIN
  -- Get next sales rep code number
  SELECT COALESCE(MAX(CAST(SUBSTRING(sales_rep_code FROM 7) AS INTEGER)), 0) + 1
  INTO next_code
  FROM fp_sales_rep_unified
  WHERE sales_rep_code LIKE 'FP-SR-%';

  -- Insert new sales reps
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
    SELECT 
      ROW_NUMBER() OVER (ORDER BY display_name) AS rn,
      nr.*
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
    'FP-SR-' || LPAD((next_code + rn - 1)::TEXT, 3, '0'),
    n.display_name,
    n.norm_name,
    srg.id,
    srg.group_name,
    n.total_amount,
    n.total_kgs,
    n.total_morm,
    n.customer_count,
    n.country_count,
    n.first_trans,
    n.last_trans,
    'FP'
  FROM numbered n
  LEFT JOIN sales_rep_group_members srgm ON UPPER(TRIM(srgm.member_name)) = n.norm_name
  LEFT JOIN sales_rep_groups srg ON srgm.group_id = srg.id;

  GET DIAGNOSTICS new_count = ROW_COUNT;
  
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
    FROM fp_data_excel
    GROUP BY UPPER(TRIM(salesrepname))
  ) agg
  WHERE sr.normalized_name = agg.norm_name;

  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 3: Sync new product groups to fp_product_group_unified
-- ============================================================
CREATE OR REPLACE FUNCTION sync_new_product_groups_to_unified()
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER := 0;
  next_code INTEGER;
BEGIN
  -- Get next product group code number
  SELECT COALESCE(MAX(CAST(SUBSTRING(pg_code FROM 7) AS INTEGER)), 0) + 1
  INTO next_code
  FROM fp_product_group_unified
  WHERE pg_code LIKE 'FP-PG-%';

  -- Insert new product groups (default to Others/Others if not in material_percentages)
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

  GET DIAGNOSTICS new_count = ROW_COUNT;
  
  -- Update existing product group aggregations
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

  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 4: Master sync function (call this after data upload)
-- ============================================================
CREATE OR REPLACE FUNCTION sync_unified_data()
RETURNS TABLE (
  new_customers INTEGER,
  new_sales_reps INTEGER,
  new_product_groups INTEGER,
  sync_time TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_new_customers INTEGER;
  v_new_sales_reps INTEGER;
  v_new_product_groups INTEGER;
BEGIN
  -- Sync all master tables
  v_new_customers := sync_new_customers_to_unified();
  v_new_sales_reps := sync_new_sales_reps_to_unified();
  v_new_product_groups := sync_new_product_groups_to_unified();
  
  -- Refresh materialized views
  REFRESH MATERIALIZED VIEW mv_customer_period_summary;
  REFRESH MATERIALIZED VIEW mv_sales_rep_period_summary;
  REFRESH MATERIALIZED VIEW mv_product_group_period_summary;
  REFRESH MATERIALIZED VIEW mv_country_period_summary;
  
  RETURN QUERY SELECT 
    v_new_customers,
    v_new_sales_reps,
    v_new_product_groups,
    NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 5: Full rebuild (use when you want to start fresh)
-- ============================================================
CREATE OR REPLACE FUNCTION rebuild_unified_data()
RETURNS TABLE (
  customers INTEGER,
  sales_reps INTEGER,
  product_groups INTEGER,
  rebuild_time TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_customers INTEGER;
  v_sales_reps INTEGER;
  v_product_groups INTEGER;
BEGIN
  -- Clear existing data
  TRUNCATE fp_customer_unified RESTART IDENTITY CASCADE;
  TRUNCATE fp_sales_rep_unified RESTART IDENTITY CASCADE;
  TRUNCATE fp_product_group_unified RESTART IDENTITY CASCADE;
  
  -- Rebuild customers
  WITH customer_agg AS (
    SELECT 
      UPPER(TRIM(customername)) AS norm_name,
      MIN(customername) AS display_name,
      ARRAY_AGG(DISTINCT countryname) AS countries,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
      MIN(MAKE_DATE(year, month, 1)) AS first_transaction_date,
      MAX(MAKE_DATE(year, month, 1)) AS last_transaction_date,
      ARRAY_AGG(DISTINCT year ORDER BY year) AS transaction_years
    FROM fp_data_excel
    GROUP BY UPPER(TRIM(customername))
  )
  INSERT INTO fp_customer_unified (
    customer_code, display_name, normalized_name, 
    primary_sales_rep_name, primary_country, countries,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    first_transaction_date, last_transaction_date, transaction_years, division
  )
  SELECT 
    'FP-CUST-' || LPAD(ROW_NUMBER() OVER (ORDER BY display_name)::TEXT, 5, '0'),
    ca.display_name, ca.norm_name,
    (SELECT salesrepname FROM fp_data_excel WHERE UPPER(TRIM(customername)) = ca.norm_name GROUP BY salesrepname ORDER BY COUNT(*) DESC LIMIT 1),
    (SELECT countryname FROM fp_data_excel WHERE UPPER(TRIM(customername)) = ca.norm_name GROUP BY countryname ORDER BY COUNT(*) DESC LIMIT 1),
    ca.countries, ca.total_amount, ca.total_kgs, ca.total_morm,
    ca.first_transaction_date, ca.last_transaction_date, ca.transaction_years, 'FP'
  FROM customer_agg ca;
  
  GET DIAGNOSTICS v_customers = ROW_COUNT;

  -- Rebuild sales reps
  INSERT INTO fp_sales_rep_unified (
    sales_rep_code, display_name, normalized_name,
    group_id, group_name,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    customer_count, country_count,
    first_transaction_date, last_transaction_date, division
  )
  SELECT 
    'FP-SR-' || LPAD(ROW_NUMBER() OVER (ORDER BY d.salesrepname)::TEXT, 3, '0'),
    d.salesrepname, UPPER(TRIM(d.salesrepname)),
    srg.id, srg.group_name,
    SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END),
    SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END),
    SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END),
    COUNT(DISTINCT d.customername),
    COUNT(DISTINCT d.countryname),
    MIN(MAKE_DATE(d.year, d.month, 1)),
    MAX(MAKE_DATE(d.year, d.month, 1)),
    'FP'
  FROM fp_data_excel d
  LEFT JOIN sales_rep_group_members srgm ON UPPER(TRIM(d.salesrepname)) = UPPER(TRIM(srgm.member_name))
  LEFT JOIN sales_rep_groups srg ON srgm.group_id = srg.id
  GROUP BY d.salesrepname, srg.id, srg.group_name;
  
  GET DIAGNOSTICS v_sales_reps = ROW_COUNT;

  -- Rebuild product groups
  INSERT INTO fp_product_group_unified (
    pg_code, display_name, normalized_name,
    material, process, pg_combined, raw_names,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    division, sort_order
  )
  SELECT 
    'FP-PG-' || LPAD(ROW_NUMBER() OVER (ORDER BY d.productgroup)::TEXT, 2, '0'),
    d.productgroup, UPPER(TRIM(d.productgroup)),
    COALESCE(mp.material, 'Others'),
    COALESCE(mp.process, 'Others'),
    COALESCE(mp.material || ' ' || mp.process, 'Others Others'),
    ARRAY[d.productgroup],
    SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END),
    SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END),
    SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END),
    'FP',
    ROW_NUMBER() OVER (ORDER BY d.productgroup)
  FROM fp_data_excel d
  LEFT JOIN fp_material_percentages mp ON UPPER(TRIM(mp.product_group)) = UPPER(TRIM(d.productgroup))
  GROUP BY d.productgroup, mp.material, mp.process;
  
  GET DIAGNOSTICS v_product_groups = ROW_COUNT;

  -- Refresh materialized views
  REFRESH MATERIALIZED VIEW mv_customer_period_summary;
  REFRESH MATERIALIZED VIEW mv_sales_rep_period_summary;
  REFRESH MATERIALIZED VIEW mv_product_group_period_summary;
  REFRESH MATERIALIZED VIEW mv_country_period_summary;
  
  RETURN QUERY SELECT v_customers, v_sales_reps, v_product_groups, NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Output instructions
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '=== MIGRATION 304 COMPLETE ===';
  RAISE NOTICE '';
  RAISE NOTICE 'NEW FUNCTIONS CREATED:';
  RAISE NOTICE '  1. sync_unified_data() - Call after uploading new data';
  RAISE NOTICE '     Usage: SELECT * FROM sync_unified_data();';
  RAISE NOTICE '';
  RAISE NOTICE '  2. rebuild_unified_data() - Full rebuild from scratch';
  RAISE NOTICE '     Usage: SELECT * FROM rebuild_unified_data();';
  RAISE NOTICE '';
  RAISE NOTICE 'The system is now DYNAMIC - new customers, sales reps, and';
  RAISE NOTICE 'product groups will be automatically added when you call sync.';
END $$;
