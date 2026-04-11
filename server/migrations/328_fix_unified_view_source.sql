-- ============================================================
-- Migration 328: Fix Unified View to Use Current Source Tables
-- ============================================================
-- Date: January 16, 2026
-- Purpose: Update vw_unified_sales_data to query fp_actualcommon instead of deprecated fp_data_excel
-- Issue: View is currently querying old fp_data_excel table (26K records with ghost customers)
--        Should query fp_actualcommon (current source of truth)
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '=== Migration 328: Fixing vw_unified_sales_data source ===';
  RAISE NOTICE 'Updating view to use fp_actualcommon instead of fp_data_excel';
END $$;

-- Drop the view first (CASCADE to drop dependent materialized views too)
DROP VIEW IF EXISTS vw_unified_sales_data CASCADE;

-- Recreate the view with correct source table
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
  d.division_code AS division,
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

-- Join to Customer Unified
LEFT JOIN fp_customer_unified c 
  ON UPPER(TRIM(d.customer_name)) = c.normalized_name
  AND c.division = d.division_code

-- If customer is merged, get the parent customer
LEFT JOIN fp_customer_unified cm 
  ON c.merged_into_id = cm.customer_id

-- Join to Sales Rep Unified
LEFT JOIN fp_sales_rep_unified sr 
  ON UPPER(TRIM(d.sales_rep_name)) = sr.normalized_name
  AND sr.division = d.division_code

-- Join to Product Group Unified
LEFT JOIN fp_product_group_unified pg 
  ON UPPER(TRIM(d.pgcombine)) = pg.normalized_name
  AND pg.division = d.division_code;

-- Verification
DO $$
DECLARE
  v_view_rows INTEGER;
  v_actualcommon_rows INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_view_rows FROM vw_unified_sales_data;
  SELECT COUNT(*) INTO v_actualcommon_rows FROM fp_actualcommon;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ View updated successfully!';
  RAISE NOTICE '📊 View rows: %', v_view_rows;
  RAISE NOTICE '📊 Source (fp_actualcommon) rows: %', v_actualcommon_rows;
  
  IF v_view_rows = 0 THEN
    RAISE WARNING 'View returned 0 rows! Check column name mappings.';
  ELSE
    RAISE NOTICE '🎉 View is working correctly!';
  END IF;
END $$;
