-- Migration 314c: EFFICIENT Budget Unified Sync Function
-- Fixed: Uses CTEs instead of correlated subqueries for O(n) performance

CREATE OR REPLACE FUNCTION refresh_budget_unified_stats()
RETURNS JSONB AS $$
DECLARE
  v_customers_inserted INTEGER := 0;
  v_customers_updated INTEGER := 0;
BEGIN
  -- Step 1: Pre-aggregate ALL data in one pass using CTEs
  WITH 
  -- Aggregate by customer first
  customer_agg AS (
    SELECT 
      UPPER(TRIM(customername)) AS normalized_name,
      MAX(customername) AS display_name,
      SUM(CASE WHEN UPPER(values_type) = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
      SUM(CASE WHEN UPPER(values_type) = 'KGS' THEN values ELSE 0 END) AS total_kgs,
      SUM(CASE WHEN UPPER(values_type) = 'MORM' THEN values ELSE 0 END) AS total_morm,
      MIN(CASE WHEN year IS NOT NULL AND month IS NOT NULL THEN MAKE_DATE(year, month, 1) END) AS first_date,
      MAX(CASE WHEN year IS NOT NULL AND month IS NOT NULL THEN MAKE_DATE(year, month, 1) END) AS last_date,
      ARRAY_AGG(DISTINCT year ORDER BY year) FILTER (WHERE year IS NOT NULL) AS budget_years,
      ARRAY_AGG(DISTINCT countryname) FILTER (WHERE countryname IS NOT NULL) AS countries,
      ARRAY_AGG(DISTINCT productgroup) FILTER (WHERE productgroup IS NOT NULL) AS product_groups
    FROM fp_sales_rep_budget
    WHERE customername IS NOT NULL AND TRIM(customername) != ''
    GROUP BY UPPER(TRIM(customername))
  ),
  -- Get primary sales rep (highest amount per customer)
  primary_rep AS (
    SELECT DISTINCT ON (UPPER(TRIM(customername)))
      UPPER(TRIM(customername)) AS normalized_name,
      salesrepname
    FROM fp_sales_rep_budget
    WHERE UPPER(values_type) = 'AMOUNT' AND customername IS NOT NULL
    GROUP BY UPPER(TRIM(customername)), salesrepname
    ORDER BY UPPER(TRIM(customername)), SUM(values) DESC
  ),
  -- Get primary country (highest amount per customer)  
  primary_country AS (
    SELECT DISTINCT ON (UPPER(TRIM(customername)))
      UPPER(TRIM(customername)) AS normalized_name,
      countryname
    FROM fp_sales_rep_budget
    WHERE UPPER(values_type) = 'AMOUNT' AND customername IS NOT NULL AND countryname IS NOT NULL
    GROUP BY UPPER(TRIM(customername)), countryname
    ORDER BY UPPER(TRIM(customername)), SUM(values) DESC
  ),
  -- Get primary product group
  primary_pg AS (
    SELECT DISTINCT ON (UPPER(TRIM(customername)))
      UPPER(TRIM(customername)) AS normalized_name,
      productgroup
    FROM fp_sales_rep_budget
    WHERE UPPER(values_type) = 'AMOUNT' AND customername IS NOT NULL AND productgroup IS NOT NULL
    GROUP BY UPPER(TRIM(customername)), productgroup
    ORDER BY UPPER(TRIM(customername)), SUM(values) DESC
  )
  -- Insert new customers
  INSERT INTO fp_budget_customer_unified (
    display_name, normalized_name, primary_sales_rep_name, primary_country,
    countries, primary_product_group, product_groups,
    total_budget_amount, total_budget_kgs, total_budget_morm,
    budget_years, first_budget_date, last_budget_date, division
  )
  SELECT 
    ca.display_name,
    ca.normalized_name,
    pr.salesrepname,
    pc.countryname,
    ca.countries,
    pp.productgroup,
    ca.product_groups,
    COALESCE(ca.total_amount, 0),
    COALESCE(ca.total_kgs, 0),
    COALESCE(ca.total_morm, 0),
    ca.budget_years,
    ca.first_date,
    ca.last_date,
    'FP'
  FROM customer_agg ca
  LEFT JOIN primary_rep pr ON ca.normalized_name = pr.normalized_name
  LEFT JOIN primary_country pc ON ca.normalized_name = pc.normalized_name
  LEFT JOIN primary_pg pp ON ca.normalized_name = pp.normalized_name
  ON CONFLICT (normalized_name, division) DO UPDATE SET
    primary_sales_rep_name = EXCLUDED.primary_sales_rep_name,
    primary_country = EXCLUDED.primary_country,
    countries = EXCLUDED.countries,
    primary_product_group = EXCLUDED.primary_product_group,
    product_groups = EXCLUDED.product_groups,
    total_budget_amount = EXCLUDED.total_budget_amount,
    total_budget_kgs = EXCLUDED.total_budget_kgs,
    total_budget_morm = EXCLUDED.total_budget_morm,
    budget_years = EXCLUDED.budget_years,
    first_budget_date = EXCLUDED.first_budget_date,
    last_budget_date = EXCLUDED.last_budget_date,
    updated_at = NOW();

  GET DIAGNOSTICS v_customers_inserted = ROW_COUNT;

  -- Step 2: Update country regions
  UPDATE fp_budget_customer_unified u
  SET country_region = mc.region
  FROM master_countries mc
  WHERE u.primary_country IS NOT NULL
    AND UPPER(TRIM(u.primary_country)) = UPPER(TRIM(mc.country));

  -- Step 3: Link to actual customers
  UPDATE fp_budget_customer_unified bu
  SET
    actual_customer_id = cu.customer_id,
    global_status = 'customer'
  FROM fp_customer_unified cu
  WHERE bu.normalized_name = cu.normalized_name
    AND bu.actual_customer_id IS NULL;

  -- Step 4: Generate customer codes
  UPDATE fp_budget_customer_unified
  SET customer_code = 'FP-BCUST-' || LPAD(budget_customer_id::TEXT, 5, '0')
  WHERE customer_code IS NULL;

  RETURN jsonb_build_object(
    'customers_synced', v_customers_inserted,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;
