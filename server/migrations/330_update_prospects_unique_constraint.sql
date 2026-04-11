-- Migration: Update fp_prospects unique constraint
-- Prospect is uniquely defined by: Division + Customer Name + Country + Sales Rep Group

-- 1. Drop the old constraint (customer_name, division, budget_year)
ALTER TABLE fp_prospects 
DROP CONSTRAINT IF EXISTS fp_prospects_customer_name_division_budget_year_key;

-- 2. Add new unique constraint
ALTER TABLE fp_prospects 
ADD CONSTRAINT fp_prospects_unique_customer 
UNIQUE (customer_name, division, country, sales_rep_group);

-- 3. budget_year becomes optional metadata, not part of unique key
-- (A prospect remains the same prospect across years)

-- 4. Create useful indexes
CREATE INDEX IF NOT EXISTS idx_fp_prospects_division ON fp_prospects(UPPER(division));
CREATE INDEX IF NOT EXISTS idx_fp_prospects_sales_rep ON fp_prospects(UPPER(sales_rep_group));
CREATE INDEX IF NOT EXISTS idx_fp_prospects_country ON fp_prospects(UPPER(country));
CREATE INDEX IF NOT EXISTS idx_fp_prospects_status ON fp_prospects(status);
