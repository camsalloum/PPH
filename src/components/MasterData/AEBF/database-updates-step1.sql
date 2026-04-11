-- ============================================================================
-- AEBF IMPLEMENTATION - STEP 1: Database Schema Updates
-- ============================================================================
-- Purpose: Add division column, timestamps, indexes, and support tables
-- Date: November 13, 2025
-- Risk Level: LOW (only adds columns and tables, doesn't delete data)
-- Estimated Duration: 15-20 minutes
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD NEW COLUMNS TO EXISTING TABLE
-- ============================================================================

-- Add division column (FP/SB/TF/HCM)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'fp_data_excel' 
        AND column_name = 'division'
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD COLUMN division VARCHAR(10);
        
        -- Set default value for existing records (assumes they are FP division)
        UPDATE public.fp_data_excel 
        SET division = 'FP' 
        WHERE division IS NULL;
        
        -- Make it NOT NULL after populating
        ALTER TABLE public.fp_data_excel 
        ALTER COLUMN division SET NOT NULL;
        
        RAISE NOTICE 'Added division column and populated with FP';
    ELSE
        RAISE NOTICE 'division column already exists, skipping';
    END IF;
END $$;

-- Add updated_at timestamp column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'fp_data_excel' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
        
        -- Set current timestamp for existing records
        UPDATE public.fp_data_excel 
        SET updated_at = NOW() 
        WHERE updated_at IS NULL;
        
        RAISE NOTICE 'Added updated_at column';
    ELSE
        RAISE NOTICE 'updated_at column already exists, skipping';
    END IF;
END $$;

-- Add uploaded_by column (tracks who uploaded the data)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'fp_data_excel' 
        AND column_name = 'uploaded_by'
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD COLUMN uploaded_by VARCHAR(255);
        
        RAISE NOTICE 'Added uploaded_by column';
    ELSE
        RAISE NOTICE 'uploaded_by column already exists, skipping';
    END IF;
END $$;

-- Add sourcesheet column (tracks which Excel file data came from)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'fp_data_excel' 
        AND column_name = 'sourcesheet'
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD COLUMN sourcesheet VARCHAR(255);
        
        RAISE NOTICE 'Added sourcesheet column';
    ELSE
        RAISE NOTICE 'sourcesheet column already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- 2. CREATE UNIQUE CONSTRAINT (Prevents duplicate records)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_actual_record' 
        AND conrelid = 'public.fp_data_excel'::regclass
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD CONSTRAINT unique_actual_record 
        UNIQUE (division, year, month, type, customername, productgroup, material, values_type);
        
        RAISE NOTICE 'Created unique constraint: unique_actual_record';
    ELSE
        RAISE NOTICE 'Unique constraint already exists, skipping';
    END IF;
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'Cannot create unique constraint - duplicate records exist in table';
        RAISE NOTICE 'Run this query to find duplicates:';
        RAISE NOTICE 'SELECT division, year, month, type, customername, productgroup, material, values_type, COUNT(*) FROM public.fp_data_excel GROUP BY division, year, month, type, customername, productgroup, material, values_type HAVING COUNT(*) > 1;';
END $$;

-- ============================================================================
-- 3. CREATE PERFORMANCE INDEXES
-- ============================================================================

-- Index on division (for filtering by division)
CREATE INDEX IF NOT EXISTS ix_fp_data_division 
ON public.fp_data_excel(division);

-- Index on type (Actual/Budget/Estimate/Forecast)
CREATE INDEX IF NOT EXISTS ix_fp_data_type 
ON public.fp_data_excel(type);

-- Index on values_type (Amount/KGS/MoRM)
CREATE INDEX IF NOT EXISTS ix_fp_data_values_type 
ON public.fp_data_excel(values_type);

-- Composite index for common query patterns (division + type + year + month)
CREATE INDEX IF NOT EXISTS ix_fp_data_composite 
ON public.fp_data_excel(division, type, year, month);

-- Index on updated_at (for finding recent uploads)
CREATE INDEX IF NOT EXISTS ix_fp_data_updated_at 
ON public.fp_data_excel(updated_at DESC);

-- Index on sourcesheet (for tracking data sources)
CREATE INDEX IF NOT EXISTS ix_fp_data_sourcesheet 
ON public.fp_data_excel(sourcesheet);

-- Index on customer name (for customer lookups)
CREATE INDEX IF NOT EXISTS ix_fp_data_customer 
ON public.fp_data_excel(customername);

-- Created 7 performance indexes

-- ============================================================================
-- 4. CREATE BACKUP TABLE (for REPLACE mode operations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fp_data_excel_backup (
    LIKE public.fp_data_excel INCLUDING ALL,
    backup_timestamp TIMESTAMP DEFAULT NOW(),
    backup_reason TEXT
);

-- Index on backup table for quick lookups
CREATE INDEX IF NOT EXISTS ix_backup_timestamp 
ON public.fp_data_excel_backup(backup_timestamp DESC);

CREATE INDEX IF NOT EXISTS ix_backup_division_type 
ON public.fp_data_excel_backup(division, type);

-- Created fp_data_excel_backup table

-- ============================================================================
-- 5. CREATE ARCHIVE TABLE (for old data >3 years)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fp_data_excel_archive (
    LIKE public.fp_data_excel INCLUDING ALL,
    archived_at TIMESTAMP DEFAULT NOW(),
    archive_reason TEXT
);

-- Index on archive table
CREATE INDEX IF NOT EXISTS ix_archive_timestamp 
ON public.fp_data_excel_archive(archived_at DESC);

CREATE INDEX IF NOT EXISTS ix_archive_division_year 
ON public.fp_data_excel_archive(division, year);

-- Created fp_data_excel_archive table

-- ============================================================================
-- 6. CREATE AUDIT TABLE (tracks all upload operations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.aebf_upload_audit (
    id SERIAL PRIMARY KEY,
    division VARCHAR(10) NOT NULL,
    uploaded_by VARCHAR(255) NOT NULL,
    file_name VARCHAR(255),
    upload_mode VARCHAR(50),  -- 'upsert' or 'replace'
    records_processed INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_deleted INTEGER DEFAULT 0,
    qc_status VARCHAR(50),    -- 'passed', 'failed', 'warning'
    qc_details JSONB,         -- QC validation results
    success BOOLEAN NOT NULL,
    error_message TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for audit table
CREATE INDEX IF NOT EXISTS ix_audit_division 
ON public.aebf_upload_audit(division);

CREATE INDEX IF NOT EXISTS ix_audit_uploaded_at 
ON public.aebf_upload_audit(uploaded_at DESC);

CREATE INDEX IF NOT EXISTS ix_audit_uploaded_by 
ON public.aebf_upload_audit(uploaded_by);

CREATE INDEX IF NOT EXISTS ix_audit_success 
ON public.aebf_upload_audit(success);

-- Created aebf_upload_audit table

-- ============================================================================
-- 7. DISPLAY SUMMARY
-- ============================================================================

-- Show updated table structure
\echo ''
\echo '======================================================================'
\echo 'STEP 1 COMPLETED SUCCESSFULLY'
\echo '======================================================================'
\echo ''
\echo 'Tables Created/Updated:'
\echo '  + fp_data_excel (added: division, updated_at, uploaded_by, sourcesheet)'
\echo '  + fp_data_excel_backup (for REPLACE mode backups)'
\echo '  + fp_data_excel_archive (for data archival)'
\echo '  + aebf_upload_audit (for tracking uploads)'
\echo ''
\echo 'Indexes Created: 13 indexes across all tables'
\echo 'Constraint Added: unique_actual_record'
\echo ''
\echo 'Next Steps:'
\echo '  1. Verify table structure: \d+ fp_data_excel'
\echo '  2. Check sample data: SELECT * FROM fp_data_excel LIMIT 5;'
\echo '  3. Verify new columns: SELECT division, updated_at, uploaded_by FROM fp_data_excel LIMIT 5;'
\echo '  4. Check backup table: \dt+ fp_data_excel*'
\echo ''
\echo 'If everything looks good, approve Step 1 to proceed to Step 2'
\echo '======================================================================'

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after script completes)
-- ============================================================================

-- Verify new columns exist
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'fp_data_excel' 
  AND column_name IN ('division', 'updated_at', 'uploaded_by', 'sourcesheet')
ORDER BY column_name;

-- Verify indexes created
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename IN ('fp_data_excel', 'fp_data_excel_backup', 'fp_data_excel_archive', 'aebf_upload_audit')
ORDER BY tablename, indexname;

-- Check record count and new columns
SELECT 
    COUNT(*) as total_records,
    COUNT(DISTINCT division) as divisions,
    MIN(updated_at) as oldest_update,
    MAX(updated_at) as newest_update
FROM public.fp_data_excel;

-- Verify all tables created
SELECT 
    table_name, 
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name LIKE 'fp_data_excel%' OR table_name = 'aebf_upload_audit'
ORDER BY table_name;
