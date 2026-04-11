-- Migration 314b: Fix Budget Unified Sync Functions for correct column names
-- The fp_sales_rep_budget table uses:
--   - customername (not customer_name)
--   - salesrepname (not salesrep)
--   - countryname (not country)
--   - productgroup (not product_group)
--   - values + values_type (not separate amount/kgs/morm columns)

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
    customername AS display_name,
    UPPER(TRIM(customername)) AS normalized_name,
    -- Primary sales rep (by highest amount)
    (SELECT b2.salesrepname FROM fp_sales_rep_budget b2 
     WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
       AND UPPER(b2.values_type) = 'AMOUNT'
     GROUP BY b2.salesrepname 
     ORDER BY SUM(COALESCE(b2.values, 0)) DESC 
     LIMIT 1) AS primary_sales_rep_name,
    -- Primary country (by highest amount)
    (SELECT b2.countryname FROM fp_sales_rep_budget b2 
     WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
       AND b2.countryname IS NOT NULL
       AND UPPER(b2.values_type) = 'AMOUNT'
     GROUP BY b2.countryname 
     ORDER BY SUM(COALESCE(b2.values, 0)) DESC 
     LIMIT 1) AS primary_country,
    -- All countries
    ARRAY(SELECT DISTINCT b2.countryname FROM fp_sales_rep_budget b2 
          WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
            AND b2.countryname IS NOT NULL) AS countries,
    -- Primary product group (by highest amount)
    (SELECT b2.productgroup FROM fp_sales_rep_budget b2 
     WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
       AND b2.productgroup IS NOT NULL
       AND UPPER(b2.values_type) = 'AMOUNT'
     GROUP BY b2.productgroup 
     ORDER BY SUM(COALESCE(b2.values, 0)) DESC 
     LIMIT 1) AS primary_product_group,
    -- All product groups
    ARRAY(SELECT DISTINCT b2.productgroup FROM fp_sales_rep_budget b2 
          WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
            AND b2.productgroup IS NOT NULL) AS product_groups,
    -- Aggregates (filter by values_type)
    (SELECT SUM(COALESCE(b2.values, 0)) FROM fp_sales_rep_budget b2 
     WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
       AND UPPER(b2.values_type) = 'AMOUNT') AS total_budget_amount,
    (SELECT SUM(COALESCE(b2.values, 0)) FROM fp_sales_rep_budget b2 
     WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
       AND UPPER(b2.values_type) = 'KGS') AS total_budget_kgs,
    (SELECT SUM(COALESCE(b2.values, 0)) FROM fp_sales_rep_budget b2 
     WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
       AND UPPER(b2.values_type) = 'MORM') AS total_budget_morm,
    -- Budget years
    ARRAY(SELECT DISTINCT b2.year FROM fp_sales_rep_budget b2 
          WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
            AND b2.year IS NOT NULL
          ORDER BY b2.year) AS budget_years,
    -- Dates
    (SELECT MIN(MAKE_DATE(b2.year, b2.month, 1)) FROM fp_sales_rep_budget b2 
     WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
       AND b2.year IS NOT NULL AND b2.month IS NOT NULL) AS first_budget_date,
    (SELECT MAX(MAKE_DATE(b2.year, b2.month, 1)) FROM fp_sales_rep_budget b2 
     WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
       AND b2.year IS NOT NULL AND b2.month IS NOT NULL) AS last_budget_date,
    'FP' AS division
  FROM fp_sales_rep_budget b
  WHERE customername IS NOT NULL
    AND TRIM(customername) != ''
  GROUP BY UPPER(TRIM(customername)), customername
  ON CONFLICT (normalized_name, division) DO NOTHING;
  
  GET DIAGNOSTICS v_customers_inserted = ROW_COUNT;
  
  -- Step 2: Update existing customers with latest stats
  WITH budget_stats AS (
    SELECT 
      UPPER(TRIM(customername)) AS normalized_name,
      -- Primary sales rep
      (SELECT b2.salesrepname FROM fp_sales_rep_budget b2 
       WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
         AND UPPER(b2.values_type) = 'AMOUNT'
       GROUP BY b2.salesrepname 
       ORDER BY SUM(COALESCE(b2.values, 0)) DESC 
       LIMIT 1) AS primary_sales_rep_name,
      -- Primary country
      (SELECT b2.countryname FROM fp_sales_rep_budget b2 
       WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
         AND b2.countryname IS NOT NULL
         AND UPPER(b2.values_type) = 'AMOUNT'
       GROUP BY b2.countryname 
       ORDER BY SUM(COALESCE(b2.values, 0)) DESC 
       LIMIT 1) AS primary_country,
      -- All countries
      ARRAY(SELECT DISTINCT b2.countryname FROM fp_sales_rep_budget b2 
            WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
              AND b2.countryname IS NOT NULL) AS countries,
      -- Primary product group
      (SELECT b2.productgroup FROM fp_sales_rep_budget b2 
       WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
         AND b2.productgroup IS NOT NULL
         AND UPPER(b2.values_type) = 'AMOUNT'
       GROUP BY b2.productgroup 
       ORDER BY SUM(COALESCE(b2.values, 0)) DESC 
       LIMIT 1) AS primary_product_group,
      -- All product groups
      ARRAY(SELECT DISTINCT b2.productgroup FROM fp_sales_rep_budget b2 
            WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
              AND b2.productgroup IS NOT NULL) AS product_groups,
      -- Aggregates
      (SELECT SUM(COALESCE(b2.values, 0)) FROM fp_sales_rep_budget b2 
       WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
         AND UPPER(b2.values_type) = 'AMOUNT') AS total_budget_amount,
      (SELECT SUM(COALESCE(b2.values, 0)) FROM fp_sales_rep_budget b2 
       WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
         AND UPPER(b2.values_type) = 'KGS') AS total_budget_kgs,
      (SELECT SUM(COALESCE(b2.values, 0)) FROM fp_sales_rep_budget b2 
       WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
         AND UPPER(b2.values_type) = 'MORM') AS total_budget_morm,
      -- Budget years
      ARRAY(SELECT DISTINCT b2.year FROM fp_sales_rep_budget b2 
            WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
              AND b2.year IS NOT NULL
            ORDER BY b2.year) AS budget_years,
      -- Year data JSONB
      (SELECT jsonb_object_agg(yr, data)
       FROM (
         SELECT 
           year::TEXT AS yr,
           jsonb_build_object(
             'budget_amount', COALESCE(SUM(CASE WHEN UPPER(values_type) = 'AMOUNT' THEN values END), 0),
             'budget_kgs', COALESCE(SUM(CASE WHEN UPPER(values_type) = 'KGS' THEN values END), 0),
             'budget_morm', COALESCE(SUM(CASE WHEN UPPER(values_type) = 'MORM' THEN values END), 0)
           ) AS data
         FROM fp_sales_rep_budget b2 
         WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
           AND year IS NOT NULL
         GROUP BY year
       ) AS yearly_data
      ) AS year_data,
      -- Dates
      (SELECT MIN(MAKE_DATE(b2.year, b2.month, 1)) FROM fp_sales_rep_budget b2 
       WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
         AND b2.year IS NOT NULL AND b2.month IS NOT NULL) AS first_budget_date,
      (SELECT MAX(MAKE_DATE(b2.year, b2.month, 1)) FROM fp_sales_rep_budget b2 
       WHERE UPPER(TRIM(b2.customername)) = UPPER(TRIM(b.customername))
         AND b2.year IS NOT NULL AND b2.month IS NOT NULL) AS last_budget_date
    FROM fp_sales_rep_budget b
    WHERE customername IS NOT NULL
      AND TRIM(customername) != ''
    GROUP BY UPPER(TRIM(customername)), customername
  )
  UPDATE fp_budget_customer_unified u
  SET
    primary_sales_rep_name = s.primary_sales_rep_name,
    primary_country = s.primary_country,
    countries = s.countries,
    primary_product_group = s.primary_product_group,
    product_groups = s.product_groups,
    total_budget_amount = COALESCE(s.total_budget_amount, 0),
    total_budget_kgs = COALESCE(s.total_budget_kgs, 0),
    total_budget_morm = COALESCE(s.total_budget_morm, 0),
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

-- Update detect_unknown_countries to use correct column names
CREATE OR REPLACE FUNCTION detect_unknown_countries(
  p_source_table TEXT DEFAULT 'all'
)
RETURNS JSONB AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec RECORD;
  v_best_match TEXT;
  v_best_score NUMERIC;
BEGIN
  -- Check if pg_trgm extension exists for similarity matching
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  END IF;

  -- Find unknown countries and insert into pending_country_assignments
  FOR v_rec IN
    -- From fp_data_excel (uses 'country' column)
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
    
    -- From fp_sales_rep_budget (uses 'countryname' column)
    SELECT 
      b.countryname AS country_name,
      UPPER(TRIM(b.countryname)) AS normalized_name,
      'fp_sales_rep_budget' AS source_table,
      COUNT(*) AS occurrence_count,
      (SELECT ARRAY_AGG(DISTINCT cust) FROM (
        SELECT b2.customername AS cust 
        FROM fp_sales_rep_budget b2 
        WHERE UPPER(TRIM(b2.countryname)) = UPPER(TRIM(b.countryname))
        LIMIT 5
      ) AS subq) AS sample_customers
    FROM fp_sales_rep_budget b
    LEFT JOIN master_countries mc ON UPPER(TRIM(b.countryname)) = UPPER(TRIM(mc.country))
    LEFT JOIN country_aliases ca ON UPPER(TRIM(b.countryname)) = UPPER(TRIM(ca.alias))
    WHERE b.countryname IS NOT NULL
      AND TRIM(b.countryname) != ''
      AND mc.country IS NULL
      AND ca.alias IS NULL
      AND (p_source_table = 'all' OR p_source_table = 'fp_sales_rep_budget')
    GROUP BY b.countryname, UPPER(TRIM(b.countryname))
  LOOP
    -- Try to find best match from master_countries using similarity
    SELECT 
      mc.country,
      similarity(v_rec.normalized_name, UPPER(TRIM(mc.country))) AS sim
    INTO v_best_match, v_best_score
    FROM master_countries mc
    ORDER BY similarity(v_rec.normalized_name, UPPER(TRIM(mc.country))) DESC
    LIMIT 1;
    
    -- Insert into pending_country_assignments if not already there
    INSERT INTO pending_country_assignments (
      country_name,
      normalized_name,
      source_table,
      occurrence_count,
      sample_customers,
      suggested_master_country,
      suggested_confidence,
      status
    )
    VALUES (
      v_rec.country_name,
      v_rec.normalized_name,
      v_rec.source_table,
      v_rec.occurrence_count,
      v_rec.sample_customers,
      CASE WHEN v_best_score > 0.3 THEN v_best_match ELSE NULL END,
      v_best_score,
      'PENDING'
    )
    ON CONFLICT (normalized_name, source_table) 
    DO UPDATE SET
      occurrence_count = EXCLUDED.occurrence_count,
      sample_customers = EXCLUDED.sample_customers,
      suggested_master_country = EXCLUDED.suggested_master_country,
      suggested_confidence = EXCLUDED.suggested_confidence,
      detected_at = NOW()
    WHERE pending_country_assignments.status = 'PENDING';
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'unknown_countries_found', v_count,
    'source_table', p_source_table,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;
