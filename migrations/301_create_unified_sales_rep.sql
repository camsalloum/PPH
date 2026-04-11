-- ============================================================
-- MIGRATION 301: Create Unified Sales Rep Master Table
-- ============================================================
-- Purpose: Single source of truth for all sales rep data with groups
-- Created: January 1, 2026
-- ============================================================

-- Step 1: Create the unified sales rep table
CREATE TABLE IF NOT EXISTS fp_sales_rep_unified (
  sales_rep_id SERIAL PRIMARY KEY,
  sales_rep_code VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL,
  
  -- Grouping (linked to existing sales_rep_groups table)
  group_id INTEGER REFERENCES sales_rep_groups(id),
  group_name VARCHAR(200),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Aggregated metrics
  total_amount_all_time DECIMAL(18,2) DEFAULT 0,
  total_kgs_all_time DECIMAL(18,2) DEFAULT 0,
  total_morm_all_time DECIMAL(18,2) DEFAULT 0,
  customer_count INTEGER DEFAULT 0,
  country_count INTEGER DEFAULT 0,
  first_transaction_date DATE,
  last_transaction_date DATE,
  
  -- Contact info (can be linked to employees table later)
  email VARCHAR(200),
  phone VARCHAR(50),
  employee_id INTEGER,
  
  -- Administrative
  division VARCHAR(10) DEFAULT 'FP',
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_sr_unified_norm ON fp_sales_rep_unified(normalized_name);
CREATE INDEX IF NOT EXISTS idx_sr_unified_group ON fp_sales_rep_unified(group_id);
CREATE INDEX IF NOT EXISTS idx_sr_unified_active ON fp_sales_rep_unified(is_active);
CREATE INDEX IF NOT EXISTS idx_sr_unified_division ON fp_sales_rep_unified(division);

-- Step 3: Populate from fp_data_excel joined with sales_rep_group_members
INSERT INTO fp_sales_rep_unified (
  sales_rep_code,
  display_name,
  normalized_name,
  group_id,
  group_name,
  total_amount_all_time,
  total_kgs_all_time,
  total_morm_all_time,
  customer_count,
  country_count,
  first_transaction_date,
  last_transaction_date,
  division
)
SELECT 
  'FP-SR-' || LPAD(ROW_NUMBER() OVER (ORDER BY d.salesrepname)::TEXT, 3, '0') AS sales_rep_code,
  d.salesrepname AS display_name,
  UPPER(TRIM(d.salesrepname)) AS normalized_name,
  srg.id AS group_id,
  srg.group_name AS group_name,
  SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
  SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END) AS total_kgs,
  SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END) AS total_morm,
  COUNT(DISTINCT d.customername) AS customer_count,
  COUNT(DISTINCT d.countryname) AS country_count,
  MIN(MAKE_DATE(d.year, d.month, 1)) AS first_transaction_date,
  MAX(MAKE_DATE(d.year, d.month, 1)) AS last_transaction_date,
  'FP' AS division
FROM fp_data_excel d
LEFT JOIN sales_rep_group_members srgm 
  ON UPPER(TRIM(d.salesrepname)) = UPPER(TRIM(srgm.member_name))
LEFT JOIN sales_rep_groups srg 
  ON srgm.group_id = srg.id
GROUP BY d.salesrepname, srg.id, srg.group_name
ON CONFLICT (sales_rep_code) DO NOTHING;

-- Step 4: Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_sales_rep_unified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_rep_unified_updated ON fp_sales_rep_unified;
CREATE TRIGGER trg_sales_rep_unified_updated
  BEFORE UPDATE ON fp_sales_rep_unified
  FOR EACH ROW
  EXECUTE FUNCTION update_sales_rep_unified_timestamp();

-- Step 5: Output summary
DO $$
DECLARE
  total_count INTEGER;
  with_groups INTEGER;
  ungrouped INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM fp_sales_rep_unified;
  SELECT COUNT(*) INTO with_groups FROM fp_sales_rep_unified WHERE group_id IS NOT NULL;
  SELECT COUNT(*) INTO ungrouped FROM fp_sales_rep_unified WHERE group_id IS NULL;
  
  RAISE NOTICE '=== MIGRATION 301 COMPLETE ===';
  RAISE NOTICE 'Total sales reps created: %', total_count;
  RAISE NOTICE 'With group assignment: %', with_groups;
  RAISE NOTICE 'Without group (needs attention): %', ungrouped;
END $$;
