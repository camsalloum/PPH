-- ============================================================================
-- Migration: Clean Up fp_budget_unified Table
-- Date: 2026-01-11
-- Purpose: 
--   1. Unify year columns (merge year into budget_year)
--   2. Remove 13 unnecessary columns that are never used in budget data
-- ============================================================================

-- BACKUP: Export current data before making changes
-- Run this command manually before executing migration:
-- COPY fp_budget_unified TO '/tmp/fp_budget_unified_backup_20260111.csv' CSV HEADER;

BEGIN;

-- ============================================================================
-- STEP 1: Unify Year Columns
-- ============================================================================

-- For records where budget_year is NULL but year exists, copy year to budget_year
UPDATE fp_budget_unified 
SET budget_year = year 
WHERE budget_year IS NULL AND year IS NOT NULL;

-- For records where both exist but are different, keep budget_year 
-- (this shouldn't happen, but log it if it does)
DO $$
DECLARE
  conflicting_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflicting_count
  FROM fp_budget_unified
  WHERE year IS NOT NULL 
    AND budget_year IS NOT NULL 
    AND year != budget_year;
  
  IF conflicting_count > 0 THEN
    RAISE NOTICE 'Warning: Found % records where year != budget_year', conflicting_count;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Remove 13 Unnecessary Columns
-- ============================================================================

-- Invoice/Transaction columns (Oracle-specific)
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS invoice_date;
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS invoice_no;
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS transaction_type;

-- Customer detail columns
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS customer_code;
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS contact_name;
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS address_1;
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS credit_limit;
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS payment_terms;

-- Product/Item columns
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS item_code;
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS selection_code;

-- Manufacturing columns
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS machine_no;

-- ERP sync columns
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS erp_row_id;
ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS sync_source;

-- ============================================================================
-- STEP 3: Drop the duplicate 'year' column
-- ============================================================================

ALTER TABLE fp_budget_unified DROP COLUMN IF EXISTS year;

-- ============================================================================
-- STEP 4: Verification
-- ============================================================================

DO $$
DECLARE
  total_records INTEGER;
  null_budget_year INTEGER;
BEGIN
  -- Check total records
  SELECT COUNT(*) INTO total_records FROM fp_budget_unified;
  RAISE NOTICE 'Total records in fp_budget_unified: %', total_records;
  
  -- Check for records with NULL budget_year
  SELECT COUNT(*) INTO null_budget_year 
  FROM fp_budget_unified 
  WHERE budget_year IS NULL AND is_budget = true;
  
  IF null_budget_year > 0 THEN
    RAISE WARNING 'Found % budget records with NULL budget_year!', null_budget_year;
  ELSE
    RAISE NOTICE 'All budget records have budget_year populated ✓';
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Display remaining columns
-- ============================================================================

SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'fp_budget_unified'
ORDER BY ordinal_position;

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================
-- 
-- Columns Removed (13):
--   1. invoice_date          - Only for actual invoices
--   2. invoice_no            - Only for actual invoices
--   3. transaction_type      - Only for actual transactions
--   4. customer_code         - Not used (customer_name is sufficient)
--   5. contact_name          - Customer contact details
--   6. address_1             - Customer address
--   7. credit_limit          - Financial data
--   8. payment_terms         - Payment conditions
--   9. item_code             - Oracle item codes
--   10. selection_code       - Oracle selection codes
--   11. machine_no           - Production machine numbers
--   12. erp_row_id           - Oracle ERP row identifier
--   13. sync_source          - Data sync metadata
--
-- Year Column Unified:
--   - Removed 'year' column
--   - All data now uses 'budget_year' as single source of truth
--
-- Rollback:
--   If needed, restore from backup:
--   \COPY fp_budget_unified FROM '/tmp/fp_budget_unified_backup_20260111.csv' CSV HEADER;
--
-- ============================================================================
