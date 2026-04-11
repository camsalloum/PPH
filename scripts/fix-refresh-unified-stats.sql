-- Fix refresh_unified_stats to INSERT new records AND UPDATE existing ones
-- This function should be called AFTER upload completes

CREATE OR REPLACE FUNCTION public.refresh_unified_stats()
RETURNS TABLE(customers_updated integer, reps_updated integer, pgs_updated integer, mv_refreshed integer)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_cust INT := 0;
    v_rep INT := 0;
    v_pg INT := 0;
    v_mv INT := 0;
BEGIN
    -- =========================================
    -- CUSTOMERS: Insert new + Update existing
    -- =========================================
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
        is_active, created_at, updated_at
    )
    SELECT 
        'FP-SYNC-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || ROW_NUMBER() OVER () as customer_code,
        cs.display_name,
        cs.norm_name,
        'FP',
        cs.total_amt,
        cs.total_kgs,
        cs.total_morm,
        cs.first_txn,
        cs.last_txn,
        cs.years,
        true, NOW(), NOW()
    FROM cust_stats cs
    WHERE NOT EXISTS (
        SELECT 1 FROM fp_customer_unified cu 
        WHERE cu.normalized_name = cs.norm_name AND cu.division = 'FP'
    );
    
    GET DIAGNOSTICS v_cust = ROW_COUNT;
    
    -- Update existing customers
    UPDATE fp_customer_unified cu
    SET
        total_amount_all_time = cs.total_amt,
        total_kgs_all_time = cs.total_kgs,
        total_morm_all_time = cs.total_morm,
        first_transaction_date = cs.first_txn,
        last_transaction_date = cs.last_txn,
        transaction_years = cs.years,
        updated_at = NOW()
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
    WHERE cu.normalized_name = cs.norm_name AND cu.division = 'FP';
    
    v_cust := v_cust + (SELECT COUNT(*) FROM fp_customer_unified WHERE division = 'FP');

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
        WHERE type = 'Actual'
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
        'FP-REP-SYNC-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || ROW_NUMBER() OVER () as sales_rep_code,
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
        WHERE ru.normalized_name = rs.norm_name AND ru.division = 'FP'
    );
    
    GET DIAGNOSTICS v_rep = ROW_COUNT;
    
    -- Update existing reps
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
        WHERE type = 'Actual'
        GROUP BY UPPER(TRIM(salesrepname))
    ) rs
    WHERE ru.normalized_name = rs.norm_name AND ru.division = 'FP';
    
    v_rep := v_rep + (SELECT COUNT(*) FROM fp_sales_rep_unified WHERE division = 'FP');

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
        WHERE type = 'Actual'
        GROUP BY UPPER(TRIM(productgroup))
    )
    INSERT INTO fp_product_group_unified (
        pg_code, display_name, normalized_name, division,
        total_amount_all_time, total_kgs_all_time, total_morm_all_time,
        is_active, created_at, updated_at
    )
    SELECT 
        'FP-PG-SYNC-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || ROW_NUMBER() OVER () as pg_code,
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
        WHERE pu.normalized_name = ps.norm_name AND pu.division = 'FP'
    );
    
    GET DIAGNOSTICS v_pg = ROW_COUNT;
    
    -- Update existing product groups
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
        WHERE type = 'Actual'
        GROUP BY UPPER(TRIM(productgroup))
    ) ps
    WHERE pu.normalized_name = ps.norm_name AND pu.division = 'FP';
    
    v_pg := v_pg + (SELECT COUNT(*) FROM fp_product_group_unified WHERE division = 'FP');

    -- =========================================
    -- Refresh materialized views
    -- =========================================
    REFRESH MATERIALIZED VIEW mv_sales_by_customer;
    REFRESH MATERIALIZED VIEW mv_sales_by_rep_group;
    REFRESH MATERIALIZED VIEW mv_sales_by_product_group;
    REFRESH MATERIALIZED VIEW mv_sales_by_country;
    v_mv := 4;

    RETURN QUERY SELECT v_cust, v_rep, v_pg, v_mv;
END;
$function$;

-- Verify function works
SELECT * FROM refresh_unified_stats();
