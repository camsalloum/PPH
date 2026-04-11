-- ============================================================
-- MIGRATION 302: Create Unified Product Group Master Table
-- ============================================================
-- Purpose: Single source of truth for product groups with material/process
-- Created: January 1, 2026
-- ============================================================

-- Step 1: Create the unified product group table
CREATE TABLE IF NOT EXISTS fp_product_group_unified (
  pg_id SERIAL PRIMARY KEY,
  pg_code VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL,
  
  -- Material/Process from fp_material_percentages
  material VARCHAR(50),        -- PE, Non PE, Others
  process VARCHAR(50),         -- Plain, Printed, Others
  pg_combined VARCHAR(100),    -- "PE Printed", "Non PE Plain", etc.
  
  -- Raw product group names that map to this standard group
  raw_names TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Pricing (can be linked to fp_product_group_pricing)
  default_selling_price DECIMAL(18,4),
  default_morm DECIMAL(18,4),
  
  -- Aggregated metrics
  total_amount_all_time DECIMAL(18,2) DEFAULT 0,
  total_kgs_all_time DECIMAL(18,2) DEFAULT 0,
  total_morm_all_time DECIMAL(18,2) DEFAULT 0,
  
  -- Administrative
  division VARCHAR(10) DEFAULT 'FP',
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_pg_unified_norm ON fp_product_group_unified(normalized_name);
CREATE INDEX IF NOT EXISTS idx_pg_unified_combined ON fp_product_group_unified(pg_combined);
CREATE INDEX IF NOT EXISTS idx_pg_unified_material ON fp_product_group_unified(material);
CREATE INDEX IF NOT EXISTS idx_pg_unified_process ON fp_product_group_unified(process);
CREATE INDEX IF NOT EXISTS idx_pg_unified_active ON fp_product_group_unified(is_active);

-- Step 3: Populate from fp_material_percentages (13 standard groups)
INSERT INTO fp_product_group_unified (
  pg_code,
  display_name,
  normalized_name,
  material,
  process,
  pg_combined,
  raw_names,
  sort_order,
  division
)
SELECT 
  'FP-PG-' || LPAD(ROW_NUMBER() OVER (ORDER BY mp.product_group)::TEXT, 2, '0') AS pg_code,
  mp.product_group AS display_name,
  UPPER(TRIM(mp.product_group)) AS normalized_name,
  mp.material,
  mp.process,
  mp.material || ' ' || mp.process AS pg_combined,
  ARRAY[mp.product_group] AS raw_names,
  ROW_NUMBER() OVER (ORDER BY mp.product_group) AS sort_order,
  'FP' AS division
FROM fp_material_percentages mp
ON CONFLICT (pg_code) DO NOTHING;

-- Step 4: Update aggregations from fp_data_excel
UPDATE fp_product_group_unified pg
SET 
  total_amount_all_time = agg.total_amount,
  total_kgs_all_time = agg.total_kgs,
  total_morm_all_time = agg.total_morm,
  raw_names = ARRAY_APPEND(raw_names, agg.raw_name)
FROM (
  SELECT 
    UPPER(TRIM(d.productgroup)) AS norm_pg,
    d.productgroup AS raw_name,
    SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END) AS total_amount,
    SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END) AS total_kgs,
    SUM(CASE WHEN d.values_type = 'MORM' THEN d.values ELSE 0 END) AS total_morm
  FROM fp_data_excel d
  GROUP BY UPPER(TRIM(d.productgroup)), d.productgroup
) agg
WHERE pg.normalized_name = agg.norm_pg;

-- Step 5: Add unmapped "Raw Materials" if it exists in data but not in material_percentages
INSERT INTO fp_product_group_unified (
  pg_code,
  display_name,
  normalized_name,
  material,
  process,
  pg_combined,
  raw_names,
  total_amount_all_time,
  total_kgs_all_time,
  total_morm_all_time,
  sort_order,
  division
)
SELECT 
  'FP-PG-99',
  'Raw Materials',
  'RAW MATERIALS',
  'Others',
  'Others',
  'Others Others',
  ARRAY['Raw Materials', 'raw materials'],
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END),
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END),
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END),
  99,
  'FP'
FROM fp_data_excel
WHERE UPPER(TRIM(productgroup)) = 'RAW MATERIALS'
ON CONFLICT (pg_code) DO NOTHING;

-- Step 6: Deduplicate raw_names arrays
UPDATE fp_product_group_unified
SET raw_names = (
  SELECT ARRAY_AGG(DISTINCT elem)
  FROM UNNEST(raw_names) AS elem
);

-- Step 7: Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_product_group_unified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pg_unified_updated ON fp_product_group_unified;
CREATE TRIGGER trg_pg_unified_updated
  BEFORE UPDATE ON fp_product_group_unified
  FOR EACH ROW
  EXECUTE FUNCTION update_product_group_unified_timestamp();

-- Step 8: Output summary
DO $$
DECLARE
  total_count INTEGER;
  pe_count INTEGER;
  non_pe_count INTEGER;
  others_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM fp_product_group_unified;
  SELECT COUNT(*) INTO pe_count FROM fp_product_group_unified WHERE material = 'PE';
  SELECT COUNT(*) INTO non_pe_count FROM fp_product_group_unified WHERE material = 'Non PE';
  SELECT COUNT(*) INTO others_count FROM fp_product_group_unified WHERE material = 'Others';
  
  RAISE NOTICE '=== MIGRATION 302 COMPLETE ===';
  RAISE NOTICE 'Total product groups created: %', total_count;
  RAISE NOTICE 'PE groups: %', pe_count;
  RAISE NOTICE 'Non PE groups: %', non_pe_count;
  RAISE NOTICE 'Others groups: %', others_count;
END $$;
