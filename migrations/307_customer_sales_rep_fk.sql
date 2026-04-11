-- ============================================================
-- MIGRATION 307: Add Sales Rep Foreign Key to Customer Unified
-- ============================================================
-- Purpose: Link customers to sales_rep_unified with group info
-- Created: January 2, 2026
-- 
-- FIXES:
--   - Adds sales_rep_id foreign key
--   - Adds sales_rep_group_id and sales_rep_group_name
--   - Auto-populates from existing primary_sales_rep_name
--   - Updates sync function to maintain these links
-- ============================================================

-- Step 1: Add new columns
DO $$
BEGIN
  -- Add sales_rep_id FK
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fp_customer_unified' AND column_name = 'primary_sales_rep_id'
  ) THEN
    ALTER TABLE fp_customer_unified ADD COLUMN primary_sales_rep_id INTEGER;
    COMMENT ON COLUMN fp_customer_unified.primary_sales_rep_id IS 'FK to fp_sales_rep_unified.sales_rep_id';
  END IF;
  
  -- Add sales_rep_group_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fp_customer_unified' AND column_name = 'sales_rep_group_id'
  ) THEN
    ALTER TABLE fp_customer_unified ADD COLUMN sales_rep_group_id INTEGER;
    COMMENT ON COLUMN fp_customer_unified.sales_rep_group_id IS 'FK to sales_rep_groups.id';
  END IF;
  
  -- Add sales_rep_group_name (denormalized for fast queries)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fp_customer_unified' AND column_name = 'sales_rep_group_name'
  ) THEN
    ALTER TABLE fp_customer_unified ADD COLUMN sales_rep_group_name VARCHAR(200);
    COMMENT ON COLUMN fp_customer_unified.sales_rep_group_name IS 'Denormalized group name for fast queries';
  END IF;
END $$;

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_customer_unified_sales_rep_id ON fp_customer_unified(primary_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_customer_unified_group_id ON fp_customer_unified(sales_rep_group_id);
CREATE INDEX IF NOT EXISTS idx_customer_unified_group_name ON fp_customer_unified(sales_rep_group_name);

-- Step 3: Populate from existing data
UPDATE fp_customer_unified cu
SET 
  primary_sales_rep_id = sru.sales_rep_id,
  sales_rep_group_id = sru.group_id,
  sales_rep_group_name = sru.group_name,
  updated_at = NOW()
FROM fp_sales_rep_unified sru
WHERE UPPER(TRIM(cu.primary_sales_rep_name)) = sru.normalized_name
  AND cu.primary_sales_rep_id IS NULL;

-- Step 4: Create function to sync sales rep links
CREATE OR REPLACE FUNCTION sync_customer_sales_rep_links()
RETURNS TABLE (
  customers_updated INTEGER,
  unlinked_count INTEGER,
  warnings TEXT[]
) AS $$
DECLARE
  v_updated INTEGER := 0;
  v_unlinked INTEGER := 0;
  v_warnings TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Update all customers with their current sales rep link
  UPDATE fp_customer_unified cu
  SET 
    primary_sales_rep_id = sru.sales_rep_id,
    sales_rep_group_id = sru.group_id,
    sales_rep_group_name = sru.group_name,
    updated_at = NOW()
  FROM fp_sales_rep_unified sru
  WHERE UPPER(TRIM(cu.primary_sales_rep_name)) = sru.normalized_name
    AND (cu.primary_sales_rep_id IS DISTINCT FROM sru.sales_rep_id
         OR cu.sales_rep_group_id IS DISTINCT FROM sru.group_id
         OR cu.sales_rep_group_name IS DISTINCT FROM sru.group_name);
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  -- Count unlinked customers
  SELECT COUNT(*) INTO v_unlinked
  FROM fp_customer_unified cu
  WHERE cu.primary_sales_rep_name IS NOT NULL
    AND cu.primary_sales_rep_id IS NULL;
  
  -- Generate warnings for unlinked customers with significant sales
  SELECT ARRAY_AGG('Customer "' || display_name || '" has sales rep "' || primary_sales_rep_name || '" not found in unified table')
  INTO v_warnings
  FROM fp_customer_unified
  WHERE primary_sales_rep_name IS NOT NULL
    AND primary_sales_rep_id IS NULL
    AND total_amount_all_time > 10000;
  
  v_warnings := COALESCE(v_warnings, ARRAY[]::TEXT[]);
  
  RETURN QUERY SELECT v_updated, v_unlinked, v_warnings;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger to auto-update links when sales rep groups change
CREATE OR REPLACE FUNCTION trigger_sync_customer_sales_rep()
RETURNS TRIGGER AS $$
BEGIN
  -- When a sales rep's group changes, update all their customers
  UPDATE fp_customer_unified cu
  SET 
    sales_rep_group_id = NEW.group_id,
    sales_rep_group_name = NEW.group_name,
    updated_at = NOW()
  WHERE cu.primary_sales_rep_id = NEW.sales_rep_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_sync_customer_sales_rep ON fp_sales_rep_unified;

-- Create trigger
CREATE TRIGGER trg_sync_customer_sales_rep
  AFTER UPDATE OF group_id, group_name ON fp_sales_rep_unified
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sync_customer_sales_rep();

-- Step 6: Update the main sync function to include sales rep links
DROP FUNCTION IF EXISTS sync_unified_data();

CREATE OR REPLACE FUNCTION sync_unified_data()
RETURNS TABLE (
  customers_synced INTEGER,
  sales_reps_synced INTEGER,
  product_groups_synced INTEGER,
  customer_merges_applied INTEGER,
  sales_rep_groups_applied INTEGER,
  customer_sales_rep_links INTEGER,
  warnings TEXT[]
) AS $$
DECLARE
  v_cust INTEGER := 0;
  v_reps INTEGER := 0;
  v_pgs INTEGER := 0;
  v_merges INTEGER := 0;
  v_rep_groups INTEGER := 0;
  v_rep_links INTEGER := 0;
  v_warnings TEXT[] := ARRAY[]::TEXT[];
  v_link_warnings TEXT[];
BEGIN
  -- 1. Sync customer merges
  SELECT merges_applied INTO v_merges FROM sync_customer_merges_to_unified();
  
  -- 2. Sync sales rep groups
  SELECT reps_updated INTO v_rep_groups FROM sync_sales_rep_groups_to_unified();
  
  -- 3. Sync product groups
  SELECT new_in_unified INTO v_pgs FROM sync_product_groups_complete();
  
  -- 4. Sync customer-sales rep links (NEW!)
  SELECT csr.customers_updated, csr.warnings INTO v_rep_links, v_link_warnings
  FROM sync_customer_sales_rep_links() csr;
  v_warnings := v_warnings || COALESCE(v_link_warnings, ARRAY[]::TEXT[]);
  
  -- 5. Refresh materialized views if they exist
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sales_summary;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- View may not exist
  END;
  
  RETURN QUERY SELECT v_cust, v_reps, v_pgs, v_merges, v_rep_groups, v_rep_links, v_warnings;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Run initial population
SELECT * FROM sync_customer_sales_rep_links();

-- Grant permissions
GRANT EXECUTE ON FUNCTION sync_customer_sales_rep_links() TO PUBLIC;
GRANT EXECUTE ON FUNCTION trigger_sync_customer_sales_rep() TO PUBLIC;

-- Log completion
DO $$ 
DECLARE
  v_linked INTEGER;
  v_unlinked INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_linked FROM fp_customer_unified WHERE primary_sales_rep_id IS NOT NULL;
  SELECT COUNT(*) INTO v_unlinked FROM fp_customer_unified WHERE primary_sales_rep_id IS NULL AND primary_sales_rep_name IS NOT NULL;
  
  RAISE NOTICE 'Migration 307 complete - Sales Rep FK added to Customer Unified';
  RAISE NOTICE 'Customers linked to sales rep: %', v_linked;
  RAISE NOTICE 'Customers still unlinked: %', v_unlinked;
END $$;
