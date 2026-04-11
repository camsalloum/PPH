-- Add material and process columns to all division material_percentages tables
-- Run this migration script to update existing tables

-- FP Division
ALTER TABLE fp_material_percentages 
ADD COLUMN IF NOT EXISTS material VARCHAR(255) DEFAULT '',
ADD COLUMN IF NOT EXISTS process VARCHAR(255) DEFAULT '';

-- SB Division
ALTER TABLE sb_material_percentages 
ADD COLUMN IF NOT EXISTS material VARCHAR(255) DEFAULT '',
ADD COLUMN IF NOT EXISTS process VARCHAR(255) DEFAULT '';

-- TF Division
ALTER TABLE tf_material_percentages 
ADD COLUMN IF NOT EXISTS material VARCHAR(255) DEFAULT '',
ADD COLUMN IF NOT EXISTS process VARCHAR(255) DEFAULT '';

-- HCM Division
ALTER TABLE hcm_material_percentages 
ADD COLUMN IF NOT EXISTS material VARCHAR(255) DEFAULT '',
ADD COLUMN IF NOT EXISTS process VARCHAR(255) DEFAULT '';

-- Verify columns were added
SELECT 
  'fp_material_percentages' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'fp_material_percentages'
  AND column_name IN ('material', 'process')
UNION ALL
SELECT 
  'sb_material_percentages' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'sb_material_percentages'
  AND column_name IN ('material', 'process')
UNION ALL
SELECT 
  'tf_material_percentages' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'tf_material_percentages'
  AND column_name IN ('material', 'process')
UNION ALL
SELECT 
  'hcm_material_percentages' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'hcm_material_percentages'
  AND column_name IN ('material', 'process');

