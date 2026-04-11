-- Migration 319: Sync product group exclusions between fp_raw_product_groups and fp_product_group_unified
-- When is_unmapped=true in fp_raw_product_groups, set is_active=false in fp_product_group_unified
-- Date: 2026-01-04

-- Step 1: Create function to sync exclusion status
CREATE OR REPLACE FUNCTION sync_product_group_exclusions()
RETURNS TABLE (
  synced_count INTEGER,
  excluded_pgs TEXT[]
) AS $$
DECLARE
  v_synced INTEGER := 0;
  v_excluded TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Find all pg_combines that have ANY raw_product_group marked as is_unmapped=true
  -- and set is_active=false in fp_product_group_unified
  
  WITH excluded_pg_combines AS (
    SELECT DISTINCT UPPER(TRIM(pg_combine)) AS norm_pg_combine
    FROM fp_raw_product_groups
    WHERE is_unmapped = true
    AND pg_combine IS NOT NULL
  ),
  updated AS (
    UPDATE fp_product_group_unified pgu
    SET is_active = false, updated_at = NOW()
    WHERE (
      UPPER(TRIM(pgu.pg_combine_name)) IN (SELECT norm_pg_combine FROM excluded_pg_combines)
      OR UPPER(TRIM(pgu.normalized_name)) IN (SELECT norm_pg_combine FROM excluded_pg_combines)
      OR pgu.normalized_name IN (
        SELECT UPPER(TRIM(raw_product_group)) 
        FROM fp_raw_product_groups 
        WHERE is_unmapped = true
      )
    )
    AND pgu.is_active = true
    RETURNING pgu.display_name
  )
  SELECT COUNT(*), ARRAY_AGG(display_name)
  INTO v_synced, v_excluded
  FROM updated;
  
  -- Also reactivate any that were excluded but now are mapped
  WITH active_pg_combines AS (
    SELECT DISTINCT UPPER(TRIM(pg_combine)) AS norm_pg_combine
    FROM fp_raw_product_groups
    WHERE is_unmapped = false
    AND pg_combine IS NOT NULL
  ),
  reactivated AS (
    UPDATE fp_product_group_unified pgu
    SET is_active = true, updated_at = NOW()
    WHERE (
      UPPER(TRIM(pgu.pg_combine_name)) IN (SELECT norm_pg_combine FROM active_pg_combines)
      OR UPPER(TRIM(pgu.normalized_name)) IN (SELECT norm_pg_combine FROM active_pg_combines)
    )
    AND pgu.is_active = false
    -- Only reactivate if ALL raw entries for this pg_combine are not unmapped
    AND NOT EXISTS (
      SELECT 1 FROM fp_raw_product_groups rpg
      WHERE (UPPER(TRIM(rpg.pg_combine)) = UPPER(TRIM(pgu.pg_combine_name))
             OR UPPER(TRIM(rpg.pg_combine)) = pgu.normalized_name)
      AND rpg.is_unmapped = true
    )
    RETURNING pgu.display_name
  )
  SELECT v_synced + COUNT(*) INTO v_synced FROM reactivated;
  
  RETURN QUERY SELECT v_synced, v_excluded;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Run the sync now
SELECT * FROM sync_product_group_exclusions();

-- Step 3: Update the save-and-sync route to call this function
-- (Done via code change in fp.js)

-- Step 4: Add trigger to auto-sync when fp_raw_product_groups is updated
CREATE OR REPLACE FUNCTION trigger_sync_pg_exclusions()
RETURNS TRIGGER AS $$
BEGIN
  -- When is_unmapped changes, sync to unified table
  IF (TG_OP = 'UPDATE' AND OLD.is_unmapped IS DISTINCT FROM NEW.is_unmapped) THEN
    PERFORM sync_product_group_exclusions();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_pg_exclusions ON fp_raw_product_groups;
CREATE TRIGGER trg_sync_pg_exclusions
AFTER UPDATE ON fp_raw_product_groups
FOR EACH ROW
EXECUTE FUNCTION trigger_sync_pg_exclusions();

-- Add comment
COMMENT ON FUNCTION sync_product_group_exclusions() IS 
'Syncs is_unmapped from fp_raw_product_groups to is_active in fp_product_group_unified.
When any raw_product_group is marked is_unmapped=true, the corresponding entry in 
fp_product_group_unified gets is_active=false, which excludes it from vw_unified_sales_complete';
