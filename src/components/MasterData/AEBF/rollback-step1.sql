-- ============================================================================
-- ROLLBACK SCRIPT FOR STEP 1
-- ============================================================================
-- Purpose: Removes all changes made by database-updates-step1.sql
-- Use this if Step 1 causes issues and you need to revert
-- WARNING: This will drop columns and tables - make sure you have backups!
-- ============================================================================

BEGIN;

\echo '======================================================================'
\echo 'ROLLING BACK STEP 1 - Database Schema Updates'
\echo '======================================================================'

-- Drop audit table
DROP TABLE IF EXISTS public.aebf_upload_audit CASCADE;
\echo '✅ Dropped aebf_upload_audit table'

-- Drop archive table
DROP TABLE IF EXISTS public.fp_data_excel_archive CASCADE;
\echo '✅ Dropped fp_data_excel_archive table'

-- Drop backup table
DROP TABLE IF EXISTS public.fp_data_excel_backup CASCADE;
\echo '✅ Dropped fp_data_excel_backup table'

-- Drop unique constraint
ALTER TABLE public.fp_data_excel 
DROP CONSTRAINT IF EXISTS unique_actual_record;
\echo '✅ Dropped unique_actual_record constraint'

-- Drop indexes on main table (indexes on dropped tables are auto-removed)
DROP INDEX IF EXISTS public.ix_fp_data_division;
DROP INDEX IF EXISTS public.ix_fp_data_type;
DROP INDEX IF EXISTS public.ix_fp_data_values_type;
DROP INDEX IF EXISTS public.ix_fp_data_composite;
DROP INDEX IF EXISTS public.ix_fp_data_updated_at;
DROP INDEX IF EXISTS public.ix_fp_data_sourcesheet;
DROP INDEX IF EXISTS public.ix_fp_data_customer;
\echo '✅ Dropped 7 indexes from fp_data_excel'

-- Drop new columns
ALTER TABLE public.fp_data_excel DROP COLUMN IF EXISTS sourcesheet;
ALTER TABLE public.fp_data_excel DROP COLUMN IF EXISTS uploaded_by;
ALTER TABLE public.fp_data_excel DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.fp_data_excel DROP COLUMN IF EXISTS division;
\echo '✅ Dropped 4 columns from fp_data_excel'

\echo ''
\echo '======================================================================'
\echo 'ROLLBACK COMPLETED'
\echo '======================================================================'
\echo 'All Step 1 changes have been reverted'
\echo 'Table fp_data_excel restored to original structure'
\echo ''
\echo 'Verify with: \d fp_data_excel'
\echo '======================================================================'

COMMIT;
