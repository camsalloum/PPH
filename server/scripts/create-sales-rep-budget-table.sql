-- ============================================================================
-- SALES REP BUDGET TABLE
-- ============================================================================
-- This table stores individual sales rep budgets uploaded via HTML forms
-- Separate from divisional budgets in fp_data_excel
-- Supports 3 value types: KGS (quantity), Amount (revenue), MoRM (margin)

CREATE TABLE IF NOT EXISTS sales_rep_budget (
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
  material VARCHAR(255) DEFAULT '',
  process VARCHAR(255) DEFAULT '',
  
  -- Value Information
  values_type VARCHAR(20) NOT NULL CHECK (values_type IN ('KGS', 'Amount', 'MoRM')),
  values DECIMAL(20, 2) NOT NULL,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_filename VARCHAR(500),
  
  -- Unique constraint: one record per combination
  UNIQUE (division, budget_year, month, type, salesrepname, customername, countryname, productgroup, values_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_rep_budget_division ON sales_rep_budget(division);
CREATE INDEX IF NOT EXISTS idx_sales_rep_budget_year ON sales_rep_budget(budget_year);
CREATE INDEX IF NOT EXISTS idx_sales_rep_budget_salesrep ON sales_rep_budget(salesrepname);
CREATE INDEX IF NOT EXISTS idx_sales_rep_budget_productgroup ON sales_rep_budget(productgroup);
CREATE INDEX IF NOT EXISTS idx_sales_rep_budget_values_type ON sales_rep_budget(values_type);
CREATE INDEX IF NOT EXISTS idx_sales_rep_budget_lookup ON sales_rep_budget(division, budget_year, salesrepname, values_type);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_sales_rep_budget_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_sales_rep_budget_updated_at
    BEFORE UPDATE ON sales_rep_budget
    FOR EACH ROW
    EXECUTE FUNCTION update_sales_rep_budget_updated_at();

-- Comments
COMMENT ON TABLE sales_rep_budget IS 'Individual sales rep budgets uploaded via HTML forms, separate from divisional budgets';
COMMENT ON COLUMN sales_rep_budget.values_type IS 'Type of value: KGS (quantity), Amount (revenue), MoRM (margin over raw material)';
COMMENT ON COLUMN sales_rep_budget.values IS 'Numeric value in respective unit (KGS for quantity, AED for Amount/MoRM)';
COMMENT ON COLUMN sales_rep_budget.material IS 'Material type from material_percentages table';
COMMENT ON COLUMN sales_rep_budget.process IS 'Process type from material_percentages table';

