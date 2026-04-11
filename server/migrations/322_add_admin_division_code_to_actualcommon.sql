-- Migration 322: Add admin_division_code to fp_actualcommon
-- Purpose: Denormalize admin division mapping into actualcommon for simpler queries
-- This eliminates the need to query company_divisions and use array filtering at query time

-- Add column to store the admin division code
ALTER TABLE fp_actualcommon ADD COLUMN IF NOT EXISTS admin_division_code VARCHAR(20);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_fp_actualcommon_admin_division 
  ON fp_actualcommon(admin_division_code);

-- Populate the column based on company_divisions mapping
-- This maps Oracle division codes (FP, BF, etc.) to admin division codes (FP, HC, etc.)
UPDATE fp_actualcommon a
SET admin_division_code = cd.division_code
FROM company_divisions cd
WHERE a.division_code = ANY(cd.mapped_oracle_codes)
AND a.admin_division_code IS NULL;

-- Add comment
COMMENT ON COLUMN fp_actualcommon.admin_division_code IS
  'Admin division code that this row belongs to. Denormalized from company_divisions.mapped_oracle_codes mapping. Enables simpler WHERE clauses without array filtering.';

-- Verify the update worked
-- SELECT COUNT(*) as total_rows FROM fp_actualcommon;
-- SELECT COUNT(*) as rows_with_admin_division FROM fp_actualcommon WHERE admin_division_code IS NOT NULL;
-- SELECT DISTINCT division_code, admin_division_code FROM fp_actualcommon ORDER BY 1;
