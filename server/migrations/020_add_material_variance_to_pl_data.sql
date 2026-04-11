-- Migration: Add Material Variance Percentage to P&L Tables
-- Description: Persists the material variance % adjustment for Budget and Forecast data
-- Date: 2026-01-14
-- 
-- This allows the variance adjustment to be saved and restored on page refresh
-- The variance is applied to Material calculation: Material = (Sales - MoRM) × (1 + variance%/100)
--
-- NOTE: Division tables are dynamically named based on division_code from company_divisions.
-- Currently only FP (Flexible Packaging) division exists. When new divisions are added,
-- create corresponding {division_code}_pl_data tables and run this migration pattern.

-- =====================================================
-- FP Division P&L Table - Add material_variance_pct
-- (FP = Flexible Packaging - currently the only active division)
-- =====================================================
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fp_pl_data') THEN
        ALTER TABLE fp_pl_data ADD COLUMN IF NOT EXISTS material_variance_pct DECIMAL(10,4) DEFAULT 0;
        RAISE NOTICE 'Added material_variance_pct to fp_pl_data';
    END IF;
END $$;

-- =====================================================
-- Create index for performance
-- =====================================================
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fp_pl_data') THEN
        CREATE INDEX IF NOT EXISTS idx_fp_pl_data_variance ON fp_pl_data(year, data_type) WHERE material_variance_pct != 0;
    END IF;
END $$;

-- =====================================================
-- TEMPLATE: For future divisions, add similar blocks:
-- =====================================================
-- DO $$ 
-- BEGIN
--     IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{division_code}_pl_data') THEN
--         ALTER TABLE {division_code}_pl_data ADD COLUMN IF NOT EXISTS material_variance_pct DECIMAL(10,4) DEFAULT 0;
--     END IF;
-- END $$;

-- Log the migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 020: Added material_variance_pct column to FP P&L data table';
END $$;
