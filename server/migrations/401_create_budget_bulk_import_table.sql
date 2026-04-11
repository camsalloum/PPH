-- Migration: 401_create_budget_bulk_import_table
-- Purpose: Create table for bulk budget import batches
-- Date: 2026-01-17

-- Create fp_budget_bulk_import table for FP division
-- Column names MUST match the INSERT statements in server/routes/aebf/bulk.js
CREATE TABLE IF NOT EXISTS fp_budget_bulk_import (
  id SERIAL PRIMARY KEY,
  batch_id VARCHAR(100) NOT NULL,
  division VARCHAR(50) NOT NULL DEFAULT 'FP',
  budget_year INTEGER NOT NULL,
  sales_rep VARCHAR(255),
  customer VARCHAR(255),
  country VARCHAR(100),
  product_group VARCHAR(255),
  material VARCHAR(255),
  process VARCHAR(255),

  -- Monthly values (month_1 through month_12)
  month_1 NUMERIC(15,2) DEFAULT 0,
  month_2 NUMERIC(15,2) DEFAULT 0,
  month_3 NUMERIC(15,2) DEFAULT 0,
  month_4 NUMERIC(15,2) DEFAULT 0,
  month_5 NUMERIC(15,2) DEFAULT 0,
  month_6 NUMERIC(15,2) DEFAULT 0,
  month_7 NUMERIC(15,2) DEFAULT 0,
  month_8 NUMERIC(15,2) DEFAULT 0,
  month_9 NUMERIC(15,2) DEFAULT 0,
  month_10 NUMERIC(15,2) DEFAULT 0,
  month_11 NUMERIC(15,2) DEFAULT 0,
  month_12 NUMERIC(15,2) DEFAULT 0,

  -- Totals
  total_kg NUMERIC(15,2) DEFAULT 0,
  total_amount NUMERIC(15,2) DEFAULT 0,
  total_morm NUMERIC(15,2) DEFAULT 0,

  -- Source info
  source_file VARCHAR(255),

  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'draft',  -- draft, final
  error_message TEXT,

  -- Audit
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  imported_by VARCHAR(255),
  finalized_at TIMESTAMP,
  finalized_by VARCHAR(255),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fp_bulk_batch_id ON fp_budget_bulk_import(batch_id);
CREATE INDEX IF NOT EXISTS idx_fp_bulk_division ON fp_budget_bulk_import(division);
CREATE INDEX IF NOT EXISTS idx_fp_bulk_status ON fp_budget_bulk_import(status);
CREATE INDEX IF NOT EXISTS idx_fp_bulk_year ON fp_budget_bulk_import(budget_year);
CREATE INDEX IF NOT EXISTS idx_fp_bulk_imported_at ON fp_budget_bulk_import(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_fp_bulk_sales_rep ON fp_budget_bulk_import(sales_rep);

-- Comments
COMMENT ON TABLE fp_budget_bulk_import IS 'Stores bulk budget import batches for tracking and review';
COMMENT ON COLUMN fp_budget_bulk_import.batch_id IS 'Unique identifier for a batch import operation';
COMMENT ON COLUMN fp_budget_bulk_import.status IS 'Status: draft (editable), final (finalized to budget_unified)';
