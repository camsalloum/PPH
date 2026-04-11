-- Migration: 400_create_sales_rep_group_budget_allocation
-- Purpose: Create table for management's GROUP-level budget allocations
-- Date: 2025-01-16
-- Version: 3.0

-- ============================================
-- NEW TABLE: fp_sales_rep_group_budget_allocation
-- Stores management decisions at GROUP + PG level
-- ============================================

CREATE TABLE IF NOT EXISTS fp_sales_rep_group_budget_allocation (
  id SERIAL PRIMARY KEY,
  
  -- Division Context
  division_name VARCHAR(255) NOT NULL DEFAULT 'Flexible Packaging',
  division_code VARCHAR(50) NOT NULL DEFAULT 'FP',
  
  -- Budget Period
  budget_year INTEGER NOT NULL,
  month_no INTEGER NOT NULL CHECK (month_no >= 1 AND month_no <= 12),
  month_name VARCHAR(20),
  
  -- Allocation Target (GROUP level - NOT individual rep!)
  sales_rep_group_id INTEGER REFERENCES sales_rep_groups(id) ON DELETE RESTRICT,
  sales_rep_group_name VARCHAR(255) NOT NULL,
  pgcombine VARCHAR(255) NOT NULL,
  
  -- Budget Values (Management Decision)
  qty_kgs NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount NUMERIC(15,2) DEFAULT 0,
  morm NUMERIC(15,2) DEFAULT 0,
  
  -- Status Workflow
  budget_status VARCHAR(20) NOT NULL DEFAULT 'draft',
  
  -- Reference Data (Cached from aggregation - for display/audit)
  actual_prev_year_total NUMERIC(15,2),
  rep_submitted_total NUMERIC(15,2),
  
  -- Audit Trail
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  submitted_at TIMESTAMP,
  submitted_by VARCHAR(255),
  
  -- UNIQUE CONSTRAINT: One allocation per (GROUP + PG + month + year + division)
  CONSTRAINT uk_group_budget_allocation_unique 
    UNIQUE (division_code, budget_year, month_no, sales_rep_group_id, pgcombine)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_grp_alloc_division_year ON fp_sales_rep_group_budget_allocation(division_code, budget_year);
CREATE INDEX IF NOT EXISTS idx_grp_alloc_group_id ON fp_sales_rep_group_budget_allocation(sales_rep_group_id);
CREATE INDEX IF NOT EXISTS idx_grp_alloc_group_name ON fp_sales_rep_group_budget_allocation(sales_rep_group_name);
CREATE INDEX IF NOT EXISTS idx_grp_alloc_status ON fp_sales_rep_group_budget_allocation(budget_status);
CREATE INDEX IF NOT EXISTS idx_grp_alloc_pgcombine ON fp_sales_rep_group_budget_allocation(pgcombine);
CREATE INDEX IF NOT EXISTS idx_grp_alloc_year_status ON fp_sales_rep_group_budget_allocation(budget_year, budget_status);

-- Add comment for documentation
COMMENT ON TABLE fp_sales_rep_group_budget_allocation IS 'Management budget allocations at Sales Rep GROUP + Product Group level. Version 3.0';
COMMENT ON COLUMN fp_sales_rep_group_budget_allocation.sales_rep_group_id IS 'FK to sales_rep_groups table';
COMMENT ON COLUMN fp_sales_rep_group_budget_allocation.sales_rep_group_name IS 'Denormalized group name for display (e.g., Riad & Nidal)';
COMMENT ON COLUMN fp_sales_rep_group_budget_allocation.actual_prev_year_total IS 'Cached: Previous year actual KGS (sum of group members)';
COMMENT ON COLUMN fp_sales_rep_group_budget_allocation.rep_submitted_total IS 'Cached: Group members submitted budget KGS';

-- ============================================
-- VERIFICATION QUERIES (Run after migration)
-- ============================================
-- SELECT COUNT(*) FROM fp_sales_rep_group_budget_allocation;
-- \d fp_sales_rep_group_budget_allocation
