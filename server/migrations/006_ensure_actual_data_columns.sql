-- ============================================================================
-- Migration: Ensure All Required Columns for Actual Data Upload
-- Date: 2025-12-XX
-- Description: Adds missing columns to fp_data_excel and hc_data_excel tables
--              Required for Excel upload functionality
-- ============================================================================

-- ============================================================================
-- FP Division Table (fp_data_excel)
-- ============================================================================

-- Add division column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'fp_data_excel' 
        AND column_name = 'division'
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD COLUMN division VARCHAR(10) NOT NULL DEFAULT 'FP';
        RAISE NOTICE 'Added division column to fp_data_excel';
    END IF;
END $$;

-- Add sourcesheet column if missing
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
        RAISE NOTICE 'Added sourcesheet column to fp_data_excel';
    END IF;
END $$;

-- Add uploaded_by column if missing
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
        RAISE NOTICE 'Added uploaded_by column to fp_data_excel';
    END IF;
END $$;

-- Add created_at column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'fp_data_excel' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to fp_data_excel';
    END IF;
END $$;

-- Add updated_at column if missing
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
        RAISE NOTICE 'Added updated_at column to fp_data_excel';
    END IF;
END $$;

-- Add currency_code column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'fp_data_excel' 
        AND column_name = 'currency_code'
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD COLUMN currency_code VARCHAR(3) DEFAULT 'AED';
        RAISE NOTICE 'Added currency_code column to fp_data_excel';
    END IF;
END $$;

-- Add exchange_rate_to_base column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'fp_data_excel' 
        AND column_name = 'exchange_rate_to_base'
    ) THEN
        ALTER TABLE public.fp_data_excel 
        ADD COLUMN exchange_rate_to_base DECIMAL(18,8) DEFAULT 1.0;
        RAISE NOTICE 'Added exchange_rate_to_base column to fp_data_excel';
    END IF;
END $$;

-- Update NULL values in currency columns
UPDATE public.fp_data_excel 
SET currency_code = COALESCE(currency_code, 'AED'),
    exchange_rate_to_base = COALESCE(exchange_rate_to_base, 1.0)
WHERE currency_code IS NULL OR exchange_rate_to_base IS NULL;

-- ============================================================================
-- HC Division Table (hc_data_excel)
-- ============================================================================

-- Create hc_data_excel table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.hc_data_excel (
    id BIGSERIAL PRIMARY KEY,
    sourcesheet TEXT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    type TEXT NOT NULL,
    salesrepname TEXT,
    customername TEXT,
    countryname TEXT,
    productgroup TEXT,
    material TEXT,
    process TEXT,
    values_type TEXT,
    values NUMERIC,
    updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add division column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'hc_data_excel' 
        AND column_name = 'division'
    ) THEN
        ALTER TABLE public.hc_data_excel 
        ADD COLUMN division VARCHAR(10) NOT NULL DEFAULT 'HC';
        RAISE NOTICE 'Added division column to hc_data_excel';
    END IF;
END $$;

-- Add sourcesheet column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'hc_data_excel' 
        AND column_name = 'sourcesheet'
    ) THEN
        ALTER TABLE public.hc_data_excel 
        ADD COLUMN sourcesheet VARCHAR(255);
        RAISE NOTICE 'Added sourcesheet column to hc_data_excel';
    END IF;
END $$;

-- Add uploaded_by column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'hc_data_excel' 
        AND column_name = 'uploaded_by'
    ) THEN
        ALTER TABLE public.hc_data_excel 
        ADD COLUMN uploaded_by VARCHAR(255);
        RAISE NOTICE 'Added uploaded_by column to hc_data_excel';
    END IF;
END $$;

-- Add created_at column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'hc_data_excel' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.hc_data_excel 
        ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to hc_data_excel';
    END IF;
END $$;

-- Add updated_at column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'hc_data_excel' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.hc_data_excel 
        ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to hc_data_excel';
    END IF;
END $$;

-- Add currency_code column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'hc_data_excel' 
        AND column_name = 'currency_code'
    ) THEN
        ALTER TABLE public.hc_data_excel 
        ADD COLUMN currency_code VARCHAR(3) DEFAULT 'AED';
        RAISE NOTICE 'Added currency_code column to hc_data_excel';
    END IF;
END $$;

-- Add exchange_rate_to_base column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'hc_data_excel' 
        AND column_name = 'exchange_rate_to_base'
    ) THEN
        ALTER TABLE public.hc_data_excel 
        ADD COLUMN exchange_rate_to_base DECIMAL(18,8) DEFAULT 1.0;
        RAISE NOTICE 'Added exchange_rate_to_base column to hc_data_excel';
    END IF;
END $$;

-- Update NULL values in currency columns
UPDATE public.hc_data_excel 
SET currency_code = COALESCE(currency_code, 'AED'),
    exchange_rate_to_base = COALESCE(exchange_rate_to_base, 1.0)
WHERE currency_code IS NULL OR exchange_rate_to_base IS NULL;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
    fp_columns TEXT;
    hc_columns TEXT;
BEGIN
    -- Get FP table columns
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    INTO fp_columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fp_data_excel';
    
    -- Get HC table columns
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    INTO hc_columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hc_data_excel';
    
    RAISE NOTICE 'fp_data_excel columns: %', fp_columns;
    RAISE NOTICE 'hc_data_excel columns: %', hc_columns;
    RAISE NOTICE 'Migration completed successfully!';
END $$;

COMMENT ON COLUMN public.fp_data_excel.division IS 'Division code (FP, HC, etc.)';
COMMENT ON COLUMN public.fp_data_excel.sourcesheet IS 'Source Excel file name';
COMMENT ON COLUMN public.fp_data_excel.uploaded_by IS 'User who uploaded the data';
COMMENT ON COLUMN public.fp_data_excel.currency_code IS 'Currency code of the values (AED, USD, etc.)';
COMMENT ON COLUMN public.fp_data_excel.exchange_rate_to_base IS 'Exchange rate to base currency';

COMMENT ON COLUMN public.hc_data_excel.division IS 'Division code (FP, HC, etc.)';
COMMENT ON COLUMN public.hc_data_excel.sourcesheet IS 'Source Excel file name';
COMMENT ON COLUMN public.hc_data_excel.uploaded_by IS 'User who uploaded the data';
COMMENT ON COLUMN public.hc_data_excel.currency_code IS 'Currency code of the values (AED, USD, etc.)';
COMMENT ON COLUMN public.hc_data_excel.exchange_rate_to_base IS 'Exchange rate to base currency';

