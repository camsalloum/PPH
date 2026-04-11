-- Migration 315: Create All Sync Triggers
-- Triggers for automatic syncing of unified tables
-- Date: 2026-01-04

-- ============================================================
-- TRIGGER 1: Budget Data Upload → Sync Budget Unified
-- ============================================================
CREATE OR REPLACE FUNCTION trg_sync_budget_on_data_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync budget unified table
  PERFORM refresh_budget_unified_stats();
  
  -- Apply merge rules
  PERFORM sync_budget_merges_to_unified();
  
  -- Detect unknown countries
  PERFORM detect_unknown_countries('fp_sales_rep_budget');
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_budget_unified ON fp_sales_rep_budget;
CREATE TRIGGER trg_sync_budget_unified
AFTER INSERT OR UPDATE OR DELETE ON fp_sales_rep_budget
FOR EACH STATEMENT
EXECUTE FUNCTION trg_sync_budget_on_data_change();

-- ============================================================
-- TRIGGER 2: Merge Rules → Sync BOTH Unified Tables
-- ============================================================
CREATE OR REPLACE FUNCTION trg_sync_all_merges_on_rule_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync actual customer unified
  PERFORM sync_customer_merges_to_unified();
  
  -- Sync budget customer unified
  PERFORM sync_budget_merges_to_unified();
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_merges_on_rule_change ON fp_division_customer_merge_rules;
CREATE TRIGGER trg_sync_merges_on_rule_change
AFTER INSERT OR UPDATE OR DELETE ON fp_division_customer_merge_rules
FOR EACH STATEMENT
EXECUTE FUNCTION trg_sync_all_merges_on_rule_change();

-- ============================================================
-- TRIGGER 3: Sales Rep Group Changes → Sync BOTH Unified Tables
-- ============================================================
CREATE OR REPLACE FUNCTION trg_sync_on_group_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync actual unified (refresh group assignments)
  PERFORM refresh_unified_stats();
  
  -- Sync budget unified (refresh group assignments)
  PERFORM refresh_budget_unified_stats();
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_on_group_member_change ON sales_rep_group_members;
CREATE TRIGGER trg_sync_on_group_member_change
AFTER INSERT OR UPDATE OR DELETE ON sales_rep_group_members
FOR EACH STATEMENT
EXECUTE FUNCTION trg_sync_on_group_change();

-- ============================================================
-- TRIGGER 4: Master Countries Change → Sync BOTH Unified Tables
-- ============================================================
CREATE OR REPLACE FUNCTION trg_sync_on_country_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync actual unified (refresh region assignments)
  PERFORM refresh_unified_stats();
  
  -- Sync budget unified (refresh region assignments)
  PERFORM refresh_budget_unified_stats();
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_on_master_country_change ON master_countries;
CREATE TRIGGER trg_sync_on_master_country_change
AFTER INSERT OR UPDATE OR DELETE ON master_countries
FOR EACH STATEMENT
EXECUTE FUNCTION trg_sync_on_country_change();

-- ============================================================
-- TRIGGER 5: Country Aliases Change → Sync BOTH Unified Tables
-- ============================================================
DROP TRIGGER IF EXISTS trg_sync_on_country_alias_change ON country_aliases;
CREATE TRIGGER trg_sync_on_country_alias_change
AFTER INSERT OR UPDATE OR DELETE ON country_aliases
FOR EACH STATEMENT
EXECUTE FUNCTION trg_sync_on_country_change();

-- ============================================================
-- TRIGGER 6: Update Actual Data Trigger to include new functions
-- (Modifies existing trigger function)
-- ============================================================
CREATE OR REPLACE FUNCTION trg_sync_unified_on_actual_data_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync actual unified table
  PERFORM refresh_unified_stats();
  
  -- Apply merge rules
  PERFORM sync_customer_merges_to_unified();
  
  -- Check if any budget prospects became customers
  PERFORM check_prospect_conversions();
  
  -- Detect unknown countries
  PERFORM detect_unknown_countries('fp_data_excel');
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Update existing trigger to use new function (if trigger exists)
DO $$
BEGIN
  -- Drop old trigger if exists
  DROP TRIGGER IF EXISTS trg_sync_unified_on_insert ON fp_data_excel;
  DROP TRIGGER IF EXISTS trg_sync_customer_excel ON fp_data_excel;
  
  -- Create new comprehensive trigger
  CREATE TRIGGER trg_sync_unified_on_actual_change
  AFTER INSERT OR UPDATE OR DELETE ON fp_data_excel
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_sync_unified_on_actual_data_change();
  
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Trigger already exists
END $$;

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON FUNCTION trg_sync_budget_on_data_change() IS 'Trigger function: syncs budget unified on budget data changes';
COMMENT ON FUNCTION trg_sync_all_merges_on_rule_change() IS 'Trigger function: syncs both unified tables on merge rule changes';
COMMENT ON FUNCTION trg_sync_on_group_change() IS 'Trigger function: syncs both unified tables on group membership changes';
COMMENT ON FUNCTION trg_sync_on_country_change() IS 'Trigger function: syncs both unified tables on country/alias changes';
COMMENT ON FUNCTION trg_sync_unified_on_actual_data_change() IS 'Trigger function: comprehensive sync on actual data changes';
