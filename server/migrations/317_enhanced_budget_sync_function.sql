-- Migration 317: Enhanced refresh_budget_unified_stats() function
-- This function syncs fp_budget_customer_unified from fp_sales_rep_budget
-- AND copies CRM fields from fp_customer_unified for existing customers
-- AND sets is_prospect = TRUE for budget-only customers

CREATE OR REPLACE FUNCTION refresh_budget_unified_stats()
RETURNS JSONB AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_updated INTEGER := 0;
  v_prospects INTEGER := 0;
  v_linked INTEGER := 0;
BEGIN
  -- Step 1: Insert/Update budget customers from fp_sales_rep_budget
  WITH 
  -- Aggregate budget data by customer
  budget_agg AS (
    SELECT 
      UPPER(TRIM(customername)) AS normalized_name,
      MAX(customername) AS display_name,
      MAX(salesrepname) AS primary_sales_rep_name,
      MAX(countryname) AS primary_country,
      ARRAY_AGG(DISTINCT countryname) FILTER (WHERE countryname IS NOT NULL) AS countries,
      MAX(productgroup) AS primary_product_group,
      ARRAY_AGG(DISTINCT productgroup) FILTER (WHERE productgroup IS NOT NULL) AS product_groups,
      SUM(CASE WHEN UPPER(values_type) = 'AMOUNT' THEN COALESCE(values, 0) ELSE 0 END) AS total_budget_amount,
      SUM(CASE WHEN UPPER(values_type) = 'KGS' THEN COALESCE(values, 0) ELSE 0 END) AS total_budget_kgs,
      SUM(CASE WHEN UPPER(values_type) = 'MORM' THEN COALESCE(values, 0) ELSE 0 END) AS total_budget_morm,
      ARRAY_AGG(DISTINCT budget_year ORDER BY budget_year) FILTER (WHERE budget_year IS NOT NULL) AS budget_years,
      MIN(MAKE_DATE(year, month, 1)) AS first_budget_date,
      MAX(MAKE_DATE(year, month, 1)) AS last_budget_date,
      MAX(division) AS division
    FROM fp_sales_rep_budget
    WHERE customername IS NOT NULL AND TRIM(customername) != ''
    GROUP BY UPPER(TRIM(customername))
  ),
  -- Get actual customer matches
  actual_matches AS (
    SELECT 
      ba.normalized_name,
      cu.customer_id AS actual_customer_id,
      cu.first_transaction_date AS first_actual_sale_date,
      cu.customer_code,
      cu.customer_type,
      cu.customer_group,
      cu.industry,
      cu.market_segment,
      cu.credit_limit,
      cu.payment_terms,
      cu.default_currency,
      cu.primary_contact,
      cu.email,
      cu.phone,
      cu.mobile,
      cu.website,
      cu.address_line1,
      cu.address_line2,
      cu.city,
      cu.state,
      cu.postal_code,
      cu.latitude,
      cu.longitude,
      cu.pin_confirmed,
      cu.pin_source,
      cu.pin_confirmed_by,
      cu.pin_confirmed_at,
      cu.tax_id,
      cu.trade_license,
      cu.company_currency,
      cu.sales_rep_group_id,
      cu.sales_rep_group_name,
      cu.country_region
    FROM budget_agg ba
    LEFT JOIN fp_customer_unified cu ON UPPER(TRIM(cu.display_name)) = ba.normalized_name
  )
  -- Insert new or update existing
  INSERT INTO fp_budget_customer_unified (
    display_name, normalized_name, 
    primary_sales_rep_name, primary_country, countries,
    primary_product_group, product_groups,
    total_budget_amount, total_budget_kgs, total_budget_morm,
    budget_years, first_budget_date, last_budget_date, division,
    -- Link to actual
    actual_customer_id, first_actual_sale_date, customer_code,
    is_prospect,
    -- CRM fields from actual (if exists)
    customer_type, customer_group, industry, market_segment,
    credit_limit, payment_terms, default_currency,
    primary_contact, email, phone, mobile, website,
    address_line1, address_line2, city, state, postal_code,
    latitude, longitude, pin_confirmed, pin_source, pin_confirmed_by, pin_confirmed_at,
    tax_id, trade_license, company_currency,
    sales_rep_group_id, sales_rep_group_name, country_region,
    updated_at
  )
  SELECT 
    ba.display_name,
    ba.normalized_name,
    ba.primary_sales_rep_name,
    ba.primary_country,
    ba.countries,
    ba.primary_product_group,
    ba.product_groups,
    ba.total_budget_amount,
    ba.total_budget_kgs,
    ba.total_budget_morm,
    ba.budget_years,
    ba.first_budget_date,
    ba.last_budget_date,
    ba.division,
    -- Link to actual
    am.actual_customer_id,
    am.first_actual_sale_date,
    am.customer_code,
    -- is_prospect = TRUE if no actual customer match
    (am.actual_customer_id IS NULL) AS is_prospect,
    -- CRM fields
    am.customer_type, am.customer_group, am.industry, am.market_segment,
    am.credit_limit, am.payment_terms, am.default_currency,
    am.primary_contact, am.email, am.phone, am.mobile, am.website,
    am.address_line1, am.address_line2, am.city, am.state, am.postal_code,
    am.latitude, am.longitude, am.pin_confirmed, am.pin_source, am.pin_confirmed_by, am.pin_confirmed_at,
    am.tax_id, am.trade_license, am.company_currency,
    am.sales_rep_group_id, am.sales_rep_group_name, am.country_region,
    NOW()
  FROM budget_agg ba
  LEFT JOIN actual_matches am ON ba.normalized_name = am.normalized_name
  ON CONFLICT (normalized_name, division) DO UPDATE SET
    display_name = EXCLUDED.display_name,
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
    -- Update links
    actual_customer_id = EXCLUDED.actual_customer_id,
    first_actual_sale_date = EXCLUDED.first_actual_sale_date,
    customer_code = EXCLUDED.customer_code,
    is_prospect = EXCLUDED.is_prospect,
    -- Update CRM fields from actual
    customer_type = COALESCE(fp_budget_customer_unified.customer_type, EXCLUDED.customer_type),
    customer_group = COALESCE(fp_budget_customer_unified.customer_group, EXCLUDED.customer_group),
    industry = COALESCE(fp_budget_customer_unified.industry, EXCLUDED.industry),
    market_segment = COALESCE(fp_budget_customer_unified.market_segment, EXCLUDED.market_segment),
    credit_limit = COALESCE(fp_budget_customer_unified.credit_limit, EXCLUDED.credit_limit),
    payment_terms = COALESCE(fp_budget_customer_unified.payment_terms, EXCLUDED.payment_terms),
    default_currency = COALESCE(fp_budget_customer_unified.default_currency, EXCLUDED.default_currency),
    primary_contact = COALESCE(fp_budget_customer_unified.primary_contact, EXCLUDED.primary_contact),
    email = COALESCE(fp_budget_customer_unified.email, EXCLUDED.email),
    phone = COALESCE(fp_budget_customer_unified.phone, EXCLUDED.phone),
    mobile = COALESCE(fp_budget_customer_unified.mobile, EXCLUDED.mobile),
    website = COALESCE(fp_budget_customer_unified.website, EXCLUDED.website),
    address_line1 = COALESCE(fp_budget_customer_unified.address_line1, EXCLUDED.address_line1),
    address_line2 = COALESCE(fp_budget_customer_unified.address_line2, EXCLUDED.address_line2),
    city = COALESCE(fp_budget_customer_unified.city, EXCLUDED.city),
    state = COALESCE(fp_budget_customer_unified.state, EXCLUDED.state),
    postal_code = COALESCE(fp_budget_customer_unified.postal_code, EXCLUDED.postal_code),
    latitude = COALESCE(fp_budget_customer_unified.latitude, EXCLUDED.latitude),
    longitude = COALESCE(fp_budget_customer_unified.longitude, EXCLUDED.longitude),
    pin_confirmed = COALESCE(fp_budget_customer_unified.pin_confirmed, EXCLUDED.pin_confirmed),
    pin_source = COALESCE(fp_budget_customer_unified.pin_source, EXCLUDED.pin_source),
    pin_confirmed_by = COALESCE(fp_budget_customer_unified.pin_confirmed_by, EXCLUDED.pin_confirmed_by),
    pin_confirmed_at = COALESCE(fp_budget_customer_unified.pin_confirmed_at, EXCLUDED.pin_confirmed_at),
    tax_id = COALESCE(fp_budget_customer_unified.tax_id, EXCLUDED.tax_id),
    trade_license = COALESCE(fp_budget_customer_unified.trade_license, EXCLUDED.trade_license),
    company_currency = COALESCE(fp_budget_customer_unified.company_currency, EXCLUDED.company_currency),
    sales_rep_group_id = COALESCE(EXCLUDED.sales_rep_group_id, fp_budget_customer_unified.sales_rep_group_id),
    sales_rep_group_name = COALESCE(EXCLUDED.sales_rep_group_name, fp_budget_customer_unified.sales_rep_group_name),
    country_region = COALESCE(EXCLUDED.country_region, fp_budget_customer_unified.country_region),
    updated_at = NOW();

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Step 2: Update country_region from master_countries for all rows
  UPDATE fp_budget_customer_unified bu
  SET country_region = mc.region
  FROM master_countries mc
  WHERE UPPER(TRIM(bu.primary_country)) = UPPER(TRIM(mc.country_name))
    AND bu.country_region IS DISTINCT FROM mc.region;

  -- Step 3: Count prospects and linked customers
  SELECT COUNT(*) INTO v_prospects FROM fp_budget_customer_unified WHERE is_prospect = TRUE;
  SELECT COUNT(*) INTO v_linked FROM fp_budget_customer_unified WHERE actual_customer_id IS NOT NULL;

  RETURN jsonb_build_object(
    'success', true,
    'total_customers', v_inserted,
    'prospects', v_prospects,
    'linked_to_actual', v_linked,
    'synced_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION refresh_budget_unified_stats() TO PUBLIC;

-- Add comment
COMMENT ON FUNCTION refresh_budget_unified_stats() IS 'Syncs fp_budget_customer_unified from fp_sales_rep_budget, links to fp_customer_unified, and copies CRM fields';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 317 complete: refresh_budget_unified_stats() updated with CRM field sync';
END $$;
