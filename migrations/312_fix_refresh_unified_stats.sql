-- Migration 312: Fix refresh_unified_stats to include all fields
-- This updates the function to properly sync sales rep, product group, and country data

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
  v_temp INT;
BEGIN
  -- =========================================
  -- CUSTOMERS: Insert new + Update ALL fields
  -- =========================================
  
  -- First, insert any new customers
  WITH cust_stats AS (
    SELECT
      UPPER(TRIM(customername)) as norm_name,
      MAX(customername) as display_name,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as total_amt,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) as total_morm,
      MIN(MAKE_DATE(year, month, 1)) as first_txn,
      MAX(MAKE_DATE(year, month, 1)) as last_txn,
      ARRAY_AGG(DISTINCT year ORDER BY year) as years
    FROM fp_data_excel
    WHERE type = 'Actual'
    GROUP BY UPPER(TRIM(customername))
  )
  INSERT INTO fp_customer_unified (
    customer_code, display_name, normalized_name, division,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    first_transaction_date, last_transaction_date, transaction_years,
    is_active, created_at, updated_at, created_by, updated_by
  )
  SELECT
    'FP-SYNC-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || ROW_NUMBER() OVER (),
    cs.display_name,
    cs.norm_name,
    'FP',
    cs.total_amt,
    cs.total_kgs,
    cs.total_morm,
    cs.first_txn,
    cs.last_txn,
    cs.years,
    true, NOW(), NOW(), 'refresh_sync', 'refresh_sync'
  FROM cust_stats cs
  WHERE NOT EXISTS (
    SELECT 1 FROM fp_customer_unified cu
    WHERE cu.normalized_name = cs.norm_name
  );

  GET DIAGNOSTICS v_cust = ROW_COUNT;

  -- Update financial stats for existing customers
  UPDATE fp_customer_unified cu
  SET
    total_amount_all_time = cs.total_amt,
    total_kgs_all_time = cs.total_kgs,
    total_morm_all_time = cs.total_morm,
    first_transaction_date = cs.first_txn,
    last_transaction_date = cs.last_txn,
    transaction_years = cs.years,
    updated_at = NOW(),
    updated_by = 'refresh_sync'
  FROM (
    SELECT
      UPPER(TRIM(customername)) as norm_name,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as total_amt,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) as total_morm,
      MIN(MAKE_DATE(year, month, 1)) as first_txn,
      MAX(MAKE_DATE(year, month, 1)) as last_txn,
      ARRAY_AGG(DISTINCT year ORDER BY year) as years
    FROM fp_data_excel
    WHERE type = 'Actual'
    GROUP BY UPPER(TRIM(customername))
  ) cs
  WHERE cu.normalized_name = cs.norm_name;

  GET DIAGNOSTICS v_temp = ROW_COUNT;
  v_cust := v_cust + v_temp;

  -- *** FIX: Update primary_sales_rep_name (most frequent by amount) ***
  UPDATE fp_customer_unified cu
  SET
    primary_sales_rep_name = sr.salesrepname,
    updated_at = NOW()
  FROM (
    WITH ranked AS (
      SELECT
        UPPER(TRIM(customername)) as norm_name,
        salesrepname,
        SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as total_amt,
        ROW_NUMBER() OVER (
          PARTITION BY UPPER(TRIM(customername)) 
          ORDER BY SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) DESC
        ) as rn
      FROM fp_data_excel
      WHERE salesrepname IS NOT NULL AND salesrepname != ''
      GROUP BY UPPER(TRIM(customername)), salesrepname
    )
    SELECT norm_name, salesrepname FROM ranked WHERE rn = 1
  ) sr
  WHERE cu.normalized_name = sr.norm_name
    AND (cu.primary_sales_rep_name IS NULL OR cu.primary_sales_rep_name = '');

  -- *** FIX: Update primary_product_group (most frequent by amount) ***
  UPDATE fp_customer_unified cu
  SET
    primary_product_group = pg.productgroup,
    updated_at = NOW()
  FROM (
    WITH ranked AS (
      SELECT
        UPPER(TRIM(customername)) as norm_name,
        productgroup,
        SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as total_amt,
        ROW_NUMBER() OVER (
          PARTITION BY UPPER(TRIM(customername)) 
          ORDER BY SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) DESC
        ) as rn
      FROM fp_data_excel
      WHERE productgroup IS NOT NULL AND productgroup != ''
      GROUP BY UPPER(TRIM(customername)), productgroup
    )
    SELECT norm_name, productgroup FROM ranked WHERE rn = 1
  ) pg
  WHERE cu.normalized_name = pg.norm_name
    AND (cu.primary_product_group IS NULL OR cu.primary_product_group = '');

  -- *** FIX: Update product_groups array ***
  UPDATE fp_customer_unified cu
  SET
    product_groups = pg.all_pgs,
    updated_at = NOW()
  FROM (
    SELECT
      UPPER(TRIM(customername)) as norm_name,
      ARRAY_AGG(DISTINCT productgroup ORDER BY productgroup) as all_pgs
    FROM fp_data_excel
    WHERE productgroup IS NOT NULL AND productgroup != ''
    GROUP BY UPPER(TRIM(customername))
  ) pg
  WHERE cu.normalized_name = pg.norm_name
    AND (cu.product_groups IS NULL OR array_length(cu.product_groups, 1) IS NULL);

  -- *** FIX: Update primary_country and countries array ***
  UPDATE fp_customer_unified cu
  SET
    primary_country = c.primary_country,
    countries = c.all_countries,
    updated_at = NOW()
  FROM (
    WITH ranked AS (
      SELECT
        UPPER(TRIM(customername)) as norm_name,
        countryname,
        SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as total_amt,
        ROW_NUMBER() OVER (
          PARTITION BY UPPER(TRIM(customername)) 
          ORDER BY SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) DESC
        ) as rn
      FROM fp_data_excel
      WHERE countryname IS NOT NULL AND countryname != ''
      GROUP BY UPPER(TRIM(customername)), countryname
    ),
    primary_countries AS (
      SELECT norm_name, countryname as primary_country FROM ranked WHERE rn = 1
    ),
    all_countries AS (
      SELECT
        UPPER(TRIM(customername)) as norm_name,
        ARRAY_AGG(DISTINCT countryname ORDER BY countryname) as all_countries
      FROM fp_data_excel
      WHERE countryname IS NOT NULL AND countryname != ''
      GROUP BY UPPER(TRIM(customername))
    )
    SELECT pc.norm_name, pc.primary_country, ac.all_countries
    FROM primary_countries pc
    JOIN all_countries ac ON pc.norm_name = ac.norm_name
  ) c
  WHERE cu.normalized_name = c.norm_name
    AND (cu.primary_country IS NULL OR cu.primary_country = '');

  -- *** FIX: Link country_region from master_countries/aliases ***
  UPDATE fp_customer_unified cu
  SET
    country_region = mc.region,
    updated_at = NOW()
  FROM master_countries mc
  WHERE LOWER(TRIM(cu.primary_country)) = LOWER(TRIM(mc.country_name))
    AND cu.country_region IS NULL;

  -- Also check country_aliases
  UPDATE fp_customer_unified cu
  SET
    country_region = mc.region,
    updated_at = NOW()
  FROM country_aliases ca
  JOIN master_countries mc ON ca.master_country_id = mc.id
  WHERE LOWER(TRIM(cu.primary_country)) = LOWER(TRIM(ca.alias_name))
    AND cu.country_region IS NULL;

  -- *** FIX: Link sales rep IDs from fp_sales_rep_unified ***
  UPDATE fp_customer_unified cu
  SET
    primary_sales_rep_id = sru.sales_rep_id,
    sales_rep_group_id = sru.group_id,
    sales_rep_group_name = sru.group_name,
    updated_at = NOW()
  FROM fp_sales_rep_unified sru
  WHERE UPPER(TRIM(cu.primary_sales_rep_name)) = sru.normalized_name
    AND cu.primary_sales_rep_name IS NOT NULL
    AND cu.primary_sales_rep_id IS NULL;

  -- =========================================
  -- SALES REPS: Insert new + Update existing
  -- =========================================
  WITH rep_stats AS (
    SELECT
      UPPER(TRIM(salesrepname)) as norm_name,
      MAX(salesrepname) as display_name,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as total_amt,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) as total_morm,
      COUNT(DISTINCT customername) as cust_count,
      COUNT(DISTINCT countryname) as country_count,
      MIN(MAKE_DATE(year, month, 1)) as first_txn,
      MAX(MAKE_DATE(year, month, 1)) as last_txn
    FROM fp_data_excel
    WHERE type = 'Actual' AND salesrepname IS NOT NULL AND salesrepname != ''
    GROUP BY UPPER(TRIM(salesrepname))
  )
  INSERT INTO fp_sales_rep_unified (
    sales_rep_code, display_name, normalized_name, division,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    customer_count, country_count,
    first_transaction_date, last_transaction_date,
    is_active, created_at, updated_at
  )
  SELECT
    'FP-REP-SYNC-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || ROW_NUMBER() OVER (ORDER BY rs.norm_name),
    rs.display_name,
    rs.norm_name,
    'FP',
    rs.total_amt,
    rs.total_kgs,
    rs.total_morm,
    rs.cust_count,
    rs.country_count,
    rs.first_txn,
    rs.last_txn,
    true, NOW(), NOW()
  FROM rep_stats rs
  WHERE NOT EXISTS (
    SELECT 1 FROM fp_sales_rep_unified ru
    WHERE ru.normalized_name = rs.norm_name
  );

  GET DIAGNOSTICS v_rep = ROW_COUNT;

  -- Update existing reps stats
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
  FROM (
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
    WHERE type = 'Actual' AND salesrepname IS NOT NULL AND salesrepname != ''
    GROUP BY UPPER(TRIM(salesrepname))
  ) rs
  WHERE ru.normalized_name = rs.norm_name;

  GET DIAGNOSTICS v_temp = ROW_COUNT;
  v_rep := v_rep + v_temp;

  -- *** FIX: Link sales rep to groups ***
  UPDATE fp_sales_rep_unified sru
  SET
    group_id = srg.id,
    group_name = srg.group_name,
    updated_at = NOW()
  FROM sales_rep_group_members srgm
  JOIN sales_rep_groups srg ON srgm.group_id = srg.id
  WHERE UPPER(TRIM(sru.display_name)) = UPPER(TRIM(srgm.member_name))
    AND sru.group_id IS NULL;

  -- =========================================
  -- PRODUCT GROUPS: Insert new + Update existing
  -- =========================================
  WITH pg_stats AS (
    SELECT
      UPPER(TRIM(productgroup)) as norm_name,
      MAX(productgroup) as display_name,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as total_amt,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) as total_morm
    FROM fp_data_excel
    WHERE type = 'Actual' AND productgroup IS NOT NULL AND productgroup != ''
    GROUP BY UPPER(TRIM(productgroup))
  )
  INSERT INTO fp_product_group_unified (
    pg_code, display_name, normalized_name, division,
    total_amount_all_time, total_kgs_all_time, total_morm_all_time,
    is_active, created_at, updated_at
  )
  SELECT
    'FP-PG-SYNC-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || ROW_NUMBER() OVER (ORDER BY ps.norm_name),
    ps.display_name,
    ps.norm_name,
    'FP',
    ps.total_amt,
    ps.total_kgs,
    ps.total_morm,
    true, NOW(), NOW()
  FROM pg_stats ps
  WHERE NOT EXISTS (
    SELECT 1 FROM fp_product_group_unified pu
    WHERE pu.normalized_name = ps.norm_name
  );

  GET DIAGNOSTICS v_pg = ROW_COUNT;

  -- Update existing PGs
  UPDATE fp_product_group_unified pu
  SET
    total_amount_all_time = ps.total_amt,
    total_kgs_all_time = ps.total_kgs,
    total_morm_all_time = ps.total_morm,
    updated_at = NOW()
  FROM (
    SELECT
      UPPER(TRIM(productgroup)) as norm_name,
      SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) as total_amt,
      SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
      SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) as total_morm
    FROM fp_data_excel
    WHERE type = 'Actual' AND productgroup IS NOT NULL AND productgroup != ''
    GROUP BY UPPER(TRIM(productgroup))
  ) ps
  WHERE pu.normalized_name = ps.norm_name;

  GET DIAGNOSTICS v_temp = ROW_COUNT;
  v_pg := v_pg + v_temp;

  -- =========================================
  -- Refresh materialized views (if they exist)
  -- =========================================
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_sales_by_customer') THEN
      REFRESH MATERIALIZED VIEW mv_sales_by_customer;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_sales_by_rep_group') THEN
      REFRESH MATERIALIZED VIEW mv_sales_by_rep_group;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_sales_by_product_group') THEN
      REFRESH MATERIALIZED VIEW mv_sales_by_product_group;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_sales_by_country') THEN
      REFRESH MATERIALIZED VIEW mv_sales_by_country;
    END IF;
    v_mv := 4;
  EXCEPTION WHEN OTHERS THEN
    v_mv := 0; -- MVs may not exist
  END;

  RETURN QUERY SELECT v_cust, v_rep, v_pg, v_mv;
END;
$$ LANGUAGE plpgsql;

-- Grant execute
GRANT EXECUTE ON FUNCTION refresh_unified_stats() TO PUBLIC;

-- Output success
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 312 complete: refresh_unified_stats() now includes all field syncs';
END $$;
