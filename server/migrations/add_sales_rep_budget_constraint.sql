-- Migration: Add unique constraint to sales_rep_budget table
-- This prevents duplicate records and enables ON CONFLICT updates

-- Drop existing index if it exists (in case of re-run)
DROP INDEX IF EXISTS idx_sales_rep_budget_unique;

-- Create unique constraint index
CREATE UNIQUE INDEX idx_sales_rep_budget_unique 
ON sales_rep_budget (
  division, 
  budget_year, 
  month, 
  type, 
  salesrepname, 
  customername, 
  countryname, 
  productgroup, 
  values_type
);

-- Add comment to explain the constraint
COMMENT ON INDEX idx_sales_rep_budget_unique IS 
'Ensures no duplicate budget records for the same combination of division, year, month, type, sales rep, customer, country, product group, and value type';

-- Verify the index was created
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'sales_rep_budget'
  AND indexname = 'idx_sales_rep_budget_unique';


















