-- Migration: 330_add_data_source_to_budget_unified.sql
-- Date: 2026-01-20
-- Purpose: Add data_source column to distinguish between Bulk Import and Sales Rep Import
--
-- This supports the workflow where:
-- - BULK_IMPORT = Management Allocation (Bulk Import before sales rep fills customers)
-- - SALES_REP_IMPORT = Final budget submitted by sales rep with customer details
--
-- The "Group Submitted" metric should ONLY count BULK_IMPORT data
-- When a sales rep imports their final budget, it replaces their BULK_IMPORT data

-- ============================================================================
-- FP Division
-- ============================================================================
ALTER TABLE fp_budget_unified 
ADD COLUMN IF NOT EXISTS data_source VARCHAR(50) DEFAULT 'SALES_REP_IMPORT';

COMMENT ON COLUMN fp_budget_unified.data_source IS 
'Source of the budget data: BULK_IMPORT (management allocation) or SALES_REP_IMPORT (final budget with customers)';

-- Update existing records based on created_by
UPDATE fp_budget_unified 
SET data_source = 'BULK_IMPORT' 
WHERE created_by = 'bulk_finalize' AND data_source IS NULL;

UPDATE fp_budget_unified 
SET data_source = 'SALES_REP_IMPORT' 
WHERE created_by = 'system' AND data_source IS NULL;

UPDATE fp_budget_unified 
SET data_source = 'SALES_REP_IMPORT' 
WHERE data_source IS NULL;

-- Create index for fast filtering
CREATE INDEX IF NOT EXISTS idx_fp_budget_unified_data_source 
ON fp_budget_unified(data_source);

CREATE INDEX IF NOT EXISTS idx_fp_budget_unified_data_source_type 
ON fp_budget_unified(data_source, budget_type);

-- ============================================================================
-- HC Division (if exists)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hc_budget_unified') THEN
    ALTER TABLE hc_budget_unified 
    ADD COLUMN IF NOT EXISTS data_source VARCHAR(50) DEFAULT 'SALES_REP_IMPORT';
    
    UPDATE hc_budget_unified 
    SET data_source = 'BULK_IMPORT' 
    WHERE created_by = 'bulk_finalize' AND data_source IS NULL;
    
    UPDATE hc_budget_unified 
    SET data_source = 'SALES_REP_IMPORT' 
    WHERE data_source IS NULL;
    
    CREATE INDEX IF NOT EXISTS idx_hc_budget_unified_data_source 
    ON hc_budget_unified(data_source);
  END IF;
END $$;

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  bulk_count INTEGER;
  salesrep_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bulk_count FROM fp_budget_unified WHERE data_source = 'BULK_IMPORT';
  SELECT COUNT(*) INTO salesrep_count FROM fp_budget_unified WHERE data_source = 'SALES_REP_IMPORT';
  
  RAISE NOTICE 'Migration 330 complete:';
  RAISE NOTICE '  BULK_IMPORT records: %', bulk_count;
  RAISE NOTICE '  SALES_REP_IMPORT records: %', salesrep_count;
END $$;
