-- Migration: Create P&L Tables for Each Division
-- Description: Stores P&L data from Excel with auto-calculated columns
-- Date: 2025-12-17

-- =====================================================
-- P&L Refresh Audit Log Table (shared across divisions)
-- =====================================================
CREATE TABLE IF NOT EXISTS pl_refresh_log (
    id SERIAL PRIMARY KEY,
    division_code VARCHAR(10) NOT NULL,
    refreshed_by INTEGER REFERENCES users(id),
    refreshed_at TIMESTAMP DEFAULT NOW(),
    records_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'success',  -- 'success', 'failed', 'partial'
    error_message TEXT,
    excel_file_name VARCHAR(255),
    duration_ms INTEGER
);

CREATE INDEX idx_pl_refresh_log_division ON pl_refresh_log(division_code);
CREATE INDEX idx_pl_refresh_log_date ON pl_refresh_log(refreshed_at DESC);

-- =====================================================
-- FP Division P&L Table
-- =====================================================
CREATE TABLE IF NOT EXISTS fp_pl_data (
    id SERIAL PRIMARY KEY,
    
    -- Period identification
    year INTEGER NOT NULL,
    month VARCHAR(20) NOT NULL,  -- 'January', 'February', etc.
    data_type VARCHAR(20) NOT NULL,  -- 'Actual', 'Estimate', 'Budget'
    
    -- Row 3: Sales
    sales DECIMAL(18,2) DEFAULT 0,
    -- Row 4: Cost of Sales (informational, not used in calculations)
    cost_of_sales DECIMAL(18,2) DEFAULT 0,
    -- Row 5: Material
    material DECIMAL(18,2) DEFAULT 0,
    -- Row 7: Sales volume (kg)
    sales_volume_kg DECIMAL(18,2) DEFAULT 0,
    -- Row 8: Production volume (kg)
    production_volume_kg DECIMAL(18,2) DEFAULT 0,
    -- Row 9: Labour
    labour DECIMAL(18,2) DEFAULT 0,
    -- Row 10: Depreciation
    depreciation DECIMAL(18,2) DEFAULT 0,
    -- Row 12: Electricity
    electricity DECIMAL(18,2) DEFAULT 0,
    -- Row 13: Others Mfg. overheads
    others_mfg_overheads DECIMAL(18,2) DEFAULT 0,
    -- Row 15: Dir.Cost in Stock/Stock Adj.
    dir_cost_stock_adj DECIMAL(18,2) DEFAULT 0,
    -- Row 17: Dir.Cost of goods sold (SEWA disputed amt)
    dir_cost_sewa DECIMAL(18,2) DEFAULT 0,
    -- Row 24: Sales ManpowerCost
    sales_manpower_cost DECIMAL(18,2) DEFAULT 0,
    -- Row 25: Sales Man Incentive
    sales_incentive DECIMAL(18,2) DEFAULT 0,
    -- Row 26: Sales Office Rent
    sales_office_rent DECIMAL(18,2) DEFAULT 0,
    -- Row 27: Sales Travel and AirFare
    sales_travel DECIMAL(18,2) DEFAULT 0,
    -- Row 28: Advt / Exbn / Other Promotion
    advt_promotion DECIMAL(18,2) DEFAULT 0,
    -- Row 29: Other Selling Expenses
    other_selling_expenses DECIMAL(18,2) DEFAULT 0,
    -- Row 32: Transportation
    transportation DECIMAL(18,2) DEFAULT 0,
    -- Row 34: Administration Man Power Cost
    admin_manpower_cost DECIMAL(18,2) DEFAULT 0,
    -- Row 35: Telephone / Fax
    telephone_fax DECIMAL(18,2) DEFAULT 0,
    -- Row 37: Other Administration Cost
    other_admin_cost DECIMAL(18,2) DEFAULT 0,
    -- Row 40: Administration & Management Fee
    admin_mgmt_fee DECIMAL(18,2) DEFAULT 0,
    -- Row 42: Bank interest
    bank_interest DECIMAL(18,2) DEFAULT 0,
    -- Row 43: Bank charges
    bank_charges DECIMAL(18,2) DEFAULT 0,
    -- Row 44: R & D, pre-production w/o
    rd_preproduction DECIMAL(18,2) DEFAULT 0,
    -- Row 48: Adj to Stock Prov.-Divn/Stock Valuation
    stock_provision_adj DECIMAL(18,2) DEFAULT 0,
    -- Row 49: Bad debts
    bad_debts DECIMAL(18,2) DEFAULT 0,
    -- Row 50: Other Income
    other_income DECIMAL(18,2) DEFAULT 0,
    -- Row 51: Other Provision
    other_provision DECIMAL(18,2) DEFAULT 0,
    
    -- =====================================================
    -- CALCULATED COLUMNS (PostgreSQL Generated Columns)
    -- =====================================================
    
    -- Row 6: Material cost as % of Sales
    material_cost_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN (material / sales) * 100 ELSE 0 END
    ) STORED,
    
    -- Row 14: Actual Direct Cost Spent = Material + Labour + Depreciation + Electricity + Others Mfg
    actual_direct_cost_spent DECIMAL(18,2) GENERATED ALWAYS AS (
        material + labour + depreciation + electricity + others_mfg_overheads
    ) STORED,
    
    -- Row 16: Dir.Cost of goods sold = Direct Cost Spent + Stock Adj
    dir_cost_goods_sold DECIMAL(18,2) GENERATED ALWAYS AS (
        material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj
    ) STORED,
    
    -- Row 18: Direct cost as % of C.O.G.S
    direct_cost_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN ((material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) / sales) * 100 ELSE 0 END
    ) STORED,
    
    -- Row 19: Gross profit (after Depn.) = Sales - Dir.Cost of goods sold
    gross_profit_after_depn DECIMAL(18,2) GENERATED ALWAYS AS (
        sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)
    ) STORED,
    
    -- Row 20: Gross profit (after Depn.) %
    gross_profit_after_depn_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) / sales) * 100 ELSE 0 END
    ) STORED,
    
    -- Row 21: Gross profit (before Depn.) = GP after Depn + Depreciation
    gross_profit_before_depn DECIMAL(18,2) GENERATED ALWAYS AS (
        sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) + depreciation
    ) STORED,
    
    -- Row 22: Gross profit (before Depn.) %
    gross_profit_before_depn_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) + depreciation) / sales) * 100 ELSE 0 END
    ) STORED,
    
    -- Row 31: Selling expenses = Sum of sales-related costs
    selling_expenses DECIMAL(18,2) GENERATED ALWAYS AS (
        sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses
    ) STORED,
    
    -- Row 38: Administration = Admin manpower + Telephone + Other admin
    administration DECIMAL(18,2) GENERATED ALWAYS AS (
        admin_manpower_cost + telephone_fax + other_admin_cost
    ) STORED,
    
    -- Row 46: Total FinanceCost & Amortization = Bank interest + Bank charges + R&D
    total_finance_cost DECIMAL(18,2) GENERATED ALWAYS AS (
        bank_interest + bank_charges + rd_preproduction
    ) STORED,
    
    -- Row 52: Total Below GP Expenses
    total_below_gp_expenses DECIMAL(18,2) GENERATED ALWAYS AS (
        (sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
        transportation +
        (admin_manpower_cost + telephone_fax + other_admin_cost) +
        admin_mgmt_fee +
        (bank_interest + bank_charges + rd_preproduction) +
        stock_provision_adj + bad_debts - other_income + other_provision
    ) STORED,
    
    -- Row 54: Net Profit = Gross Profit - Total Below GP Expenses
    net_profit DECIMAL(18,2) GENERATED ALWAYS AS (
        (sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
        ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
         transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
         (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision)
    ) STORED,
    
    -- Row 55: Net Profit %
    net_profit_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN (
            ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
             ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
              transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
              (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision))
            / sales
        ) * 100 ELSE 0 END
    ) STORED,
    
    -- Row 56: EBITDA = Net Profit + Depreciation + Bank Interest + R&D
    ebitda DECIMAL(18,2) GENERATED ALWAYS AS (
        (sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
        ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
         transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
         (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision) +
        depreciation + bank_interest + rd_preproduction
    ) STORED,
    
    -- Row 57: EBITDA %
    ebitda_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN (
            ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
             ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
              transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
              (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision) +
             depreciation + bank_interest + rd_preproduction)
            / sales
        ) * 100 ELSE 0 END
    ) STORED,
    
    -- Row 59: Total Expenses = Direct Cost + Below GP Expenses
    total_expenses DECIMAL(18,2) GENERATED ALWAYS AS (
        (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) +
        ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
         transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
         (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision)
    ) STORED,
    
    -- Row 60: Total Expenses /Kg
    total_expenses_per_kg DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales_volume_kg != 0 THEN (
            (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) +
            ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
             transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
             (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision)
        ) / sales_volume_kg ELSE 0 END
    ) STORED,
    
    -- Metadata
    uploaded_at TIMESTAMP DEFAULT NOW(),
    uploaded_by INTEGER,
    
    -- Unique constraint for period
    UNIQUE(year, month, data_type)
);

-- Indexes for fast queries
CREATE INDEX idx_fp_pl_data_period ON fp_pl_data(year, month, data_type);
CREATE INDEX idx_fp_pl_data_year ON fp_pl_data(year);
CREATE INDEX idx_fp_pl_data_type ON fp_pl_data(data_type);

-- =====================================================
-- HC Division P&L Table (same structure as FP)
-- =====================================================
CREATE TABLE IF NOT EXISTS hc_pl_data (
    id SERIAL PRIMARY KEY,
    
    -- Period identification
    year INTEGER NOT NULL,
    month VARCHAR(20) NOT NULL,
    data_type VARCHAR(20) NOT NULL,
    
    -- Input fields (same as FP)
    sales DECIMAL(18,2) DEFAULT 0,
    cost_of_sales DECIMAL(18,2) DEFAULT 0,
    material DECIMAL(18,2) DEFAULT 0,
    sales_volume_kg DECIMAL(18,2) DEFAULT 0,
    production_volume_kg DECIMAL(18,2) DEFAULT 0,
    labour DECIMAL(18,2) DEFAULT 0,
    depreciation DECIMAL(18,2) DEFAULT 0,
    electricity DECIMAL(18,2) DEFAULT 0,
    others_mfg_overheads DECIMAL(18,2) DEFAULT 0,
    dir_cost_stock_adj DECIMAL(18,2) DEFAULT 0,
    dir_cost_sewa DECIMAL(18,2) DEFAULT 0,
    sales_manpower_cost DECIMAL(18,2) DEFAULT 0,
    sales_incentive DECIMAL(18,2) DEFAULT 0,
    sales_office_rent DECIMAL(18,2) DEFAULT 0,
    sales_travel DECIMAL(18,2) DEFAULT 0,
    advt_promotion DECIMAL(18,2) DEFAULT 0,
    other_selling_expenses DECIMAL(18,2) DEFAULT 0,
    transportation DECIMAL(18,2) DEFAULT 0,
    admin_manpower_cost DECIMAL(18,2) DEFAULT 0,
    telephone_fax DECIMAL(18,2) DEFAULT 0,
    other_admin_cost DECIMAL(18,2) DEFAULT 0,
    admin_mgmt_fee DECIMAL(18,2) DEFAULT 0,
    bank_interest DECIMAL(18,2) DEFAULT 0,
    bank_charges DECIMAL(18,2) DEFAULT 0,
    rd_preproduction DECIMAL(18,2) DEFAULT 0,
    stock_provision_adj DECIMAL(18,2) DEFAULT 0,
    bad_debts DECIMAL(18,2) DEFAULT 0,
    other_income DECIMAL(18,2) DEFAULT 0,
    other_provision DECIMAL(18,2) DEFAULT 0,
    
    -- Calculated columns (same formulas as FP)
    material_cost_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN (material / sales) * 100 ELSE 0 END
    ) STORED,
    
    actual_direct_cost_spent DECIMAL(18,2) GENERATED ALWAYS AS (
        material + labour + depreciation + electricity + others_mfg_overheads
    ) STORED,
    
    dir_cost_goods_sold DECIMAL(18,2) GENERATED ALWAYS AS (
        material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj
    ) STORED,
    
    direct_cost_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN ((material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) / sales) * 100 ELSE 0 END
    ) STORED,
    
    gross_profit_after_depn DECIMAL(18,2) GENERATED ALWAYS AS (
        sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)
    ) STORED,
    
    gross_profit_after_depn_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) / sales) * 100 ELSE 0 END
    ) STORED,
    
    gross_profit_before_depn DECIMAL(18,2) GENERATED ALWAYS AS (
        sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) + depreciation
    ) STORED,
    
    gross_profit_before_depn_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) + depreciation) / sales) * 100 ELSE 0 END
    ) STORED,
    
    selling_expenses DECIMAL(18,2) GENERATED ALWAYS AS (
        sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses
    ) STORED,
    
    administration DECIMAL(18,2) GENERATED ALWAYS AS (
        admin_manpower_cost + telephone_fax + other_admin_cost
    ) STORED,
    
    total_finance_cost DECIMAL(18,2) GENERATED ALWAYS AS (
        bank_interest + bank_charges + rd_preproduction
    ) STORED,
    
    total_below_gp_expenses DECIMAL(18,2) GENERATED ALWAYS AS (
        (sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
        transportation +
        (admin_manpower_cost + telephone_fax + other_admin_cost) +
        admin_mgmt_fee +
        (bank_interest + bank_charges + rd_preproduction) +
        stock_provision_adj + bad_debts - other_income + other_provision
    ) STORED,
    
    net_profit DECIMAL(18,2) GENERATED ALWAYS AS (
        (sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
        ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
         transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
         (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision)
    ) STORED,
    
    net_profit_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN (
            ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
             ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
              transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
              (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision))
            / sales
        ) * 100 ELSE 0 END
    ) STORED,
    
    ebitda DECIMAL(18,2) GENERATED ALWAYS AS (
        (sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
        ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
         transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
         (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision) +
        depreciation + bank_interest + rd_preproduction
    ) STORED,
    
    ebitda_pct DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales != 0 THEN (
            ((sales - (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj)) -
             ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
              transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
              (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision) +
             depreciation + bank_interest + rd_preproduction)
            / sales
        ) * 100 ELSE 0 END
    ) STORED,
    
    total_expenses DECIMAL(18,2) GENERATED ALWAYS AS (
        (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) +
        ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
         transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
         (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision)
    ) STORED,
    
    total_expenses_per_kg DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE WHEN sales_volume_kg != 0 THEN (
            (material + labour + depreciation + electricity + others_mfg_overheads + dir_cost_stock_adj) +
            ((sales_manpower_cost + sales_incentive + sales_office_rent + sales_travel + advt_promotion + other_selling_expenses) +
             transportation + (admin_manpower_cost + telephone_fax + other_admin_cost) + admin_mgmt_fee +
             (bank_interest + bank_charges + rd_preproduction) + stock_provision_adj + bad_debts - other_income + other_provision)
        ) / sales_volume_kg ELSE 0 END
    ) STORED,
    
    -- Metadata
    uploaded_at TIMESTAMP DEFAULT NOW(),
    uploaded_by INTEGER,
    
    -- Unique constraint
    UNIQUE(year, month, data_type)
);

-- Indexes for HC
CREATE INDEX idx_hc_pl_data_period ON hc_pl_data(year, month, data_type);
CREATE INDEX idx_hc_pl_data_year ON hc_pl_data(year);
CREATE INDEX idx_hc_pl_data_type ON hc_pl_data(data_type);

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON TABLE fp_pl_data IS 'P&L data for Flexible Packaging Division - refreshed from Excel';
COMMENT ON TABLE hc_pl_data IS 'P&L data for Harwal Container Division - refreshed from Excel';
COMMENT ON TABLE pl_refresh_log IS 'Audit log for P&L data refresh operations';
