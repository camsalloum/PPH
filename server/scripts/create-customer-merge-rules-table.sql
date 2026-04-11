-- Create Customer Merge Rules Table
-- This script creates a table to store customer merge rules for sales reps

-- 0. Create function for updated_at trigger (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$func$ language 'plpgsql';

-- 1. Customer Merge Rules Table
CREATE TABLE IF NOT EXISTS customer_merge_rules (
  id SERIAL PRIMARY KEY,
  sales_rep VARCHAR(255) NOT NULL,
  division VARCHAR(100) NOT NULL,
  merged_customer_name VARCHAR(500) NOT NULL,
  original_customers JSONB NOT NULL, -- Array of original customer names
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sales_rep, division, merged_customer_name)
);

-- 2. Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_customer_merge_rules_sales_rep ON customer_merge_rules(sales_rep);
CREATE INDEX IF NOT EXISTS idx_customer_merge_rules_division ON customer_merge_rules(division);
CREATE INDEX IF NOT EXISTS idx_customer_merge_rules_active ON customer_merge_rules(is_active);

-- 3. Create Trigger for Updated At
CREATE TRIGGER update_customer_merge_rules_updated_at 
  BEFORE UPDATE ON customer_merge_rules 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
