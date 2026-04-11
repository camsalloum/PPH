-- ============================================================
-- Migration 324: Sync Missing Customers from fp_actualcommon
-- ============================================================
-- Date: January 16, 2026
-- Purpose: Fix data gap - add 348 missing customers to fp_customer_unified
-- Root Cause: Migration 300 populated from fp_data_excel, but system now uses fp_actualcommon
-- ============================================================

DO $$
DECLARE
  v_inserted INTEGER;
BEGIN
  RAISE NOTICE '=== Migration 324: Syncing customers from fp_actualcommon ===';
  
  -- Insert missing customers from fp_actualcommon into fp_customer_unified
  WITH customer_agg AS (
    SELECT 
      UPPER(TRIM(customer_name)) AS norm_name,
      MIN(customer_name) AS display_name,
      ARRAY_AGG(DISTINCT country) FILTER (WHERE country IS NOT NULL) AS countries,
      ARRAY_AGG(DISTINCT sales_rep_name) FILTER (WHERE sales_rep_name IS NOT NULL) AS sales_reps,
      SUM(amount) AS total_amount,
      SUM(qty_kgs) AS total_kgs,
      SUM(morm) AS total_morm,
      MIN(MAKE_DATE(year, month_no, 1)) AS first_transaction_date,
      MAX(MAKE_DATE(year, month_no, 1)) AS last_transaction_date,
      ARRAY_AGG(DISTINCT year ORDER BY year) AS transaction_years
    FROM fp_actualcommon
    WHERE customer_name IS NOT NULL 
      AND TRIM(customer_name) != ''
    GROUP BY UPPER(TRIM(customer_name))
  ),
  customer_primary_country AS (
    SELECT DISTINCT ON (UPPER(TRIM(customer_name)))
      UPPER(TRIM(customer_name)) AS norm_name,
      country
    FROM fp_actualcommon
    WHERE country IS NOT NULL
    GROUP BY UPPER(TRIM(customer_name)), country
    ORDER BY UPPER(TRIM(customer_name)), COUNT(*) DESC
  ),
  customer_primary_sales_rep AS (
    SELECT DISTINCT ON (UPPER(TRIM(customer_name)))
      UPPER(TRIM(customer_name)) AS norm_name,
      sales_rep_name
    FROM fp_actualcommon
    WHERE sales_rep_name IS NOT NULL
    GROUP BY UPPER(TRIM(customer_name)), sales_rep_name
    ORDER BY UPPER(TRIM(customer_name)), COUNT(*) DESC
  )
  INSERT INTO fp_customer_unified (
    customer_code,
    display_name,
    normalized_name,
    primary_sales_rep_name,
    primary_country,
    countries,
    total_amount_all_time,
    total_kgs_all_time,
    total_morm_all_time,
    first_transaction_date,
    last_transaction_date,
    transaction_years,
    division,
    is_active,
    is_merged,
    created_by,
    updated_by
  )
  SELECT 
    'CUST-' || LPAD(NEXTVAL('fp_customer_unified_customer_id_seq')::TEXT, 6, '0'),
    ca.display_name,
    ca.norm_name,
    csr.sales_rep_name,
    cc.country,
    ca.countries,
    COALESCE(ca.total_amount, 0),
    COALESCE(ca.total_kgs, 0),
    COALESCE(ca.total_morm, 0),
    ca.first_transaction_date,
    ca.last_transaction_date,
    ca.transaction_years,
    'FP',
    TRUE,
    FALSE,
    'migration_324',
    'migration_324'
  FROM customer_agg ca
  LEFT JOIN customer_primary_country cc ON ca.norm_name = cc.norm_name
  LEFT JOIN customer_primary_sales_rep csr ON ca.norm_name = csr.norm_name
  WHERE ca.norm_name NOT IN (
    -- Exclude customers already in unified table
    SELECT normalized_name FROM fp_customer_unified
    UNION
    -- Also check original_names array (in case they're part of a merge)
    SELECT UPPER(TRIM(unnest(original_names))) 
    FROM fp_customer_unified 
    WHERE original_names IS NOT NULL
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  
  RAISE NOTICE '✅ Inserted % missing customers into fp_customer_unified', v_inserted;
END $$;

-- ============================================================
-- Verify the sync
-- ============================================================
DO $$
DECLARE
  v_total_unified INTEGER;
  v_total_actual INTEGER;
  v_missing INTEGER;
BEGIN
  SELECT COUNT(DISTINCT normalized_name) INTO v_total_unified FROM fp_customer_unified;
  SELECT COUNT(DISTINCT UPPER(TRIM(customer_name))) INTO v_total_actual 
    FROM fp_actualcommon WHERE customer_name IS NOT NULL;
  
  SELECT COUNT(DISTINCT UPPER(TRIM(customer_name))) INTO v_missing
    FROM fp_actualcommon 
    WHERE customer_name IS NOT NULL
    AND UPPER(TRIM(customer_name)) NOT IN (
      SELECT normalized_name FROM fp_customer_unified
      UNION
      SELECT UPPER(TRIM(unnest(original_names))) 
      FROM fp_customer_unified 
      WHERE original_names IS NOT NULL
    );
  
  RAISE NOTICE '=== VERIFICATION ===';
  RAISE NOTICE 'Customers in fp_customer_unified: %', v_total_unified;
  RAISE NOTICE 'Customers in fp_actualcommon: %', v_total_actual;
  RAISE NOTICE 'Still missing: %', v_missing;
  
  IF v_missing = 0 THEN
    RAISE NOTICE '✅ ALL customers synced successfully!';
  ELSE
    RAISE WARNING '⚠️  Still % customers missing - may need manual review', v_missing;
  END IF;
END $$;
