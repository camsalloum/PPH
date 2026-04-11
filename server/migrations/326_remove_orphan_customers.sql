-- ============================================================
-- Migration 326: Remove Orphan Customers
-- ============================================================
-- Date: January 16, 2026
-- Purpose: Remove 257 customers that don't exist in actualcommon OR budget
-- Issue: Old migration populated from fp_data_excel (deprecated table)
--        These customers no longer exist in current source tables
-- Expected Result: 908 → 678 customers (614 actual + 64 prospects)
-- ============================================================

DO $$
DECLARE
  v_orphans_before INTEGER;
  v_orphans_deleted INTEGER;
  v_total_before INTEGER;
  v_total_after INTEGER;
BEGIN
  RAISE NOTICE '=== Migration 326: Removing orphan customers ===';
  
  -- Count before
  SELECT COUNT(*) INTO v_total_before FROM fp_customer_unified;
  
  SELECT COUNT(*) INTO v_orphans_before
  FROM fp_customer_unified cu
  WHERE NOT EXISTS (
    SELECT 1 FROM fp_actualcommon ac 
    WHERE UPPER(TRIM(ac.customer_name)) = cu.normalized_name
  )
  AND NOT EXISTS (
    SELECT 1 FROM fp_budget_unified bu 
    WHERE UPPER(TRIM(bu.customer_name)) = cu.normalized_name
  );
  
  RAISE NOTICE 'Total customers before: %', v_total_before;
  RAISE NOTICE 'Orphan customers to remove: %', v_orphans_before;
  
  -- Delete orphan customers
  DELETE FROM fp_customer_unified cu
  WHERE NOT EXISTS (
    SELECT 1 FROM fp_actualcommon ac 
    WHERE UPPER(TRIM(ac.customer_name)) = cu.normalized_name
  )
  AND NOT EXISTS (
    SELECT 1 FROM fp_budget_unified bu 
    WHERE UPPER(TRIM(bu.customer_name)) = cu.normalized_name
  );
  
  GET DIAGNOSTICS v_orphans_deleted = ROW_COUNT;
  
  -- Count after
  SELECT COUNT(*) INTO v_total_after FROM fp_customer_unified;
  
  RAISE NOTICE '✅ Removed % orphan customers', v_orphans_deleted;
  RAISE NOTICE 'Total customers after: %', v_total_after;
  RAISE NOTICE 'Expected: 678 (614 actual + 64 prospects)';
  
  IF v_total_after != 678 THEN
    RAISE WARNING 'Total still not matching expected! Got %, expected 678', v_total_after;
  ELSE
    RAISE NOTICE '🎉 Customer count now matches expected!';
  END IF;
  
END $$;

-- Final verification
SELECT 
  COUNT(*) as total_customers,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM fp_actualcommon ac 
      WHERE UPPER(TRIM(ac.customer_name)) = normalized_name
    )
  ) as in_actual,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM fp_budget_unified bu 
      WHERE UPPER(TRIM(bu.customer_name)) = normalized_name
    )
  ) as in_budget,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM fp_actualcommon ac 
      WHERE UPPER(TRIM(ac.customer_name)) = normalized_name
    )
    AND EXISTS (
      SELECT 1 FROM fp_budget_unified bu 
      WHERE UPPER(TRIM(bu.customer_name)) = normalized_name
    )
  ) as common_in_both
FROM fp_customer_unified;
