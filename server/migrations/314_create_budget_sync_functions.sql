-- Migration 314: Create Budget Unified Sync Functions
-- Functions to sync budget data, apply merges, detect unknown countries
-- Date: 2026-01-04

-- ============================================================
-- FUNCTION 1: refresh_budget_unified_stats()
-- Syncs fp_budget_customer_unified from fp_sales_rep_budget
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_budget_unified_stats()
RETURNS JSONB AS $$
DECLARE
  v_customers_inserted INTEGER := 0;
  v_customers_updated INTEGER := 0;
  v_unknown_countries INTEGER := 0;
BEGIN
  -- Step 1: Insert new customers from budget data
  INSERT INTO fp_budget_customer_unified (
    display_name,
    normalized_name,
    primary_sales_rep_name,
    primary_country,
    countries,
    primary_product_group,
    product_groups,
    total_budget_amount,
    total_budget_kgs,
    total_budget_morm,
    budget_years,
    first_budget_date,
    last_budget_date,
    division
  )
  SELECT 
    customer_name AS display_name,
    UPPER(TRIM(customer_name)) AS normalized_name,
    -- Primary sales rep (by highest amount)
    (SELECT salesrep FROM fp_sales_rep_budget b2 
     WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
     GROUP BY salesrep 
     ORDER BY SUM(COALESCE(amount, 0)) DESC 
     LIMIT 1) AS primary_sales_rep_name,
    -- Primary country (by highest amount)
    (SELECT country FROM fp_sales_rep_budget b2 
     WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
     AND country IS NOT NULL
     GROUP BY country 
     ORDER BY SUM(COALESCE(amount, 0)) DESC 
     LIMIT 1) AS primary_country,
    -- All countries
    ARRAY(SELECT DISTINCT country FROM fp_sales_rep_budget b2 
          WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
          AND country IS NOT NULL) AS countries,
    -- Primary product group (by highest amount)
    (SELECT product_group FROM fp_sales_rep_budget b2 
     WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
     AND product_group IS NOT NULL
     GROUP BY product_group 
     ORDER BY SUM(COALESCE(amount, 0)) DESC 
     LIMIT 1) AS primary_product_group,
    -- All product groups
    ARRAY(SELECT DISTINCT product_group FROM fp_sales_rep_budget b2 
          WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
          AND product_group IS NOT NULL) AS product_groups,
    -- Aggregates
    SUM(COALESCE(amount, 0)) AS total_budget_amount,
    SUM(COALESCE(kgs, 0)) AS total_budget_kgs,
    SUM(COALESCE(morm, 0)) AS total_budget_morm,
    -- Budget years
    ARRAY(SELECT DISTINCT year FROM fp_sales_rep_budget b2 
          WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
          ORDER BY year) AS budget_years,
    -- Dates
    MIN(CASE WHEN year IS NOT NULL AND month IS NOT NULL 
             THEN MAKE_DATE(year, month, 1) END) AS first_budget_date,
    MAX(CASE WHEN year IS NOT NULL AND month IS NOT NULL 
             THEN MAKE_DATE(year, month, 1) END) AS last_budget_date,
    'FP' AS division
  FROM fp_sales_rep_budget b
  WHERE customer_name IS NOT NULL
    AND TRIM(customer_name) != ''
  GROUP BY UPPER(TRIM(customer_name)), customer_name
  ON CONFLICT (normalized_name, division) DO NOTHING;
  
  GET DIAGNOSTICS v_customers_inserted = ROW_COUNT;
  
  -- Step 2: Update existing customers with latest stats
  WITH budget_stats AS (
    SELECT 
      UPPER(TRIM(customer_name)) AS normalized_name,
      -- Primary sales rep
      (SELECT salesrep FROM fp_sales_rep_budget b2 
       WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
       GROUP BY salesrep 
       ORDER BY SUM(COALESCE(amount, 0)) DESC 
       LIMIT 1) AS primary_sales_rep_name,
      -- Primary country
      (SELECT country FROM fp_sales_rep_budget b2 
       WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
       AND country IS NOT NULL
       GROUP BY country 
       ORDER BY SUM(COALESCE(amount, 0)) DESC 
       LIMIT 1) AS primary_country,
      -- All countries
      ARRAY(SELECT DISTINCT country FROM fp_sales_rep_budget b2 
            WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
            AND country IS NOT NULL) AS countries,
      -- Primary product group
      (SELECT product_group FROM fp_sales_rep_budget b2 
       WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
       AND product_group IS NOT NULL
       GROUP BY product_group 
       ORDER BY SUM(COALESCE(amount, 0)) DESC 
       LIMIT 1) AS primary_product_group,
      -- All product groups
      ARRAY(SELECT DISTINCT product_group FROM fp_sales_rep_budget b2 
            WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
            AND product_group IS NOT NULL) AS product_groups,
      -- Aggregates
      SUM(COALESCE(amount, 0)) AS total_budget_amount,
      SUM(COALESCE(kgs, 0)) AS total_budget_kgs,
      SUM(COALESCE(morm, 0)) AS total_budget_morm,
      -- Budget years
      ARRAY(SELECT DISTINCT year FROM fp_sales_rep_budget b2 
            WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
            ORDER BY year) AS budget_years,
      -- Year data JSONB - use subquery with proper aggregation
      (SELECT jsonb_object_agg(yr, data)
       FROM (
         SELECT 
           year::TEXT AS yr,
           jsonb_build_object(
             'budget_amount', SUM(COALESCE(amount, 0)),
             'budget_kgs', SUM(COALESCE(kgs, 0)),
             'budget_morm', SUM(COALESCE(morm, 0))
           ) AS data
         FROM fp_sales_rep_budget b2 
         WHERE UPPER(TRIM(b2.customer_name)) = UPPER(TRIM(b.customer_name))
           AND year IS NOT NULL
         GROUP BY year
       ) AS yearly_data
      ) AS year_data,
      -- Dates
      MIN(CASE WHEN year IS NOT NULL AND month IS NOT NULL 
               THEN MAKE_DATE(year, month, 1) END) AS first_budget_date,
      MAX(CASE WHEN year IS NOT NULL AND month IS NOT NULL 
               THEN MAKE_DATE(year, month, 1) END) AS last_budget_date
    FROM fp_sales_rep_budget b
    WHERE customer_name IS NOT NULL
      AND TRIM(customer_name) != ''
    GROUP BY UPPER(TRIM(customer_name)), customer_name
  )
  UPDATE fp_budget_customer_unified u
  SET
    primary_sales_rep_name = s.primary_sales_rep_name,
    primary_country = s.primary_country,
    countries = s.countries,
    primary_product_group = s.primary_product_group,
    product_groups = s.product_groups,
    total_budget_amount = s.total_budget_amount,
    total_budget_kgs = s.total_budget_kgs,
    total_budget_morm = s.total_budget_morm,
    budget_years = s.budget_years,
    year_data = COALESCE(s.year_data, '{}'::jsonb),
    first_budget_date = s.first_budget_date,
    last_budget_date = s.last_budget_date,
    updated_at = NOW()
  FROM budget_stats s
  WHERE u.normalized_name = s.normalized_name
    AND u.division = 'FP';
  
  GET DIAGNOSTICS v_customers_updated = ROW_COUNT;
  
  -- Step 3: Update sales rep IDs and groups
  UPDATE fp_budget_customer_unified u
  SET
    primary_sales_rep_id = sr.sales_rep_id,
    sales_rep_group_id = sr.group_id,
    sales_rep_group_name = sr.group_name
  FROM fp_sales_rep_unified sr
  WHERE u.primary_sales_rep_name IS NOT NULL
    AND UPPER(TRIM(u.primary_sales_rep_name)) = sr.normalized_name;
  
  -- Step 4: Update country regions
  UPDATE fp_budget_customer_unified u
  SET country_region = mc.region
  FROM master_countries mc
  WHERE u.primary_country IS NOT NULL
    AND (UPPER(TRIM(u.primary_country)) = UPPER(TRIM(mc.country)));
  
  -- Also check country aliases
  UPDATE fp_budget_customer_unified u
  SET country_region = mc.region
  FROM country_aliases ca
  JOIN master_countries mc ON ca.master_country = mc.country
  WHERE u.primary_country IS NOT NULL
    AND u.country_region IS NULL
    AND UPPER(TRIM(u.primary_country)) = UPPER(TRIM(ca.alias));
  
  -- Step 5: Link to actual customers and update status
  UPDATE fp_budget_customer_unified bu
  SET
    actual_customer_id = cu.customer_id,
    global_status = 'customer',
    first_actual_sale_date = cu.first_transaction_date
  FROM fp_customer_unified cu
  WHERE bu.normalized_name = cu.normalized_name
    AND bu.actual_customer_id IS NULL;
  
  -- Step 6: Detect unknown countries (returns count, actual detection in separate function)
  SELECT COUNT(*) INTO v_unknown_countries
  FROM fp_budget_customer_unified
  WHERE primary_country IS NOT NULL
    AND country_region IS NULL;
  
  -- Generate customer codes for new entries
  UPDATE fp_budget_customer_unified
  SET customer_code = 'FP-BCUST-' || LPAD(budget_customer_id::TEXT, 5, '0')
  WHERE customer_code IS NULL;
  
  RETURN jsonb_build_object(
    'customers_inserted', v_customers_inserted,
    'customers_updated', v_customers_updated,
    'unknown_countries', v_unknown_countries,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 2: sync_budget_merges_to_unified()
-- Applies merge rules to fp_budget_customer_unified
-- ============================================================
CREATE OR REPLACE FUNCTION sync_budget_merges_to_unified()
RETURNS JSONB AS $$
DECLARE
  v_merged_count INTEGER := 0;
  v_parent_count INTEGER := 0;
BEGIN
  -- Step 1: Reset all merge flags
  UPDATE fp_budget_customer_unified
  SET 
    is_merged = false,
    merged_into_id = NULL,
    original_names = NULL
  WHERE is_merged = true OR merged_into_id IS NOT NULL;
  
  -- Step 2: Apply active merge rules
  -- Mark source customers as merged
  WITH merge_sources AS (
    SELECT 
      bu.budget_customer_id,
      target.budget_customer_id AS target_id,
      mr.merged_customer_name
    FROM fp_division_customer_merge_rules mr
    JOIN fp_budget_customer_unified bu 
      ON UPPER(TRIM(bu.display_name)) = UPPER(TRIM(mr.source_customer_name))
    JOIN fp_budget_customer_unified target 
      ON UPPER(TRIM(target.display_name)) = UPPER(TRIM(mr.merged_customer_name))
    WHERE mr.is_active = true
      AND bu.budget_customer_id != target.budget_customer_id
  )
  UPDATE fp_budget_customer_unified u
  SET
    is_merged = true,
    merged_into_id = ms.target_id,
    updated_at = NOW()
  FROM merge_sources ms
  WHERE u.budget_customer_id = ms.budget_customer_id;
  
  GET DIAGNOSTICS v_merged_count = ROW_COUNT;
  
  -- Step 3: Update parent customers with original_names array
  WITH merged_children AS (
    SELECT 
      merged_into_id,
      ARRAY_AGG(display_name ORDER BY display_name) AS original_names
    FROM fp_budget_customer_unified
    WHERE is_merged = true
      AND merged_into_id IS NOT NULL
    GROUP BY merged_into_id
  )
  UPDATE fp_budget_customer_unified u
  SET
    original_names = mc.original_names,
    updated_at = NOW()
  FROM merged_children mc
  WHERE u.budget_customer_id = mc.merged_into_id;
  
  GET DIAGNOSTICS v_parent_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'merged_count', v_merged_count,
    'parent_count', v_parent_count,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 3: check_prospect_conversions()
-- Called after actual data upload to update budget prospect status
-- ============================================================
CREATE OR REPLACE FUNCTION check_prospect_conversions()
RETURNS JSONB AS $$
DECLARE
  v_conversions INTEGER := 0;
  v_rec RECORD;
BEGIN
  -- Find budget customers that now have actual sales
  FOR v_rec IN
    SELECT 
      bu.budget_customer_id,
      bu.display_name,
      bu.primary_sales_rep_name,
      bu.primary_country,
      bu.primary_product_group,
      cu.customer_id AS actual_customer_id,
      cu.first_transaction_date,
      cu.total_amount_all_time AS first_amount,
      cu.total_kgs_all_time AS first_kgs,
      EXTRACT(YEAR FROM cu.first_transaction_date)::INTEGER AS conversion_year
    FROM fp_budget_customer_unified bu
    JOIN fp_customer_unified cu 
      ON bu.normalized_name = cu.normalized_name
    WHERE bu.global_status = 'prospect'
      AND bu.actual_customer_id IS NULL
  LOOP
    -- Log the conversion
    INSERT INTO fp_prospect_conversion_log (
      budget_customer_id,
      actual_customer_id,
      customer_name,
      converted_from_status,
      converted_to_status,
      first_actual_sale_date,
      first_actual_sale_amount,
      first_actual_sale_kgs,
      conversion_year,
      sales_rep_name,
      country,
      product_group
    ) VALUES (
      v_rec.budget_customer_id,
      v_rec.actual_customer_id,
      v_rec.display_name,
      'prospect',
      'customer',
      v_rec.first_transaction_date,
      v_rec.first_amount,
      v_rec.first_kgs,
      v_rec.conversion_year,
      v_rec.primary_sales_rep_name,
      v_rec.primary_country,
      v_rec.primary_product_group
    );
    
    -- Update the budget customer
    UPDATE fp_budget_customer_unified
    SET
      global_status = 'customer',
      actual_customer_id = v_rec.actual_customer_id,
      first_actual_sale_date = v_rec.first_transaction_date,
      updated_at = NOW()
    WHERE budget_customer_id = v_rec.budget_customer_id;
    
    v_conversions := v_conversions + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'conversions', v_conversions,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 4: detect_unknown_countries()
-- Finds countries not in master_countries and logs them
-- ============================================================
CREATE OR REPLACE FUNCTION detect_unknown_countries(p_source_table VARCHAR DEFAULT 'all')
RETURNS JSONB AS $$
DECLARE
  v_new_count INTEGER := 0;
  v_updated_count INTEGER := 0;
  v_rec RECORD;
  v_suggested_country VARCHAR(100);
  v_suggested_confidence DECIMAL(5,4);
BEGIN
  -- Get all unknown countries from the specified source(s)
  FOR v_rec IN
    -- From fp_data_excel
    SELECT 
      d.country AS country_name,
      UPPER(TRIM(d.country)) AS normalized_name,
      'fp_data_excel' AS source_table,
      COUNT(*) AS occurrence_count,
      (SELECT ARRAY_AGG(DISTINCT cust) FROM (
        SELECT d2.customer AS cust 
        FROM fp_data_excel d2 
        WHERE UPPER(TRIM(d2.country)) = UPPER(TRIM(d.country))
        LIMIT 5
      ) AS subq) AS sample_customers
    FROM fp_data_excel d
    LEFT JOIN master_countries mc ON UPPER(TRIM(d.country)) = UPPER(TRIM(mc.country))
    LEFT JOIN country_aliases ca ON UPPER(TRIM(d.country)) = UPPER(TRIM(ca.alias))
    WHERE d.country IS NOT NULL
      AND TRIM(d.country) != ''
      AND mc.country IS NULL
      AND ca.alias IS NULL
      AND (p_source_table = 'all' OR p_source_table = 'fp_data_excel')
    GROUP BY d.country, UPPER(TRIM(d.country))
    
    UNION ALL
    
    -- From fp_sales_rep_budget
    SELECT 
      b.country AS country_name,
      UPPER(TRIM(b.country)) AS normalized_name,
      'fp_sales_rep_budget' AS source_table,
      COUNT(*) AS occurrence_count,
      (SELECT ARRAY_AGG(DISTINCT cust) FROM (
        SELECT b2.customer_name AS cust 
        FROM fp_sales_rep_budget b2 
        WHERE UPPER(TRIM(b2.country)) = UPPER(TRIM(b.country))
        LIMIT 5
      ) AS subq) AS sample_customers
    FROM fp_sales_rep_budget b
    LEFT JOIN master_countries mc ON UPPER(TRIM(b.country)) = UPPER(TRIM(mc.country))
    LEFT JOIN country_aliases ca ON UPPER(TRIM(b.country)) = UPPER(TRIM(ca.alias))
    WHERE b.country IS NOT NULL
      AND TRIM(b.country) != ''
      AND mc.country IS NULL
      AND ca.alias IS NULL
      AND (p_source_table = 'all' OR p_source_table = 'fp_sales_rep_budget')
    GROUP BY b.country, UPPER(TRIM(b.country))
  LOOP
    -- Try to find best match from master_countries using similarity
    SELECT 
      mc.country,
      similarity(v_rec.normalized_name, UPPER(TRIM(mc.country))) AS sim
    INTO v_suggested_country, v_suggested_confidence
    FROM master_countries mc
    ORDER BY similarity(v_rec.normalized_name, UPPER(TRIM(mc.country))) DESC
    LIMIT 1;
    
    -- Insert or update pending_country_assignments
    INSERT INTO pending_country_assignments (
      country_name,
      normalized_name,
      source_table,
      occurrence_count,
      sample_customers,
      suggested_master_country,
      suggested_confidence,
      first_seen_at,
      last_seen_at
    ) VALUES (
      v_rec.country_name,
      v_rec.normalized_name,
      v_rec.source_table,
      v_rec.occurrence_count,
      v_rec.sample_customers,
      CASE WHEN v_suggested_confidence > 0.3 THEN v_suggested_country ELSE NULL END,
      v_suggested_confidence,
      NOW(),
      NOW()
    )
    ON CONFLICT (normalized_name, division) DO UPDATE SET
      occurrence_count = pending_country_assignments.occurrence_count + EXCLUDED.occurrence_count,
      sample_customers = EXCLUDED.sample_customers,
      suggested_master_country = CASE 
        WHEN EXCLUDED.suggested_confidence > pending_country_assignments.suggested_confidence 
        THEN EXCLUDED.suggested_master_country 
        ELSE pending_country_assignments.suggested_master_country 
      END,
      suggested_confidence = GREATEST(EXCLUDED.suggested_confidence, pending_country_assignments.suggested_confidence),
      last_seen_at = NOW()
    WHERE pending_country_assignments.status = 'PENDING';
    
    IF FOUND THEN
      v_new_count := v_new_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'new_pending', v_new_count,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION 5: resolve_pending_country()
-- Called when admin resolves a pending country
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_pending_country(
  p_pending_id INTEGER,
  p_action VARCHAR(20),  -- 'ALIAS', 'NEW_COUNTRY', 'IGNORED'
  p_master_country VARCHAR(100) DEFAULT NULL,
  p_region VARCHAR(50) DEFAULT NULL,
  p_resolved_by VARCHAR(100) DEFAULT 'system'
)
RETURNS JSONB AS $$
DECLARE
  v_pending RECORD;
  v_result JSONB;
BEGIN
  -- Get the pending record
  SELECT * INTO v_pending
  FROM pending_country_assignments
  WHERE id = p_pending_id AND status = 'PENDING';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending country not found or already resolved');
  END IF;
  
  -- Handle based on action
  IF p_action = 'ALIAS' THEN
    -- Add as alias to existing country
    INSERT INTO country_aliases (alias, master_country, division)
    VALUES (v_pending.country_name, p_master_country, 'FP')
    ON CONFLICT DO NOTHING;
    
  ELSIF p_action = 'NEW_COUNTRY' THEN
    -- Add as new country with region
    INSERT INTO master_countries (country, region, division)
    VALUES (v_pending.country_name, p_region, 'FP')
    ON CONFLICT DO NOTHING;
    
  END IF;
  
  -- Update pending record
  UPDATE pending_country_assignments
  SET
    status = CASE WHEN p_action = 'IGNORED' THEN 'IGNORED' ELSE 'RESOLVED' END,
    resolved_action = p_action,
    resolved_master_country = p_master_country,
    resolved_region = p_region,
    resolved_by = p_resolved_by,
    resolved_at = NOW()
  WHERE id = p_pending_id;
  
  -- Note: Triggers on master_countries/country_aliases will auto-sync unified tables
  
  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'country', v_pending.country_name
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Enable pg_trgm extension for fuzzy matching if not already enabled
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON FUNCTION refresh_budget_unified_stats() IS 'Syncs fp_budget_customer_unified from fp_sales_rep_budget';
COMMENT ON FUNCTION sync_budget_merges_to_unified() IS 'Applies merge rules to fp_budget_customer_unified';
COMMENT ON FUNCTION check_prospect_conversions() IS 'Updates budget prospects to customer status when actual sales found';
COMMENT ON FUNCTION detect_unknown_countries(VARCHAR) IS 'Finds and logs countries not in master_countries';
COMMENT ON FUNCTION resolve_pending_country(INTEGER, VARCHAR, VARCHAR, VARCHAR, VARCHAR) IS 'Admin resolution of pending country assignment';
