-- ============================================================================
-- Script: Verify Actual Data Table Structure
-- Purpose: Check if fp_data_excel and hc_data_excel have all required columns
-- ============================================================================

-- Check fp_data_excel table structure
SELECT 
    'fp_data_excel' as table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'fp_data_excel'
ORDER BY ordinal_position;

-- Check hc_data_excel table structure
SELECT 
    'hc_data_excel' as table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'hc_data_excel'
ORDER BY ordinal_position;

-- Check for missing required columns in fp_data_excel
SELECT 
    'fp_data_excel' as table_name,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fp_data_excel' AND column_name = 'division') THEN 'MISSING: division'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fp_data_excel' AND column_name = 'sourcesheet') THEN 'MISSING: sourcesheet'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fp_data_excel' AND column_name = 'uploaded_by') THEN 'MISSING: uploaded_by'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fp_data_excel' AND column_name = 'created_at') THEN 'MISSING: created_at'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fp_data_excel' AND column_name = 'updated_at') THEN 'MISSING: updated_at'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fp_data_excel' AND column_name = 'currency_code') THEN 'MISSING: currency_code'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fp_data_excel' AND column_name = 'exchange_rate_to_base') THEN 'MISSING: exchange_rate_to_base'
        ELSE 'OK: All required columns exist'
    END as status;

-- Check for missing required columns in hc_data_excel
SELECT 
    'hc_data_excel' as table_name,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hc_data_excel' AND column_name = 'division') THEN 'MISSING: division'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hc_data_excel' AND column_name = 'sourcesheet') THEN 'MISSING: sourcesheet'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hc_data_excel' AND column_name = 'uploaded_by') THEN 'MISSING: uploaded_by'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hc_data_excel' AND column_name = 'created_at') THEN 'MISSING: created_at'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hc_data_excel' AND column_name = 'updated_at') THEN 'MISSING: updated_at'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hc_data_excel' AND column_name = 'currency_code') THEN 'MISSING: currency_code'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hc_data_excel' AND column_name = 'exchange_rate_to_base') THEN 'MISSING: exchange_rate_to_base'
        ELSE 'OK: All required columns exist'
    END as status;

-- List all missing columns for both tables
WITH required_columns AS (
    SELECT unnest(ARRAY['division', 'sourcesheet', 'uploaded_by', 'created_at', 'updated_at', 'currency_code', 'exchange_rate_to_base']) AS col_name
),
fp_columns AS (
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'fp_data_excel'
),
hc_columns AS (
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'hc_data_excel'
)
SELECT 
    'fp_data_excel' as table_name,
    rc.col_name as missing_column
FROM required_columns rc
LEFT JOIN fp_columns fc ON rc.col_name = fc.column_name
WHERE fc.column_name IS NULL

UNION ALL

SELECT 
    'hc_data_excel' as table_name,
    rc.col_name as missing_column
FROM required_columns rc
LEFT JOIN hc_columns hc ON rc.col_name = hc.column_name
WHERE hc.column_name IS NULL;



