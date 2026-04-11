-- Indexes for HTML Budget Form Performance
-- These indexes optimize queries for fetching customer Actual sales data by sales rep, year, and month

-- Index for HTML budget customer query (grouped by customer, country, product group, month)
CREATE INDEX IF NOT EXISTS idx_fp_html_budget_customers 
ON public.fp_data_excel(division, year, type, salesrepname, customername, countryname, productgroup, month) 
WHERE type = 'Actual' AND values_type = 'KGS';

-- Index for budget insert/update operations
CREATE INDEX IF NOT EXISTS idx_fp_budget_insert 
ON public.fp_data_excel(division, year, month, type, salesrepname, customername, countryname, productgroup, values_type)
WHERE type = 'Budget';

-- Composite index for faster lookups
CREATE INDEX IF NOT EXISTS idx_fp_actual_sales_rep_customer 
ON public.fp_data_excel(division, year, type, salesrepname, customername, countryname, productgroup, month, values_type)
WHERE type = 'Actual' AND customername IS NOT NULL AND TRIM(customername) != '';

-- Analyze tables to update statistics
ANALYZE public.fp_data_excel;



