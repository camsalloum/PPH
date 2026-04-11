-- Performance Optimization Indexes for Sales Rep Dashboard
-- These indexes will significantly improve query performance for sales rep data

-- Drop existing indexes if they exist (to avoid conflicts)
DROP INDEX IF EXISTS idx_fp_data_sales_rep_performance;
DROP INDEX IF EXISTS idx_fp_data_customer_performance;
DROP INDEX IF EXISTS idx_fp_data_product_group_performance;
DROP INDEX IF EXISTS idx_fp_data_country_performance;

-- 1. Primary composite index for sales rep dashboard queries
-- This covers the most common query pattern: salesrepname + productgroup + values_type + year + month + type
CREATE INDEX idx_fp_data_sales_rep_performance 
ON fp_data_excel (salesrepname, productgroup, values_type, year, month, type);

-- 2. Customer-focused index for customer dashboard queries
-- This optimizes queries that filter by salesrepname + customername + year + month + type
CREATE INDEX idx_fp_data_customer_performance 
ON fp_data_excel (salesrepname, customername, year, month, type);

-- 3. Product group index for product group lookups
-- This speeds up queries that get distinct product groups by sales rep
CREATE INDEX idx_fp_data_product_group_performance 
ON fp_data_excel (salesrepname, productgroup) 
WHERE productgroup IS NOT NULL AND productgroup != '';

-- 4. Country-based index for sales by country queries
-- This optimizes country-related queries
CREATE INDEX idx_fp_data_country_performance 
ON fp_data_excel (salesrepname, countryname, year, month, type) 
WHERE countryname IS NOT NULL AND countryname != '';

-- 5. Values index for aggregation queries
-- This speeds up SUM operations on the values column
CREATE INDEX idx_fp_data_values_performance 
ON fp_data_excel (salesrepname, values_type, type, values) 
WHERE values IS NOT NULL;

-- Analyze tables to update statistics after index creation
ANALYZE fp_data_excel;

-- Display index information
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'fp_data_excel' 
AND indexname LIKE '%performance%'
ORDER BY indexname;

-- Performance test queries to verify index usage
-- You can run these to check if indexes are being used:

/*
-- Test query 1: Sales rep dashboard data
EXPLAIN ANALYZE
SELECT SUM(values) as total_value 
FROM fp_data_excel 
WHERE TRIM(UPPER(salesrepname)) = TRIM(UPPER('Abraham Mathew'))
AND productgroup = 'BEVERAGES' 
AND UPPER(values_type) = UPPER('KGS')
AND year = 2024 
AND month = 1 
AND UPPER(type) = UPPER('Actual');

-- Test query 2: Customer data
EXPLAIN ANALYZE
SELECT SUM(values) as total_value 
FROM fp_data_excel 
WHERE TRIM(UPPER(salesrepname)) = TRIM(UPPER('Abraham Mathew'))
AND customername = 'NESTLE WATERS FACTORY H&O LLC'
AND UPPER(values_type) = UPPER('KGS')
AND year = 2024 
AND month = 1 
AND UPPER(type) = UPPER('Actual');

-- Test query 3: Product groups by sales rep
EXPLAIN ANALYZE
SELECT DISTINCT productgroup 
FROM fp_data_excel 
WHERE TRIM(UPPER(salesrepname)) = TRIM(UPPER('Abraham Mathew'))
AND productgroup IS NOT NULL 
AND productgroup != '' 
ORDER BY productgroup;
*/