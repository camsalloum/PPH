-- ============================================================================
-- AEBF - Duplicate Records Cleanup Script
-- ============================================================================
-- Purpose: Remove duplicate records before adding unique constraint
-- Strategy: Keep the record with the highest ID (most recent), delete older ones
-- ============================================================================

BEGIN;

-- Show total duplicates before cleanup
SELECT COUNT(*) as total_duplicate_groups
FROM (
    SELECT division, year, month, type, customername, productgroup, material, values_type, COUNT(*) as cnt
    FROM public.fp_data_excel
    GROUP BY division, year, month, type, customername, productgroup, material, values_type
    HAVING COUNT(*) > 1
) duplicates;

-- Show records that will be affected
\echo ''
\echo 'Records to be cleaned (keeping newest, deleting older):'
SELECT 
    division, year, month, type, customername, productgroup, material, values_type,
    COUNT(*) as total_records,
    COUNT(*) - 1 as records_to_delete
FROM public.fp_data_excel
GROUP BY division, year, month, type, customername, productgroup, material, values_type
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 20;

-- Create backup of duplicate records before deletion
CREATE TABLE IF NOT EXISTS fp_data_excel_duplicates_backup AS
SELECT * FROM public.fp_data_excel
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY division, year, month, type, customername, productgroup, material, values_type
                   ORDER BY id DESC
               ) as rn
        FROM public.fp_data_excel
    ) ranked
    WHERE rn > 1
);

\echo ''
\echo 'Backup created: fp_data_excel_duplicates_backup'

SELECT COUNT(*) as backed_up_records FROM fp_data_excel_duplicates_backup;

-- Delete duplicates (keep only the record with highest ID = most recent)
DELETE FROM public.fp_data_excel
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY division, year, month, type, customername, productgroup, material, values_type
                   ORDER BY id DESC
               ) as rn
        FROM public.fp_data_excel
    ) ranked
    WHERE rn > 1
);

\echo ''
\echo 'Duplicates removed!'

-- Verify no duplicates remain
SELECT COUNT(*) as remaining_duplicate_groups
FROM (
    SELECT division, year, month, type, customername, productgroup, material, values_type, COUNT(*) as cnt
    FROM public.fp_data_excel
    GROUP BY division, year, month, type, customername, productgroup, material, values_type
    HAVING COUNT(*) > 1
) duplicates;

\echo ''
\echo '======================================================================'
\echo 'CLEANUP COMPLETED'
\echo '======================================================================'
\echo 'Duplicates removed and backed up to: fp_data_excel_duplicates_backup'
\echo 'You can restore them later if needed'
\echo ''
\echo 'Now ready to add unique constraint in Step 2'
\echo '======================================================================'

COMMIT;

-- Final verification
SELECT 
    COUNT(*) as total_records,
    COUNT(DISTINCT (division, year, month, type, customername, productgroup, material, values_type)) as unique_combinations
FROM public.fp_data_excel;
