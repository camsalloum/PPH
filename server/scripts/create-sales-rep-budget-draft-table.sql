-- ============================================================================
-- SALES REP BUDGET DRAFT TABLE
-- ============================================================================
-- This table stores work-in-progress budget drafts
-- Allows users to save partial work and continue later
-- Separate from final budgets in sales_rep_budget table

CREATE TABLE IF NOT EXISTS sales_rep_budget_draft (
  id SERIAL PRIMARY KEY,
  
  -- Budget Identification
  division VARCHAR(50) NOT NULL,
  budget_year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  type VARCHAR(20) NOT NULL DEFAULT 'Budget',
  
  -- Sales Rep Information
  salesrepname VARCHAR(255) NOT NULL,
  
  -- Customer & Location
  customername VARCHAR(255) NOT NULL,
  countryname VARCHAR(255) NOT NULL,
  
  -- Product Information
  productgroup VARCHAR(255) NOT NULL,
  
  -- Value (only KGS in draft, Amount/MoRM calculated on final submit)
  values DECIMAL(20, 2) NOT NULL,
  
  -- Draft Metadata
  status VARCHAR(20) DEFAULT 'DRAFT',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_auto_save TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint: one draft record per combination
  UNIQUE (division, budget_year, month, salesrepname, customername, countryname, productgroup)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_rep_budget_draft_division ON sales_rep_budget_draft(division);
CREATE INDEX IF NOT EXISTS idx_sales_rep_budget_draft_year ON sales_rep_budget_draft(budget_year);
CREATE INDEX IF NOT EXISTS idx_sales_rep_budget_draft_salesrep ON sales_rep_budget_draft(salesrepname);
CREATE INDEX IF NOT EXISTS idx_sales_rep_budget_draft_lookup ON sales_rep_budget_draft(division, budget_year, salesrepname);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_sales_rep_budget_draft_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.last_auto_save = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_sales_rep_budget_draft_updated_at
    BEFORE UPDATE ON sales_rep_budget_draft
    FOR EACH ROW
    EXECUTE FUNCTION update_sales_rep_budget_draft_updated_at();

-- Comments
COMMENT ON TABLE sales_rep_budget_draft IS 'Work-in-progress budget drafts, separate from final budgets';
COMMENT ON COLUMN sales_rep_budget_draft.status IS 'Always DRAFT - final budgets go to sales_rep_budget table';
COMMENT ON COLUMN sales_rep_budget_draft.values IS 'KGS values only - Amount/MoRM calculated on final submission';
COMMENT ON COLUMN sales_rep_budget_draft.last_auto_save IS 'Timestamp of last auto-save (live version) or manual save (HTML)';

