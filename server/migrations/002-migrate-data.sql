-- Migration: Migrate existing data to unified master table
-- Date: 2026-01-09
-- Purpose: Copy data from fp_material_percentages and fp_product_group_pricing_rounding

-- Step 1: Migrate material percentages
INSERT INTO fp_product_group_master 
  (product_group, pe_percentage, bopp_percentage, pet_percentage, 
   alu_percentage, paper_percentage, pvc_pet_percentage, mix_percentage,
   material, process, created_at, updated_at)
SELECT 
  product_group, 
  COALESCE(pe_percentage, 0),
  COALESCE(bopp_percentage, 0),
  COALESCE(pet_percentage, 0),
  COALESCE(alu_percentage, 0),
  COALESCE(paper_percentage, 0),
  COALESCE(pvc_pet_percentage, 0),
  COALESCE(mix_percentage, 0),
  material,
  process,
  created_at,
  updated_at
FROM fp_material_percentages
ON CONFLICT (product_group) DO UPDATE SET
  pe_percentage = EXCLUDED.pe_percentage,
  bopp_percentage = EXCLUDED.bopp_percentage,
  pet_percentage = EXCLUDED.pet_percentage,
  alu_percentage = EXCLUDED.alu_percentage,
  paper_percentage = EXCLUDED.paper_percentage,
  pvc_pet_percentage = EXCLUDED.pvc_pet_percentage,
  mix_percentage = EXCLUDED.mix_percentage,
  material = EXCLUDED.material,
  process = EXCLUDED.process;

-- Step 2: Migrate rounded pricing (latest year only per product group)
UPDATE fp_product_group_master m
SET 
  asp_round = r.asp_round,
  morm_round = r.morm_round,
  rm_round = r.rm_round
FROM (
  SELECT DISTINCT ON (product_group) 
    product_group,
    asp_round,
    morm_round,
    rm_round,
    year
  FROM fp_product_group_pricing_rounding
  WHERE division = 'FP' OR division = 'fp'
  ORDER BY product_group, year DESC
) r
WHERE m.product_group = r.product_group;

-- Step 3: Calculate and cache actual pricing from fp_actualcommon (current year)
UPDATE fp_product_group_master m
SET 
  asp_actual = CASE WHEN p.total_kgs > 0 THEN ROUND((p.total_amount / p.total_kgs)::numeric, 4) ELSE 0 END,
  morm_actual = CASE WHEN p.total_kgs > 0 THEN ROUND((p.total_morm / p.total_kgs)::numeric, 4) ELSE 0 END,
  rm_actual = CASE WHEN p.total_kgs > 0 THEN ROUND(((p.total_amount - p.total_morm) / p.total_kgs)::numeric, 4) ELSE 0 END,
  actual_last_calculated_at = CURRENT_TIMESTAMP,
  actual_year = p.year
FROM (
  SELECT 
    INITCAP(LOWER(TRIM(pgcombine))) as product_group,
    SUM(qty_kgs) as total_kgs,
    SUM(amount) as total_amount,
    SUM(morm) as total_morm,
    (SELECT MAX(year) FROM fp_actualcommon) as year
  FROM fp_actualcommon
  WHERE year = (SELECT MAX(year) FROM fp_actualcommon)
    AND pgcombine IS NOT NULL 
    AND TRIM(pgcombine) != ''
  GROUP BY pgcombine
) p
WHERE m.product_group = p.product_group;

-- Step 4: Create backups
CREATE TABLE IF NOT EXISTS fp_material_percentages_backup AS 
SELECT * FROM fp_material_percentages;

CREATE TABLE IF NOT EXISTS fp_product_group_pricing_rounding_backup AS 
SELECT * FROM fp_product_group_pricing_rounding;

-- Step 5: Verify counts
SELECT 
  (SELECT COUNT(*) FROM fp_product_group_master) as master_count,
  (SELECT COUNT(*) FROM fp_material_percentages) as material_count,
  (SELECT COUNT(DISTINCT product_group) FROM fp_product_group_pricing_rounding) as pricing_count;
