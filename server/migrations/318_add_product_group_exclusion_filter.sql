-- Migration 318: Add product group exclusion filter to vw_unified_sales_complete
-- This ensures excluded product groups (is_active=false) are not counted in aggregations
-- Date: 2026-01-04

-- Drop and recreate the view with product group active filter
DROP VIEW IF EXISTS vw_unified_sales_complete CASCADE;

CREATE OR REPLACE VIEW vw_unified_sales_complete AS
SELECT
    CASE
        WHEN cu.is_merged = true THEN cu_target.customer_id
        ELSE cu.customer_id
    END AS customer_id,
    CASE
        WHEN cu.is_merged = true THEN cu_target.display_name
        ELSE cu.display_name
    END AS customer_name,
    CASE
        WHEN cu.is_merged = true THEN cu_target.customer_code
        ELSE cu.customer_code
    END AS customer_code,
    cu.is_merged,
    sr.sales_rep_id,
    sr.display_name AS sales_rep_name,
    sr.group_id AS sales_rep_group_id,
    sr.group_name AS sales_rep_group_name,
    pg.pg_id AS product_group_id,
    d.productgroup AS raw_product_group,
    COALESCE(rpg.pg_combine, d.productgroup) AS pg_combine,
    COALESCE(pg.material, 'Others'::character varying) AS material,
    COALESCE(pg.process, 'Others'::character varying) AS process,
    COALESCE(pg.pg_combined, 'Others Others'::character varying) AS material_process,
    d.countryname AS country,
    COALESCE(mc.id, mca.id) AS country_id,
    COALESCE(mc.region, mca.region, 'Unknown'::character varying) AS country_region,
    COALESCE(mc.market_type, mca.market_type, 'Emerging'::character varying) AS country_market_type,
    COALESCE(mc.currency_code, mca.currency_code, 'USD'::character varying) AS country_currency,
    COALESCE(mc.continent, mca.continent, 'Unknown'::character varying) AS continent,
    d.year,
    d.month,
    d.type AS data_type,
    d.values_type,
    d."values",
    d.division,
    COALESCE(cu.company_currency, 'AED'::character varying) AS company_currency,
    COALESCE(er.rate, 1.0) AS exchange_rate_to_aed,
    d."values" * COALESCE(er.rate, 1.0) AS values_in_aed,
    -- Add is_active flag so consumers can filter if needed
    COALESCE(pg.is_active, true) AS product_group_is_active
FROM fp_data_excel d
LEFT JOIN fp_customer_unified cu 
    ON cu.normalized_name::text = upper(TRIM(BOTH FROM d.customername))
LEFT JOIN fp_customer_unified cu_target 
    ON cu.merged_into_id = cu_target.customer_id
LEFT JOIN fp_sales_rep_unified sr 
    ON sr.normalized_name::text = upper(TRIM(BOTH FROM d.salesrepname))
LEFT JOIN fp_raw_product_groups rpg 
    ON upper(TRIM(BOTH FROM rpg.raw_product_group)) = upper(TRIM(BOTH FROM d.productgroup))
LEFT JOIN fp_product_group_unified pg 
    ON pg.pg_combine_name::text = rpg.pg_combine::text 
    OR pg.normalized_name::text = upper(TRIM(BOTH FROM rpg.pg_combine))
LEFT JOIN master_countries mc 
    ON upper(TRIM(BOTH FROM mc.country_name)) = upper(TRIM(BOTH FROM d.countryname))
LEFT JOIN country_aliases ca 
    ON upper(TRIM(BOTH FROM ca.alias_name)) = upper(TRIM(BOTH FROM d.countryname))
LEFT JOIN master_countries mca 
    ON ca.master_country_id = mca.id
LEFT JOIN LATERAL (
    SELECT exchange_rates.rate
    FROM exchange_rates
    WHERE exchange_rates.from_currency::text = COALESCE(mc.currency_code, mca.currency_code, 'USD'::character varying)::text 
      AND exchange_rates.to_currency::text = 'AED'::text
    ORDER BY exchange_rates.effective_date DESC
    LIMIT 1
) er ON true
-- CRITICAL: Filter out excluded product groups
WHERE COALESCE(pg.is_active, true) = true;

-- Add comment explaining the filter
COMMENT ON VIEW vw_unified_sales_complete IS 
'Master unified sales view. Automatically:
- Applies customer merge rules (is_merged → merged_into_id)
- Maps sales reps to groups
- Maps product groups to pg_combine with material/process
- Maps countries to regions/market types
- Calculates values_in_aed with exchange rates
- EXCLUDES product groups where is_active=false (excluded from totals)';

-- Recreate materialized views that depend on this view
-- mv_sales_by_customer
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_customer;
CREATE MATERIALIZED VIEW mv_sales_by_customer AS
SELECT 
    customer_id,
    customer_name,
    customer_code,
    year,
    data_type,
    SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
    SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
    SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
    COUNT(*) AS record_count
FROM vw_unified_sales_complete
WHERE customer_name IS NOT NULL
GROUP BY customer_id, customer_name, customer_code, year, data_type;

CREATE INDEX idx_mv_customer_id ON mv_sales_by_customer(customer_id);
CREATE INDEX idx_mv_customer_year ON mv_sales_by_customer(year);

-- mv_sales_by_rep_group
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_rep_group;
CREATE MATERIALIZED VIEW mv_sales_by_rep_group AS
SELECT 
    sales_rep_group_id,
    sales_rep_group_name,
    year,
    data_type,
    SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
    SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
    SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
    COUNT(*) AS record_count
FROM vw_unified_sales_complete
WHERE sales_rep_group_name IS NOT NULL
GROUP BY sales_rep_group_id, sales_rep_group_name, year, data_type;

CREATE INDEX idx_mv_rep_group_id ON mv_sales_by_rep_group(sales_rep_group_id);
CREATE INDEX idx_mv_rep_year ON mv_sales_by_rep_group(year);

-- mv_sales_by_product_group
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_product_group;
CREATE MATERIALIZED VIEW mv_sales_by_product_group AS
SELECT 
    product_group_id,
    pg_combine,
    material,
    process,
    material_process,
    year,
    data_type,
    SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
    SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
    SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
    COUNT(*) AS record_count
FROM vw_unified_sales_complete
GROUP BY product_group_id, pg_combine, material, process, material_process, year, data_type;

CREATE INDEX idx_mv_pg_id ON mv_sales_by_product_group(product_group_id);
CREATE INDEX idx_mv_pg_year ON mv_sales_by_product_group(year);

-- mv_sales_by_country
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_country;
CREATE MATERIALIZED VIEW mv_sales_by_country AS
SELECT 
    country_id,
    country,
    country_region,
    country_market_type,
    continent,
    year,
    data_type,
    SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
    SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
    SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
    COUNT(*) AS record_count
FROM vw_unified_sales_complete
WHERE country IS NOT NULL
GROUP BY country_id, country, country_region, country_market_type, continent, year, data_type;

CREATE INDEX idx_mv_country_id ON mv_sales_by_country(country_id);
CREATE INDEX idx_mv_country_year ON mv_sales_by_country(year);

-- Grant permissions
GRANT SELECT ON vw_unified_sales_complete TO PUBLIC;
GRANT SELECT ON mv_sales_by_customer TO PUBLIC;
GRANT SELECT ON mv_sales_by_rep_group TO PUBLIC;
GRANT SELECT ON mv_sales_by_product_group TO PUBLIC;
GRANT SELECT ON mv_sales_by_country TO PUBLIC;
