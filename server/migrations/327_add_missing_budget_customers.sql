-- ============================================================
-- Migration 327: Add Missing Budget-Only Customers
-- ============================================================
-- Date: January 16, 2026
-- Purpose: Add 27 budget-only customers (prospects) to fp_customer_unified
-- Issue: Migration 324 only synced from actualcommon, missed budget-only customers
-- Expected Result: 651 → 678 customers
-- ============================================================

DO $$
DECLARE
  v_inserted INTEGER;
  v_total_before INTEGER;
  v_total_after INTEGER;
BEGIN
  RAISE NOTICE '=== Migration 327: Adding missing budget-only customers ===';
  
  SELECT COUNT(*) INTO v_total_before FROM fp_customer_unified;
  RAISE NOTICE 'Total customers before: %', v_total_before;
  
  -- Insert budget-only customers
  INSERT INTO fp_customer_unified (
    customer_code,
    display_name,
    normalized_name,
    countries,
    division,
    is_active,
    is_merged,
    original_names,
    created_by,
    updated_by
  )
  SELECT DISTINCT ON (UPPER(TRIM(bu.customer_name)))
    'CUST-' || LPAD(NEXTVAL('fp_customer_unified_customer_id_seq')::TEXT, 6, '0'),
    INITCAP(TRIM(bu.customer_name)),
    UPPER(TRIM(bu.customer_name)),
    ARRAY[UPPER(TRIM(COALESCE(bu.country, 'UNKNOWN')))]::TEXT[],
    'FP',
    TRUE,
    FALSE,
    ARRAY[]::TEXT[],
    'migration_327',
    'migration_327'
  FROM fp_budget_unified bu
  WHERE bu.customer_name IS NOT NULL
    AND UPPER(TRIM(bu.customer_name)) NOT IN (
      SELECT normalized_name FROM fp_customer_unified
    )
  ORDER BY UPPER(TRIM(bu.customer_name));
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  
  SELECT COUNT(*) INTO v_total_after FROM fp_customer_unified;
  
  RAISE NOTICE '✅ Inserted % budget-only customers', v_inserted;
  RAISE NOTICE 'Total customers after: %', v_total_after;
  RAISE NOTICE 'Expected: 678';
  
  IF v_total_after != 678 THEN
    RAISE WARNING 'Total not matching! Got %, expected 678', v_total_after;
  ELSE
    RAISE NOTICE '🎉 Perfect! Customer count now matches: 614 actual + 64 prospects = 678';
  END IF;
  
END $$;

-- Final verification
SELECT 
  COUNT(*) as total,
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
  ) as in_both
FROM fp_customer_unified;
