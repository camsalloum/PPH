-- Dashboard Performance Indexes (TD-027)
-- These 3 indexes cover all dashboard WHERE patterns on fp_actualcommon.
-- CONCURRENTLY = no table lock, safe for production.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fpa_div_year_month
  ON fp_actualcommon (admin_division_code, year, month_no);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fpa_group_year_month
  ON fp_actualcommon (admin_division_code, sales_rep_group_id, year, month_no)
  WHERE sales_rep_group_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fpa_customer_year
  ON fp_actualcommon (admin_division_code, customer_name, year);
