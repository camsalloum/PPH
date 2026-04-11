-- ============================================================================
-- Create fp_divisional_budget table for storing divisional-level budgets
-- These are aggregate budgets at division/product-group level without customer breakdown
-- ============================================================================

-- Drop table if it exists (for development - remove in production)
DROP TABLE IF EXISTS fp_divisional_budget CASCADE;

-- Create the table
CREATE TABLE fp_divisional_budget (
    id BIGSERIAL PRIMARY KEY,
    
    -- Core dimensions
    division VARCHAR(10) NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    product_group TEXT NOT NULL,
    
    -- Metric type and value
    metric VARCHAR(10) NOT NULL,  -- 'KGS', 'Amount', 'MoRM'
    value NUMERIC NOT NULL DEFAULT 0,
    
    -- Material/Process info (for reporting)
    material TEXT,
    process TEXT,
    
    -- Audit fields
    uploaded_filename TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT chk_div_budget_division CHECK (UPPER(division) IN ('FP', 'SB', 'TF', 'HCM')),
    CONSTRAINT chk_div_budget_year CHECK (year >= 2020 AND year <= 2050),
    CONSTRAINT chk_div_budget_month CHECK (month >= 1 AND month <= 12),
    CONSTRAINT chk_div_budget_metric CHECK (UPPER(metric) IN ('KGS', 'AMOUNT', 'MORM')),
    CONSTRAINT chk_div_budget_value CHECK (value >= 0)
);

-- Create unique constraint for upsert operations
CREATE UNIQUE INDEX idx_fp_divisional_budget_unique 
ON fp_divisional_budget (UPPER(division), year, month, product_group, UPPER(metric));

-- Create indexes for common queries
CREATE INDEX idx_fp_div_budget_division ON fp_divisional_budget (UPPER(division));
CREATE INDEX idx_fp_div_budget_year ON fp_divisional_budget (year);
CREATE INDEX idx_fp_div_budget_div_year ON fp_divisional_budget (UPPER(division), year);
CREATE INDEX idx_fp_div_budget_product ON fp_divisional_budget (product_group);

-- Add comments
COMMENT ON TABLE fp_divisional_budget IS 'Divisional-level budget data aggregated by product group (no customer breakdown)';
COMMENT ON COLUMN fp_divisional_budget.division IS 'Division code: FP, SB, TF, HCM';
COMMENT ON COLUMN fp_divisional_budget.year IS 'Budget year';
COMMENT ON COLUMN fp_divisional_budget.month IS 'Budget month (1-12)';
COMMENT ON COLUMN fp_divisional_budget.product_group IS 'Product group name';
COMMENT ON COLUMN fp_divisional_budget.metric IS 'Value type: KGS, Amount, or MoRM';
COMMENT ON COLUMN fp_divisional_budget.value IS 'Budget value in the specified metric';
COMMENT ON COLUMN fp_divisional_budget.material IS 'Material category from pricing lookup';
COMMENT ON COLUMN fp_divisional_budget.process IS 'Process category from pricing lookup';
COMMENT ON COLUMN fp_divisional_budget.uploaded_filename IS 'Source filename for audit trail';

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON fp_divisional_budget TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE fp_divisional_budget_id_seq TO your_app_user;

SELECT 'fp_divisional_budget table created successfully!' AS status;
