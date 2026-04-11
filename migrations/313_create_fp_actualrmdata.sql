-- Migration 313: Create fp_actualrmdata table
-- Raw material data from Oracle view HAP111.XL_FPRMAVERAGES_PMD_111
-- Synced via VPN → Oracle direct connection (same pattern as fp_raw_oracle for sales)

DROP TABLE IF EXISTS fp_actualrmdata;

CREATE TABLE fp_actualrmdata (
  id SERIAL PRIMARY KEY,

  -- Oracle View Columns (17 columns from HAP111.XL_FPRMAVERAGES_PMD_111)
  -- Note: The sync script auto-expands this table if Oracle adds more columns.
  -- Columns as of Feb 2026: DIVISION, ITEMGROUP, CATEGORY, CATLINEDESC, MAINITEM,
  -- MAINDESCRIPTION, MATERIAL, SIZES, STANDARDS, WEIGHTS, MAINUNIT, MAINCOST,
  -- MAINITEMSTOCK, PENDINGORDERQTY, PURCHASEPRICE, WAREHOUSE, REMARKS
  division TEXT,
  itemgroup TEXT,
  category TEXT,
  catlinedesc TEXT,
  mainitem TEXT,
  maindescription TEXT,
  material TEXT,
  sizes TEXT,
  standards TEXT,
  weights TEXT,
  mainunit TEXT,
  maincost NUMERIC,
  mainitemstock NUMERIC,
  pendingorderqty NUMERIC,
  purchaseprice NUMERIC,
  warehouse TEXT,
  remarks TEXT,

  -- Metadata
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_division ON fp_actualrmdata(division);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_itemgroup ON fp_actualrmdata(itemgroup);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_category ON fp_actualrmdata(category);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_warehouse ON fp_actualrmdata(warehouse);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_mainitem ON fp_actualrmdata(mainitem);
