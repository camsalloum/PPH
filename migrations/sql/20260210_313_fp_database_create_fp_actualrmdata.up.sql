-- MIGRATION: 20260210_313_fp_database_create_fp_actualrmdata
-- TARGET: fp_database
-- ROLLBACK: SAFE
-- DATA LOSS: NO
-- DESCRIPTION: Creates fp_actualrmdata table for raw material data from Oracle

CREATE TABLE IF NOT EXISTS fp_actualrmdata (
  id SERIAL PRIMARY KEY,
  division TEXT,
  itemgroup TEXT,
  category TEXT,
  catlinedesc TEXT,
  mainitem TEXT,
  maindescription TEXT,
  mainunit TEXT,
  maincost NUMERIC,
  mainitemstock NUMERIC,
  pendingorderqty NUMERIC,
  purchaseprice NUMERIC,
  warehouse TEXT,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_division ON fp_actualrmdata(division);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_itemgroup ON fp_actualrmdata(itemgroup);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_category ON fp_actualrmdata(category);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_warehouse ON fp_actualrmdata(warehouse);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_mainitem ON fp_actualrmdata(mainitem);
