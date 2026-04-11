-- ============================================================
-- Migration 325: Fix Inconsistent Merge States
-- ============================================================
-- Date: January 16, 2026
-- Purpose: Clean up 20 customers with is_merged=false but have original_names populated
-- Issue: Data integrity violation - either merged or not, can't be both
-- ============================================================

DO $$
DECLARE
  v_cleaned INTEGER;
BEGIN
  RAISE NOTICE '=== Migration 325: Fixing inconsistent merge states ===';
  
  -- Option 1: Clear original_names if is_merged=false
  -- (Assumes merge was rejected/reverted and original_names should be removed)
  UPDATE fp_customer_unified
  SET 
    original_names = NULL,
    updated_at = NOW(),
    updated_by = 'migration_325'
  WHERE is_merged = FALSE
    AND original_names IS NOT NULL
    AND array_length(original_names, 1) > 0;
  
  GET DIAGNOSTICS v_cleaned = ROW_COUNT;
  
  RAISE NOTICE '✅ Cleaned up % customers with inconsistent merge state', v_cleaned;
  RAISE NOTICE '   Rule: If is_merged=false, original_names should be NULL';
END $$;

-- ============================================================
-- Verify the fix
-- ============================================================
DO $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM fp_customer_unified
  WHERE is_merged = FALSE
    AND original_names IS NOT NULL
    AND array_length(original_names, 1) > 0;
  
  IF v_remaining = 0 THEN
    RAISE NOTICE '✅ All merge state inconsistencies resolved!';
  ELSE
    RAISE WARNING '⚠️  Still % customers with inconsistent state', v_remaining;
  END IF;
END $$;

-- ============================================================
-- Add constraint to prevent future violations (optional)
-- ============================================================
-- Note: This constraint would prevent the issue but may block legitimate workflows
-- Uncomment if you want to enforce this rule at database level

-- ALTER TABLE fp_customer_unified 
-- ADD CONSTRAINT chk_merge_state_consistency 
-- CHECK (
--   (is_merged = TRUE AND original_names IS NOT NULL AND array_length(original_names, 1) > 0) OR
--   (is_merged = FALSE AND (original_names IS NULL OR array_length(original_names, 1) = 0))
-- );
