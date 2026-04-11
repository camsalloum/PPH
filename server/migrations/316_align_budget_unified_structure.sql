-- Migration 316: Align fp_budget_customer_unified with fp_customer_unified structure
-- Adds 30 missing columns so both tables have identical structure
-- Adds is_prospect column to identify budget-only customers

DO $$
BEGIN
  RAISE NOTICE '=== Migration 316: Aligning budget unified table structure ===';
END $$;

-- CRM Fields
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS customer_type VARCHAR(50);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS customer_group VARCHAR(100);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS industry VARCHAR(100);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS market_segment VARCHAR(100);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15,2);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS default_currency VARCHAR(10);

-- Contact Fields
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS mobile VARCHAR(50);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);

-- Location Fields (for map pins)
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS pin_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS pin_source VARCHAR(50);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS pin_confirmed_by VARCHAR(100);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS pin_confirmed_at TIMESTAMP;

-- Business Fields
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS trade_license VARCHAR(100);
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS company_currency VARCHAR(10);

-- PROSPECT INDICATOR (key column - TRUE if customer only exists in budget, not in actual)
ALTER TABLE fp_budget_customer_unified ADD COLUMN IF NOT EXISTS is_prospect BOOLEAN DEFAULT FALSE;

-- Rename budget_customer_id to customer_id for consistency (if not already)
-- Actually, let's keep budget_customer_id but add a comment
COMMENT ON COLUMN fp_budget_customer_unified.budget_customer_id IS 'Primary key for budget customers. Use actual_customer_id to link to fp_customer_unified.customer_id';
COMMENT ON COLUMN fp_budget_customer_unified.is_prospect IS 'TRUE if customer only exists in budget (not in fp_customer_unified), FALSE if they have actual sales history';
COMMENT ON COLUMN fp_budget_customer_unified.actual_customer_id IS 'Links to fp_customer_unified.customer_id for existing customers (NULL for prospects)';

DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns 
  WHERE table_name = 'fp_budget_customer_unified';
  
  RAISE NOTICE '✅ Migration 316 complete: fp_budget_customer_unified now has % columns', col_count;
END $$;
