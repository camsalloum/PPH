-- ============================================================================
-- 501: Create mv_fp_sales_cube materialized view
-- Pre-aggregates fp_actualcommon (60k+ rows) → ~3-6k rows
-- Used by dashboard.js, my-stats, active-customers endpoints
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_fp_sales_cube AS
SELECT
    UPPER(TRIM(admin_division_code))   AS division,
    sales_rep_group_id,
    TRIM(sales_rep_group_name)         AS sales_rep_group_name,
    year,
    month_no,
    TRIM(month)                        AS month,
    TRIM(customer_name)                AS customer_name,
    TRIM(country)                      AS country,
    TRIM(pgcombine)                    AS product_group,
    ROUND(SUM(amount)::numeric, 2)     AS revenue,
    ROUND(SUM(qty_kgs)::numeric, 2)    AS kgs,
    ROUND(SUM(morm)::numeric, 2)       AS morm,
    COUNT(*)                           AS txn_count
FROM fp_actualcommon
WHERE customer_name IS NOT NULL
  AND TRIM(customer_name) != ''
GROUP BY
    UPPER(TRIM(admin_division_code)),
    sales_rep_group_id,
    TRIM(sales_rep_group_name),
    year, month_no, TRIM(month),
    TRIM(customer_name),
    TRIM(country),
    TRIM(pgcombine)
WITH DATA;

-- Unique index required for REFRESH CONCURRENTLY (non-blocking refresh)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cube_pk
  ON mv_fp_sales_cube (
    division,
    COALESCE(sales_rep_group_id, -1),
    COALESCE(sales_rep_group_name, ''),
    year,
    month_no,
    customer_name,
    COALESCE(country, ''),
    COALESCE(product_group, '')
  );

-- Fast access patterns
CREATE INDEX IF NOT EXISTS idx_cube_div_year_month
  ON mv_fp_sales_cube (division, year, month_no);

CREATE INDEX IF NOT EXISTS idx_cube_group_year
  ON mv_fp_sales_cube (division, sales_rep_group_id, year, month_no);

-- Covering index for KPI aggregation (index-only scan)
CREATE INDEX IF NOT EXISTS idx_cube_fast_kpis
  ON mv_fp_sales_cube (division, year, month_no, sales_rep_group_id)
  INCLUDE (revenue, kgs, morm);
