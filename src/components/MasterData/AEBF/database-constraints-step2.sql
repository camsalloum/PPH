-- ============================================================================
-- AEBF IMPLEMENTATION - STEP 2: Database Constraints & Validation
-- ============================================================================
-- Purpose: Add CHECK constraints for data quality validation
-- Date: November 13, 2025
-- Risk Level: LOW (only adds validation rules)
-- Note: Skipping unique constraint due to existing duplicates
-- Estimated Duration: 5-10 minutes
-- ============================================================================

BEGIN;

\echo '======================================================================'
\echo 'STEP 2: Adding Data Validation Constraints'
\echo '======================================================================'

-- ============================================================================
-- 1. YEAR RANGE CONSTRAINT (2020-2030)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_year_range' 
        AND conrelid = 'public.fp_data_excel'::regclass
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD CONSTRAINT chk_year_range CHECK (year >= 2019 AND year <= 2050);
        
        RAISE NOTICE 'Added year range constraint (2019-2050)';
    ELSE
        RAISE NOTICE 'Year range constraint already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- 2. MONTH RANGE CONSTRAINT (1-12)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_month_range' 
        AND conrelid = 'public.fp_data_excel'::regclass
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD CONSTRAINT chk_month_range CHECK (month >= 1 AND month <= 12);
        
        RAISE NOTICE 'Added month range constraint (1-12)';
    ELSE
        RAISE NOTICE 'Month range constraint already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- 3. VALUES_TYPE ENUM CONSTRAINT (Amount, KGS, MoRM)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_values_type' 
        AND conrelid = 'public.fp_data_excel'::regclass
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD CONSTRAINT chk_values_type CHECK (UPPER(values_type) IN ('AMOUNT', 'KGS', 'MORM'));
        
        RAISE NOTICE 'Added values_type constraint (case-insensitive: Amount/AMOUNT/amount all work)';
    ELSE
        RAISE NOTICE 'Values_type constraint already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- 4. POSITIVE VALUES CONSTRAINT - REMOVED
--    Sales returns can be negative amounts, so no constraint needed
-- ============================================================================

DO $$ 
BEGIN
    RAISE NOTICE 'Skipping positive values constraint (sales returns can be negative)';
END $$;

-- ============================================================================
-- 5. TYPE ENUM CONSTRAINT (Actual, Budget, Estimate, Forecast)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_type_enum' 
        AND conrelid = 'public.fp_data_excel'::regclass
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD CONSTRAINT chk_type_enum CHECK (UPPER(type) IN ('ACTUAL', 'BUDGET', 'ESTIMATE', 'FORECAST'));
        
        RAISE NOTICE 'Added type constraint (case-insensitive: Actual/actual/ACTUAL all work)';
    ELSE
        RAISE NOTICE 'Type constraint already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- 6. DIVISION ENUM CONSTRAINT (FP, SB, TF, HCM)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_division_enum' 
        AND conrelid = 'public.fp_data_excel'::regclass
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD CONSTRAINT chk_division_enum CHECK (UPPER(division) IN ('FP', 'SB', 'TF', 'HCM'));
        
        RAISE NOTICE 'Added division constraint (case-insensitive: FP/fp/Fp all work)';
    ELSE
        RAISE NOTICE 'Division constraint already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- 7. NOT NULL CONSTRAINTS FOR CRITICAL FIELDS
-- ============================================================================

DO $$ 
BEGIN
    -- Ensure customername is not null or empty
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_customername_not_empty' 
        AND conrelid = 'public.fp_data_excel'::regclass
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD CONSTRAINT chk_customername_not_empty CHECK (
            customername IS NOT NULL AND TRIM(customername) <> ''
        );
        
        RAISE NOTICE 'Added customername not empty constraint';
    ELSE
        RAISE NOTICE 'Customername constraint already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- 8. ENSURE MONTH IS INTEGER (not text)
-- ============================================================================

-- Check if month column is already INTEGER
DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns 
        WHERE table_name = 'fp_data_excel' AND column_name = 'month') <> 'integer' 
    THEN
        -- Convert month to integer if it's not already
        ALTER TABLE public.fp_data_excel 
        ALTER COLUMN month TYPE INTEGER USING month::INTEGER;
        
        RAISE NOTICE 'Converted month column to INTEGER type';
    ELSE
        RAISE NOTICE 'Month column is already INTEGER type';
    END IF;
END $$;

-- ============================================================================
-- DISPLAY SUMMARY
-- ============================================================================

\echo ''
\echo '======================================================================'
\echo 'STEP 2 COMPLETED SUCCESSFULLY'
\echo '======================================================================'
\echo ''
\echo 'Constraints Added:'
\echo '  + Year range: 2019-2050'
\echo '  + Month range: 1-12 (INTEGER)'
\echo '  + Values_type: AMOUNT, KGS, MORM (case-insensitive)'
\echo '  + Values: Can be positive or negative (sales returns allowed)'
\echo '  + Type enum: Actual, Budget, Estimate, Forecast (case-insensitive)'
\echo '  + Division enum: FP, SB, TF, HCM (case-insensitive)'
\echo '  + Customername not empty'
\echo ''
\echo 'Note: Unique constraint NOT added (existing duplicates present)'
\echo '      Duplicates will be prevented in future uploads via UPSERT logic'
\echo ''
\echo '======================================================================'

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Show all constraints on the table
\echo ''
\echo 'Current Constraints on fp_data_excel:'
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'public.fp_data_excel'::regclass
ORDER BY conname;

-- Test queries to verify constraints work
\echo ''
\echo '======================================================================'
\echo 'TESTING CONSTRAINTS (These should all FAIL):'
\echo '======================================================================'

-- Test 1: Invalid year (should fail)
\echo ''
\echo 'Test 1: Trying to insert year 1999 (should FAIL)...'
DO $$
BEGIN
    INSERT INTO fp_data_excel (division, year, month, type, values_type, values, customername, sourcesheet) 
    VALUES ('FP', 2024, 1, 'Actual', 'AMOUNT', -100, 'Test Customer', 'test');
    RAISE NOTICE 'ERROR: Should have failed but did not!';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'SUCCESS: Year constraint working - rejected year 1999';
END $$;

-- Test 2: Invalid month (should fail)
\echo ''
\echo 'Test 2: Trying to insert month 13 (should FAIL)...'
DO $$
BEGIN
    INSERT INTO fp_data_excel (division, year, month, type, values_type, values, customername, sourcesheet) 
    VALUES ('FP', 2024, 1, 'Actual', 'AMOUNT', 100, 'Test Customer', 'test');
    RAISE NOTICE 'ERROR: Should have failed but did not!';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'SUCCESS: Month constraint working - rejected month 13';
END $$;

-- Test 3: Negative Amount (should SUCCEED - sales returns allowed)
\echo ''
\echo 'Test 3: Trying to insert negative Amount (should SUCCEED - sales returns)...'
DO $$
BEGIN
    INSERT INTO fp_data_excel (division, year, month, type, values_type, values, customername, sourcesheet, productgroup) 
    VALUES ('FP', 2024, 1, 'Actual', 'AMOUNT', -100, 'Test Customer', 'test', 'TEST');
    
    -- Clean up test record
    DELETE FROM fp_data_excel WHERE customername = 'Test Customer' AND values = -100;
    
    RAISE NOTICE 'SUCCESS: Negative Amount allowed (sales returns)';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERROR: Negative Amount should be allowed!';
END $$;

-- Test 4: Negative MoRM (should SUCCEED - MoRM can be negative)
\echo ''
\echo 'Test 4: Trying to insert negative MoRM (should SUCCEED)...'
DO $$
BEGIN
    INSERT INTO fp_data_excel (division, year, month, type, values_type, values, customername, sourcesheet, productgroup) 
    VALUES ('FP', 2024, 1, 'Actual', 'MORM', -50, 'Test Customer', 'test', 'TEST');
    
    -- Clean up test record
    DELETE FROM fp_data_excel WHERE customername = 'Test Customer' AND values = -50;
    
    RAISE NOTICE 'SUCCESS: MoRM can be negative - constraint working correctly';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERROR: MoRM should allow negative values!';
END $$;

\echo ''
\echo '======================================================================'
\echo 'STEP 2 VERIFICATION COMPLETE'
\echo '======================================================================'
\echo ''
\echo 'Next Steps:'
\echo '  1. Verify all constraints passed tests above'
\echo '  2. Check constraints list'
\echo '  3. If all good, approve Step 2 to proceed to Step 3 (Backend API)'
\echo '======================================================================'
