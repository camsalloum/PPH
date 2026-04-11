-- Migration 323: Add admin_division_code to fp_budget_unified
-- Purpose: Denormalize admin division mapping into budget tables for consistency

-- Add column to fp_budget_unified
ALTER TABLE IF EXISTS fp_budget_unified ADD COLUMN IF NOT EXISTS admin_division_code VARCHAR(20);

-- Create index
CREATE INDEX IF NOT EXISTS idx_fp_budget_unified_admin_division 
  ON fp_budget_unified(admin_division_code);

-- Populate the column based on company_divisions mapping
UPDATE fp_budget_unified b
SET admin_division_code = cd.division_code
FROM company_divisions cd
WHERE b.division_code = ANY(cd.mapped_oracle_codes)
AND b.admin_division_code IS NULL;

-- Add comment
COMMENT ON COLUMN fp_budget_unified.admin_division_code IS
  'Admin division code that this budget belongs to. Denormalized from company_divisions.mapped_oracle_codes mapping.';
