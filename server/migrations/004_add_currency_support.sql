-- ============================================================================
-- Migration: Add Currency Support for Multi-Currency Reporting
-- Date: 2025-12-10
-- Description: Adds exchange rates table and currency columns to budget tables
-- ============================================================================

-- 1. Create exchange_rates table in auth database (shared across divisions)
CREATE TABLE IF NOT EXISTS exchange_rates (
    id SERIAL PRIMARY KEY,
    from_currency VARCHAR(3) NOT NULL,           -- Source currency code (e.g., 'AED')
    to_currency VARCHAR(3) NOT NULL,             -- Target currency code (e.g., 'USD')
    rate DECIMAL(18, 8) NOT NULL,                -- Exchange rate (from_currency * rate = to_currency)
    effective_date DATE NOT NULL,                -- Date when this rate becomes effective
    source VARCHAR(100) DEFAULT 'manual',        -- Source of rate: 'manual', 'api', 'central_bank'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    UNIQUE(from_currency, to_currency, effective_date)
);

-- Index for efficient rate lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup 
ON exchange_rates(from_currency, to_currency, effective_date DESC);

-- Index for reverse lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rates_reverse 
ON exchange_rates(to_currency, from_currency, effective_date DESC);

-- 2. Create currencies table for supported currencies
CREATE TABLE IF NOT EXISTS currencies (
    code VARCHAR(3) PRIMARY KEY,                 -- Currency code (ISO 4217)
    name VARCHAR(100) NOT NULL,                  -- Full currency name
    symbol VARCHAR(10) NOT NULL,                 -- Currency symbol (د.إ, $, €, etc.)
    country VARCHAR(100),                        -- Primary country
    decimal_places INTEGER DEFAULT 2,            -- Number of decimal places
    is_active BOOLEAN DEFAULT true,              -- Whether currency is available for selection
    display_order INTEGER DEFAULT 999,           -- Sort order in dropdowns
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert common currencies
INSERT INTO currencies (code, name, symbol, country, decimal_places, display_order) VALUES
    ('AED', 'UAE Dirham', 'د.إ', 'United Arab Emirates', 2, 1),
    ('USD', 'US Dollar', '$', 'United States', 2, 2),
    ('EUR', 'Euro', '€', 'European Union', 2, 3),
    ('GBP', 'British Pound', '£', 'United Kingdom', 2, 4),
    ('SAR', 'Saudi Riyal', '﷼', 'Saudi Arabia', 2, 5),
    ('KWD', 'Kuwaiti Dinar', 'د.ك', 'Kuwait', 3, 6),
    ('QAR', 'Qatari Riyal', '﷼', 'Qatar', 2, 7),
    ('BHD', 'Bahraini Dinar', '.د.ب', 'Bahrain', 3, 8),
    ('OMR', 'Omani Rial', '﷼', 'Oman', 3, 9),
    ('INR', 'Indian Rupee', '₹', 'India', 2, 10),
    ('PKR', 'Pakistani Rupee', '₨', 'Pakistan', 2, 11),
    ('CNY', 'Chinese Yuan', '¥', 'China', 2, 12),
    ('JPY', 'Japanese Yen', '¥', 'Japan', 0, 13)
ON CONFLICT (code) DO NOTHING;

-- Insert initial AED exchange rates (AED is base currency)
INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source) VALUES
    ('AED', 'USD', 0.272294, '2025-01-01', 'fixed_peg'),   -- AED is pegged to USD
    ('USD', 'AED', 3.6725, '2025-01-01', 'fixed_peg'),     -- Reverse rate
    ('AED', 'EUR', 0.251, '2025-01-01', 'manual'),
    ('EUR', 'AED', 3.984, '2025-01-01', 'manual'),
    ('AED', 'GBP', 0.215, '2025-01-01', 'manual'),
    ('GBP', 'AED', 4.651, '2025-01-01', 'manual'),
    ('AED', 'SAR', 1.0204, '2025-01-01', 'manual'),        -- SAR also pegged to USD
    ('SAR', 'AED', 0.98, '2025-01-01', 'manual')
ON CONFLICT (from_currency, to_currency, effective_date) DO NOTHING;

-- 3. Add base_currency setting to company_settings if not exists
INSERT INTO company_settings (setting_key, setting_value) 
VALUES ('base_currency', '"AED"')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- NOTE: The following columns will be added dynamically to division budget tables
-- by ensureSalesRepBudgetColumns() function when budget operations occur:
--
-- ALTER TABLE fp_sales_rep_budget ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) DEFAULT 'AED';
-- ALTER TABLE fp_sales_rep_budget ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8) DEFAULT 1.0;
-- ALTER TABLE fp_divisional_budget ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) DEFAULT 'AED';
-- ALTER TABLE fp_divisional_budget ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8) DEFAULT 1.0;
-- ============================================================================

COMMENT ON TABLE exchange_rates IS 'Stores historical exchange rates for multi-currency reporting';
COMMENT ON TABLE currencies IS 'Master list of supported currencies';
COMMENT ON COLUMN exchange_rates.rate IS 'Multiply from_currency amount by this rate to get to_currency amount';
