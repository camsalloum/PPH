-- Migration 313: Create Budget Customer Unified Table
-- Creates unified table for budget customers with prospect tracking
-- Date: 2026-01-04

-- ============================================================
-- TABLE 1: fp_budget_customer_unified
-- ============================================================
CREATE TABLE IF NOT EXISTS fp_budget_customer_unified (
  -- Primary Key
  budget_customer_id SERIAL PRIMARY KEY,
  
  -- Core Identifiers
  customer_code VARCHAR(50) UNIQUE,
  display_name VARCHAR(500) NOT NULL,
  normalized_name VARCHAR(500) NOT NULL,
  
  -- Status (Prospect vs Customer)
  global_status VARCHAR(20) DEFAULT 'prospect' CHECK (global_status IN ('prospect', 'customer')),
  actual_customer_id INTEGER REFERENCES fp_customer_unified(customer_id) ON DELETE SET NULL,
  first_actual_sale_date DATE,
  
  -- Sales Rep (from budget data)
  primary_sales_rep_name VARCHAR(200),
  primary_sales_rep_id INTEGER,
  sales_rep_group_id INTEGER,
  sales_rep_group_name VARCHAR(100),
  
  -- Geographic
  primary_country VARCHAR(100),
  countries TEXT[],
  country_region VARCHAR(100),
  
  -- Product Groups
  primary_product_group VARCHAR(100),
  product_groups TEXT[],
  
  -- Budget Aggregates (ALL YEARS)
  total_budget_amount DECIMAL(18,2) DEFAULT 0,
  total_budget_kgs DECIMAL(18,4) DEFAULT 0,
  total_budget_morm DECIMAL(18,4) DEFAULT 0,
  
  -- Per-Year Data (JSONB - no extra table needed)
  budget_years INTEGER[],
  year_data JSONB DEFAULT '{}',
  -- Example year_data:
  -- {
  --   "2025": {
  --     "status": "customer",
  --     "budget_amount": 150000,
  --     "budget_kgs": 5000,
  --     "actual_amount": 120000,
  --     "actual_kgs": 4200
  --   },
  --   "2026": {
  --     "status": "prospect",
  --     "budget_amount": 200000,
  --     "budget_kgs": 7000
  --   }
  -- }
  
  -- Contact Info (for prospects - entered by sales rep)
  primary_contact VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  
  -- Merge Tracking (same as fp_customer_unified)
  is_merged BOOLEAN DEFAULT false,
  merged_into_id INTEGER REFERENCES fp_budget_customer_unified(budget_customer_id) ON DELETE SET NULL,
  original_names TEXT[],
  
  -- Activity Tracking
  is_active BOOLEAN DEFAULT true,
  first_budget_date DATE,
  last_budget_date DATE,
  
  -- Audit
  division VARCHAR(10) DEFAULT 'FP',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  
  -- Unique constraint on normalized name per division
  UNIQUE(normalized_name, division)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_budget_customer_unified_status ON fp_budget_customer_unified(global_status);
CREATE INDEX IF NOT EXISTS idx_budget_customer_unified_actual_id ON fp_budget_customer_unified(actual_customer_id);
CREATE INDEX IF NOT EXISTS idx_budget_customer_unified_display ON fp_budget_customer_unified(display_name);
CREATE INDEX IF NOT EXISTS idx_budget_customer_unified_normalized ON fp_budget_customer_unified(normalized_name);
CREATE INDEX IF NOT EXISTS idx_budget_customer_unified_sales_rep ON fp_budget_customer_unified(primary_sales_rep_name);
CREATE INDEX IF NOT EXISTS idx_budget_customer_unified_country ON fp_budget_customer_unified(primary_country);
CREATE INDEX IF NOT EXISTS idx_budget_customer_unified_region ON fp_budget_customer_unified(country_region);
CREATE INDEX IF NOT EXISTS idx_budget_customer_unified_merged ON fp_budget_customer_unified(is_merged);
CREATE INDEX IF NOT EXISTS idx_budget_customer_unified_division ON fp_budget_customer_unified(division);
CREATE INDEX IF NOT EXISTS idx_budget_customer_unified_years ON fp_budget_customer_unified USING GIN(budget_years);

-- ============================================================
-- TABLE 2: fp_prospect_conversion_log
-- ============================================================
CREATE TABLE IF NOT EXISTS fp_prospect_conversion_log (
  id SERIAL PRIMARY KEY,
  budget_customer_id INTEGER NOT NULL REFERENCES fp_budget_customer_unified(budget_customer_id) ON DELETE CASCADE,
  actual_customer_id INTEGER NOT NULL REFERENCES fp_customer_unified(customer_id) ON DELETE CASCADE,
  
  -- Conversion Details
  customer_name VARCHAR(500) NOT NULL,
  converted_from_status VARCHAR(20) DEFAULT 'prospect',
  converted_to_status VARCHAR(20) DEFAULT 'customer',
  
  -- What triggered the conversion
  first_actual_sale_date DATE NOT NULL,
  first_actual_sale_amount DECIMAL(18,2),
  first_actual_sale_kgs DECIMAL(18,4),
  
  -- Context
  conversion_year INTEGER NOT NULL,
  sales_rep_name VARCHAR(200),
  country VARCHAR(100),
  product_group VARCHAR(100),
  
  -- Audit
  converted_at TIMESTAMP DEFAULT NOW(),
  division VARCHAR(10) DEFAULT 'FP',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_prospect_conversion_log_budget ON fp_prospect_conversion_log(budget_customer_id);
CREATE INDEX IF NOT EXISTS idx_prospect_conversion_log_actual ON fp_prospect_conversion_log(actual_customer_id);
CREATE INDEX IF NOT EXISTS idx_prospect_conversion_log_year ON fp_prospect_conversion_log(conversion_year);
CREATE INDEX IF NOT EXISTS idx_prospect_conversion_log_date ON fp_prospect_conversion_log(converted_at);

-- ============================================================
-- TABLE 3: pending_country_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_country_assignments (
  id SERIAL PRIMARY KEY,
  country_name VARCHAR(100) NOT NULL,
  normalized_name VARCHAR(100) NOT NULL,
  source_table VARCHAR(50) NOT NULL,
  occurrence_count INTEGER DEFAULT 1,
  sample_customers TEXT[],
  
  -- AI Suggestions
  suggested_master_country VARCHAR(100),
  suggested_confidence DECIMAL(5,4),
  
  -- Admin Resolution
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'IGNORED')),
  resolved_action VARCHAR(20) CHECK (resolved_action IN ('ALIAS', 'NEW_COUNTRY', 'IGNORED')),
  resolved_master_country VARCHAR(100),
  resolved_region VARCHAR(50),
  resolved_by VARCHAR(100),
  resolved_at TIMESTAMP,
  
  -- Audit
  first_seen_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP DEFAULT NOW(),
  division VARCHAR(10) DEFAULT 'FP',
  
  UNIQUE(normalized_name, division)
);

CREATE INDEX IF NOT EXISTS idx_pending_countries_status ON pending_country_assignments(status, division);
CREATE INDEX IF NOT EXISTS idx_pending_countries_normalized ON pending_country_assignments(normalized_name);

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON TABLE fp_budget_customer_unified IS 'Unified budget customer table with prospect tracking. Sources from fp_sales_rep_budget.';
COMMENT ON TABLE fp_prospect_conversion_log IS 'History log of prospect to customer conversions.';
COMMENT ON TABLE pending_country_assignments IS 'Unrecognized countries awaiting admin region assignment.';

COMMENT ON COLUMN fp_budget_customer_unified.global_status IS 'prospect = never had actual sales, customer = has actual sales';
COMMENT ON COLUMN fp_budget_customer_unified.year_data IS 'JSONB with per-year budget/actual data and status';
COMMENT ON COLUMN pending_country_assignments.suggested_confidence IS 'AI match confidence 0.0-1.0';
