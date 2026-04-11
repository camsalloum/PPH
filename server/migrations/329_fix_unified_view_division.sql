-- ============================================================
-- Migration 329: Fix Unified View Division Column for FP+BF
-- ============================================================
-- Date: January 22, 2026
-- Purpose: Update vw_unified_sales_data to expose admin_division_code as division
-- Issue: View currently exposes division_code (raw 'FP' or 'BF')
--        This causes dashboard queries with division='FP' to miss BF data (~6000 MT)
--        Should use admin_division_code which maps both FP and BF to 'FP'
-- Reference: Division Architecture in PROJECT_CONTEXT.md
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '=== Migration 329: Fixing vw_unified_sales_data division column ===';
  RAISE NOTICE 'Changing division column from division_code to admin_division_code';
  RAISE NOTICE 'This ensures FP dashboard includes both FP and BF data';
END $$;

-- Drop the view first (CASCADE to drop dependent views if any)
DROP VIEW IF EXISTS vw_unified_sales_data CASCADE;

-- Recreate the view with correct division column
CREATE OR REPLACE VIEW vw_unified_sales_data AS
SELECT 
  -- Source row reference
  d.id AS source_row_id,
  d.sync_source as sourcesheet,
  
  -- Period
  d.year,
  d.month_no as month,
  'ACTUAL' AS type,
  'ACTUAL' AS data_type,  -- For backward compatibility  
  'AMOUNT' AS values_type,  -- actualcommon stores disaggregated data
  d.amount AS values,
  
  -- CRITICAL FIX: Use admin_division_code instead of division_code
  -- This maps both Oracle 'FP' and 'BF' to admin 'FP' (Flexible Packaging Division)
  d.admin_division_code AS division,
  
  -- Also expose the raw division_code for debugging/reference
  d.division_code AS raw_division_code,
  
  d.year AS data_year,  -- For backward compatibility
  
  -- Customer (resolved)
  c.customer_id,
  c.customer_code,
  c.display_name AS customer_name,
  c.normalized_name AS customer_normalized,
  c.normalized_name AS customer_name_unified,  -- For backward compatibility
  c.is_merged,
  c.primary_country AS customer_country,
  -- Effective customer (if merged, use parent)
  CASE 
    WHEN c.is_merged AND cm.customer_id IS NOT NULL THEN cm.customer_id
    ELSE c.customer_id
  END AS effective_customer_id,
  CASE 
    WHEN c.is_merged AND cm.customer_id IS NOT NULL THEN cm.customer_code
    ELSE c.customer_code
  END AS effective_customer_code,
  CASE 
    WHEN c.is_merged AND cm.customer_id IS NOT NULL THEN cm.display_name
    ELSE c.display_name
  END AS effective_customer_name,
  
  -- Sales Rep (resolved)
  sr.sales_rep_id,
  sr.sales_rep_code,
  sr.display_name AS sales_rep_name,
  sr.normalized_name AS sales_rep_normalized,
  d.sales_rep_name AS salesrepname,  -- For backward compatibility (use original)
  sr.group_id AS sales_rep_group_id,
  sr.group_name AS sales_rep_group,
  d.sales_rep_group_name AS sales_rep_group_name,  -- For backward compatibility
  
  -- Product Group (resolved)
  pg.pg_id,
  pg.pg_code,
  pg.display_name AS product_group,
  d.pgcombine AS productgroup,  -- For backward compatibility (use original)
  pg.normalized_name AS product_group_normalized,
  pg.material,
  pg.process,
  pg.pg_combined,
  
  -- Geography (from raw data)
  d.country AS countryname

FROM fp_actualcommon d

-- Join to Customer Unified (use raw division_code for matching unified records)
LEFT JOIN fp_customer_unified c 
  ON UPPER(TRIM(d.customer_name)) = c.normalized_name
  AND c.division = d.division_code

-- If customer is merged, get the parent customer
LEFT JOIN fp_customer_unified cm 
  ON c.merged_into_id = cm.customer_id

-- Join to Sales Rep Unified (use raw division_code for matching)
LEFT JOIN fp_sales_rep_unified sr 
  ON UPPER(TRIM(d.sales_rep_name)) = sr.normalized_name
  AND sr.division = d.division_code

-- Join to Product Group Unified (use raw division_code for matching)
LEFT JOIN fp_product_group_unified pg 
  ON UPPER(TRIM(d.pgcombine)) = pg.normalized_name
  AND pg.division = d.division_code;

-- Verify the change
DO $$
DECLARE
  total_count INTEGER;
  fp_count INTEGER;
  bf_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM vw_unified_sales_data;
  SELECT COUNT(*) INTO fp_count FROM vw_unified_sales_data WHERE division = 'FP';
  SELECT COUNT(*) INTO bf_count FROM vw_unified_sales_data WHERE raw_division_code = 'BF';
  
  RAISE NOTICE '=== View Statistics ===';
  RAISE NOTICE 'Total rows: %', total_count;
  RAISE NOTICE 'Rows with division=FP: %', fp_count;
  RAISE NOTICE 'Rows with raw_division_code=BF: %', bf_count;
  RAISE NOTICE 'All rows should now have division=FP (includes both FP and BF data)';
  
  IF fp_count = total_count THEN
    RAISE NOTICE '✅ SUCCESS: All rows have division=FP as expected';
  ELSE
    RAISE WARNING '⚠️ WARNING: Not all rows have division=FP. Check admin_division_code in fp_actualcommon';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON VIEW vw_unified_sales_data IS 
'Unified sales data view - uses admin_division_code for division column.
This maps both Oracle FP and BF divisions to admin FP division.
Dashboard queries filtering by division=FP will include both FP and BF data.
Use raw_division_code column if you need the original Oracle division code.';
