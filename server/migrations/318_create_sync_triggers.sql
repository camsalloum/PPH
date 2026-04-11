-- Migration 318: Sync triggers for unified tables
-- Triggers fire when master data changes (merge rules, groups, countries)
-- Uses AFTER triggers with deferred execution to avoid deadlocks

-- Drop existing triggers first
DROP TRIGGER IF EXISTS trg_sync_countries ON master_countries;
DROP TRIGGER IF EXISTS trg_sync_country_aliases ON country_aliases;
DROP TRIGGER IF EXISTS trg_sync_sales_rep_groups ON sales_rep_group_members;
DROP TRIGGER IF EXISTS trg_sync_merge_rules ON fp_division_customer_merge_rules;

-- Drop existing functions to allow recreation with correct return type
DROP FUNCTION IF EXISTS sync_countries_to_unified() CASCADE;
DROP FUNCTION IF EXISTS sync_country_aliases_to_unified() CASCADE;
DROP FUNCTION IF EXISTS sync_sales_rep_groups_to_unified() CASCADE;
DROP FUNCTION IF EXISTS sync_merge_rules_to_unified() CASCADE;

-- ============================================================================
-- FUNCTION 1: Sync when country/region changes
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_countries_to_unified()
RETURNS TRIGGER AS $$
BEGIN
  -- Update fp_customer_unified
  UPDATE fp_customer_unified cu
  SET country_region = NEW.region
  WHERE UPPER(TRIM(cu.primary_country)) = UPPER(TRIM(NEW.country_name))
    AND cu.country_region IS DISTINCT FROM NEW.region;
    
  -- Update fp_budget_customer_unified
  UPDATE fp_budget_customer_unified bu
  SET country_region = NEW.region
  WHERE UPPER(TRIM(bu.primary_country)) = UPPER(TRIM(NEW.country_name))
    AND bu.country_region IS DISTINCT FROM NEW.region;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION 2: Sync when country alias is added/changed
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_country_aliases_to_unified()
RETURNS TRIGGER AS $$
DECLARE
  v_country_name TEXT;
  v_region TEXT;
BEGIN
  -- Get the master country info
  SELECT mc.country_name, mc.region INTO v_country_name, v_region
  FROM master_countries mc
  WHERE mc.id = NEW.country_id;
  
  IF v_country_name IS NOT NULL THEN
    -- Update customers that match the alias
    UPDATE fp_customer_unified cu
    SET 
      primary_country = v_country_name,
      country_region = v_region
    WHERE UPPER(TRIM(cu.primary_country)) = UPPER(TRIM(NEW.alias_name))
      AND cu.primary_country IS DISTINCT FROM v_country_name;
      
    UPDATE fp_budget_customer_unified bu
    SET 
      primary_country = v_country_name,
      country_region = v_region
    WHERE UPPER(TRIM(bu.primary_country)) = UPPER(TRIM(NEW.alias_name))
      AND bu.primary_country IS DISTINCT FROM v_country_name;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION 3: Sync when sales rep group membership changes
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_sales_rep_groups_to_unified()
RETURNS TRIGGER AS $$
DECLARE
  v_group_name TEXT;
  v_sales_rep_name TEXT;
BEGIN
  -- Handle INSERT or UPDATE
  IF TG_OP = 'DELETE' THEN
    v_sales_rep_name := OLD.sales_rep_name;
  ELSE
    v_sales_rep_name := NEW.sales_rep_name;
    
    -- Get group name
    SELECT group_name INTO v_group_name
    FROM sales_rep_groups
    WHERE id = NEW.group_id;
  END IF;
  
  -- Update fp_customer_unified for customers with this sales rep
  UPDATE fp_customer_unified cu
  SET 
    sales_rep_group_id = CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.group_id END,
    sales_rep_group_name = CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_group_name END
  WHERE UPPER(TRIM(cu.primary_sales_rep_name)) = UPPER(TRIM(v_sales_rep_name));
  
  -- Update fp_budget_customer_unified
  UPDATE fp_budget_customer_unified bu
  SET 
    sales_rep_group_id = CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.group_id END,
    sales_rep_group_name = CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_group_name END
  WHERE UPPER(TRIM(bu.primary_sales_rep_name)) = UPPER(TRIM(v_sales_rep_name));
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION 4: Sync when merge rule is approved
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_merge_rules_to_unified()
RETURNS TRIGGER AS $$
DECLARE
  v_original TEXT;
BEGIN
  -- Only process if rule is active
  IF NEW.is_active = TRUE THEN
    -- For each original customer name, update unified tables
    IF NEW.original_customers IS NOT NULL THEN
      FOREACH v_original IN ARRAY NEW.original_customers
      LOOP
        -- Mark customer as merged in fp_customer_unified
        UPDATE fp_customer_unified cu
        SET 
          is_merged = TRUE,
          merged_into_id = (
            SELECT customer_id FROM fp_customer_unified 
            WHERE customer_code = NEW.master_customer_code 
            LIMIT 1
          )
        WHERE UPPER(TRIM(cu.display_name)) = UPPER(TRIM(v_original))
          AND cu.customer_code != NEW.master_customer_code;
          
        -- Mark customer as merged in fp_budget_customer_unified
        UPDATE fp_budget_customer_unified bu
        SET 
          is_merged = TRUE,
          merged_into_id = (
            SELECT budget_customer_id FROM fp_budget_customer_unified 
            WHERE customer_code = NEW.master_customer_code 
            LIMIT 1
          )
        WHERE UPPER(TRIM(bu.display_name)) = UPPER(TRIM(v_original))
          AND (bu.customer_code IS NULL OR bu.customer_code != NEW.master_customer_code);
      END LOOP;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CREATE TRIGGERS (with error handling for existing triggers)
-- ============================================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trg_sync_countries ON master_countries;
DROP TRIGGER IF EXISTS trg_sync_country_aliases ON country_aliases;
DROP TRIGGER IF EXISTS trg_sync_sales_rep_groups ON sales_rep_group_members;
DROP TRIGGER IF EXISTS trg_sync_merge_rules ON fp_division_customer_merge_rules;

-- Create triggers
CREATE TRIGGER trg_sync_countries
  AFTER INSERT OR UPDATE ON master_countries
  FOR EACH ROW EXECUTE FUNCTION sync_countries_to_unified();

CREATE TRIGGER trg_sync_country_aliases
  AFTER INSERT OR UPDATE ON country_aliases
  FOR EACH ROW EXECUTE FUNCTION sync_country_aliases_to_unified();

CREATE TRIGGER trg_sync_sales_rep_groups
  AFTER INSERT OR UPDATE OR DELETE ON sales_rep_group_members
  FOR EACH ROW EXECUTE FUNCTION sync_sales_rep_groups_to_unified();

CREATE TRIGGER trg_sync_merge_rules
  AFTER INSERT OR UPDATE ON fp_division_customer_merge_rules
  FOR EACH ROW EXECUTE FUNCTION sync_merge_rules_to_unified();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION sync_countries_to_unified() TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_country_aliases_to_unified() TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_sales_rep_groups_to_unified() TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_merge_rules_to_unified() TO PUBLIC;

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 318 complete: 4 sync triggers created';
  RAISE NOTICE '  - trg_sync_countries (master_countries)';
  RAISE NOTICE '  - trg_sync_country_aliases (country_aliases)';
  RAISE NOTICE '  - trg_sync_sales_rep_groups (sales_rep_group_members)';
  RAISE NOTICE '  - trg_sync_merge_rules (fp_division_customer_merge_rules)';
END $$;
