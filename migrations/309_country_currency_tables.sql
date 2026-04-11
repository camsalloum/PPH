-- Migration 309: Add Country and Currency Reference Tables to FP Database
-- Purpose: Create master_countries, currencies, exchange_rates in fp_database
--          and enrich the unified view with country metadata and currency info
-- 
-- Tables created:
--   1. master_countries - Country reference with currency, region, market_type
--   2. currencies - Currency codes, names, symbols
--   3. exchange_rates - Exchange rates with effective dates
--   4. country_aliases - Maps alternate country names to master records
--
-- View updated:
--   vw_unified_sales_complete - Now includes country metadata

-- ============================================================================
-- 1. CURRENCIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS currencies (
    code VARCHAR(3) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10),
    country VARCHAR(100),
    decimal_places INTEGER DEFAULT 2,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 999,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert common currencies
INSERT INTO currencies (code, name, symbol, country, decimal_places, is_active, display_order)
VALUES 
    ('AED', 'UAE Dirham', 'د.إ', 'United Arab Emirates', 2, true, 1),
    ('SAR', 'Saudi Riyal', '﷼', 'Saudi Arabia', 2, true, 2),
    ('KWD', 'Kuwaiti Dinar', 'د.ك', 'Kuwait', 3, true, 3),
    ('QAR', 'Qatari Riyal', '﷼', 'Qatar', 2, true, 4),
    ('OMR', 'Omani Rial', 'ر.ع.', 'Oman', 3, true, 5),
    ('BHD', 'Bahraini Dinar', 'BD', 'Bahrain', 3, true, 6),
    ('JOD', 'Jordanian Dinar', 'JD', 'Jordan', 3, true, 7),
    ('EGP', 'Egyptian Pound', 'E£', 'Egypt', 2, true, 8),
    ('USD', 'US Dollar', '$', 'United States', 2, true, 9),
    ('EUR', 'Euro', '€', 'European Union', 2, true, 10),
    ('GBP', 'British Pound', '£', 'United Kingdom', 2, true, 11),
    ('LBP', 'Lebanese Pound', 'L£', 'Lebanon', 2, true, 12),
    ('IQD', 'Iraqi Dinar', 'IQD', 'Iraq', 3, true, 13),
    ('SYP', 'Syrian Pound', 'S£', 'Syria', 2, true, 14),
    ('YER', 'Yemeni Rial', 'YER', 'Yemen', 2, true, 15),
    ('MAD', 'Moroccan Dirham', 'DH', 'Morocco', 2, true, 16),
    ('TND', 'Tunisian Dinar', 'DT', 'Tunisia', 3, true, 17),
    ('DZD', 'Algerian Dinar', 'DA', 'Algeria', 2, true, 18),
    ('SDG', 'Sudanese Pound', 'SDG', 'Sudan', 2, true, 19),
    ('ETB', 'Ethiopian Birr', 'Br', 'Ethiopia', 2, true, 20),
    ('NGN', 'Nigerian Naira', '₦', 'Nigeria', 2, true, 21),
    ('GHS', 'Ghanaian Cedi', 'GH₵', 'Ghana', 2, true, 22),
    ('XOF', 'CFA Franc (West)', 'CFA', 'West Africa', 0, true, 23),
    ('XAF', 'CFA Franc (Central)', 'FCFA', 'Central Africa', 0, true, 24),
    ('UGX', 'Ugandan Shilling', 'USh', 'Uganda', 0, true, 25),
    ('RWF', 'Rwandan Franc', 'FRw', 'Rwanda', 0, true, 26),
    ('SOS', 'Somali Shilling', 'S', 'Somalia', 2, true, 27),
    ('DJF', 'Djiboutian Franc', 'Fdj', 'Djibouti', 0, true, 28),
    ('AOA', 'Angolan Kwanza', 'Kz', 'Angola', 2, true, 29),
    ('CDF', 'Congolese Franc', 'FC', 'Congo', 2, true, 30),
    ('BIF', 'Burundian Franc', 'FBu', 'Burundi', 0, true, 31),
    ('SSP', 'South Sudanese Pound', 'SSP', 'South Sudan', 2, true, 32),
    ('AMD', 'Armenian Dram', '֏', 'Armenia', 2, true, 33),
    ('AFN', 'Afghan Afghani', '؋', 'Afghanistan', 2, true, 34)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. EXCHANGE_RATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS exchange_rates (
    id SERIAL PRIMARY KEY,
    from_currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    to_currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    rate NUMERIC(20, 8) NOT NULL,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER,
    UNIQUE(from_currency, to_currency, effective_date)
);

-- Insert exchange rates (AED as base - fixed peg to USD)
INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source)
VALUES 
    -- AED <-> USD (fixed peg)
    ('AED', 'USD', 0.272294, '2025-01-01', 'fixed_peg'),
    ('USD', 'AED', 3.6725, '2025-01-01', 'fixed_peg'),
    -- AED <-> EUR
    ('AED', 'EUR', 0.251, '2025-01-01', 'manual'),
    ('EUR', 'AED', 3.984, '2025-01-01', 'manual'),
    -- AED <-> GBP
    ('AED', 'GBP', 0.215, '2025-01-01', 'manual'),
    ('GBP', 'AED', 4.651, '2025-01-01', 'manual'),
    -- AED <-> SAR (fixed peg via USD)
    ('AED', 'SAR', 1.0204, '2025-01-01', 'fixed_peg'),
    ('SAR', 'AED', 0.98, '2025-01-01', 'fixed_peg'),
    -- AED <-> KWD
    ('AED', 'KWD', 0.0835, '2025-01-01', 'manual'),
    ('KWD', 'AED', 11.976, '2025-01-01', 'manual'),
    -- AED <-> QAR (fixed peg)
    ('AED', 'QAR', 0.99, '2025-01-01', 'fixed_peg'),
    ('QAR', 'AED', 1.01, '2025-01-01', 'fixed_peg'),
    -- AED <-> OMR
    ('AED', 'OMR', 0.1047, '2025-01-01', 'manual'),
    ('OMR', 'AED', 9.55, '2025-01-01', 'manual'),
    -- AED <-> BHD
    ('AED', 'BHD', 0.1026, '2025-01-01', 'fixed_peg'),
    ('BHD', 'AED', 9.75, '2025-01-01', 'fixed_peg'),
    -- AED <-> JOD
    ('AED', 'JOD', 0.193, '2025-01-01', 'fixed_peg'),
    ('JOD', 'AED', 5.18, '2025-01-01', 'fixed_peg'),
    -- AED <-> EGP
    ('AED', 'EGP', 13.35, '2025-01-01', 'manual'),
    ('EGP', 'AED', 0.075, '2025-01-01', 'manual')
ON CONFLICT (from_currency, to_currency, effective_date) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup 
    ON exchange_rates(from_currency, to_currency, effective_date DESC);

-- ============================================================================
-- 3. MASTER_COUNTRIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS master_countries (
    id SERIAL PRIMARY KEY,
    country_name VARCHAR(100) NOT NULL UNIQUE,
    country_code_2 CHAR(2),           -- ISO 3166-1 alpha-2
    country_code_3 CHAR(3),           -- ISO 3166-1 alpha-3
    numeric_code CHAR(3),             -- ISO 3166-1 numeric
    currency_code VARCHAR(3) REFERENCES currencies(code),
    region VARCHAR(50),               -- GCC, Levant, Africa, etc.
    sub_region VARCHAR(50),           -- North Africa, East Africa, etc.
    market_type VARCHAR(20),          -- Core, Growth, Emerging
    longitude NUMERIC(10, 6),
    latitude NUMERIC(10, 6),
    phone_code VARCHAR(10),
    capital VARCHAR(100),
    continent VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 999,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert countries with sales data (34 countries from fp_data_excel)
INSERT INTO master_countries (country_name, country_code_2, country_code_3, currency_code, region, market_type, continent)
VALUES 
    -- GCC Countries (Core Markets)
    ('United Arab Emirates', 'AE', 'ARE', 'AED', 'GCC', 'Core', 'Asia'),
    ('Saudi Arabia', 'SA', 'SAU', 'SAR', 'GCC', 'Core', 'Asia'),
    ('Kuwait', 'KW', 'KWT', 'KWD', 'GCC', 'Core', 'Asia'),
    ('Qatar', 'QA', 'QAT', 'QAR', 'GCC', 'Core', 'Asia'),
    ('Oman', 'OM', 'OMN', 'OMR', 'GCC', 'Core', 'Asia'),
    ('Bahrain', 'BH', 'BHR', 'BHD', 'GCC', 'Core', 'Asia'),
    
    -- Levant & Middle East (Growth Markets)
    ('Jordan', 'JO', 'JOR', 'JOD', 'Levant', 'Growth', 'Asia'),
    ('Lebanon', 'LB', 'LBN', 'LBP', 'Levant', 'Growth', 'Asia'),
    ('Iraq', 'IQ', 'IRQ', 'IQD', 'Levant', 'Growth', 'Asia'),
    ('Syria', 'SY', 'SYR', 'SYP', 'Levant', 'Emerging', 'Asia'),
    ('Yemen', 'YE', 'YEM', 'YER', 'Middle East', 'Emerging', 'Asia'),
    
    -- North Africa (Growth Markets)
    ('Egypt', 'EG', 'EGY', 'EGP', 'North Africa', 'Growth', 'Africa'),
    ('Morocco', 'MA', 'MAR', 'MAD', 'North Africa', 'Growth', 'Africa'),
    ('Tunisia', 'TN', 'TUN', 'TND', 'North Africa', 'Growth', 'Africa'),
    ('Algeria', 'DZ', 'DZA', 'DZD', 'North Africa', 'Growth', 'Africa'),
    ('Sudan', 'SD', 'SDN', 'SDG', 'North Africa', 'Emerging', 'Africa'),
    ('South Sudan', 'SS', 'SSD', 'SSP', 'East Africa', 'Emerging', 'Africa'),
    
    -- East Africa
    ('Ethiopia', 'ET', 'ETH', 'ETB', 'East Africa', 'Growth', 'Africa'),
    ('Uganda', 'UG', 'UGA', 'UGX', 'East Africa', 'Growth', 'Africa'),
    ('Rwanda', 'RW', 'RWA', 'RWF', 'East Africa', 'Emerging', 'Africa'),
    ('Burundi', 'BI', 'BDI', 'BIF', 'East Africa', 'Emerging', 'Africa'),
    ('Somalia', 'SO', 'SOM', 'SOS', 'East Africa', 'Emerging', 'Africa'),
    ('Djibouti', 'DJ', 'DJI', 'DJF', 'East Africa', 'Emerging', 'Africa'),
    
    -- West Africa
    ('Nigeria', 'NG', 'NGA', 'NGN', 'West Africa', 'Growth', 'Africa'),
    ('Ghana', 'GH', 'GHA', 'GHS', 'West Africa', 'Growth', 'Africa'),
    ('Ivory Coast', 'CI', 'CIV', 'XOF', 'West Africa', 'Growth', 'Africa'),
    ('Niger', 'NE', 'NER', 'XOF', 'West Africa', 'Emerging', 'Africa'),
    ('Togo', 'TG', 'TGO', 'XOF', 'West Africa', 'Emerging', 'Africa'),
    
    -- Central Africa
    ('Congo', 'CG', 'COG', 'XAF', 'Central Africa', 'Emerging', 'Africa'),
    ('Angola', 'AO', 'AGO', 'AOA', 'Central Africa', 'Emerging', 'Africa'),
    
    -- Other
    ('Afghanistan', 'AF', 'AFG', 'AFN', 'Central Asia', 'Emerging', 'Asia'),
    ('Armenia', 'AM', 'ARM', 'AMD', 'Caucasus', 'Emerging', 'Asia'),
    
    -- Western Countries
    ('United Kingdom', 'GB', 'GBR', 'GBP', 'Europe', 'Core', 'Europe'),
    ('United States', 'US', 'USA', 'USD', 'North America', 'Core', 'North America')
ON CONFLICT (country_name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_master_countries_name ON master_countries(country_name);
CREATE INDEX IF NOT EXISTS idx_master_countries_currency ON master_countries(currency_code);
CREATE INDEX IF NOT EXISTS idx_master_countries_region ON master_countries(region);

-- ============================================================================
-- 4. COUNTRY_ALIASES TABLE (Maps alternate names to master_countries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS country_aliases (
    id SERIAL PRIMARY KEY,
    alias_name VARCHAR(100) NOT NULL UNIQUE,
    master_country_id INTEGER NOT NULL REFERENCES master_countries(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert aliases for mismatched country names in sales data
INSERT INTO country_aliases (alias_name, master_country_id)
SELECT 'Cote D''ivoire', id FROM master_countries WHERE country_name = 'Ivory Coast'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (alias_name, master_country_id)
SELECT 'Kingdom Of Saudi Arabia', id FROM master_countries WHERE country_name = 'Saudi Arabia'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (alias_name, master_country_id)
SELECT 'Syrian Arab Republic', id FROM master_countries WHERE country_name = 'Syria'
ON CONFLICT (alias_name) DO NOTHING;

INSERT INTO country_aliases (alias_name, master_country_id)
SELECT 'United States of America', id FROM master_countries WHERE country_name = 'United States'
ON CONFLICT (alias_name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_country_aliases_name ON country_aliases(alias_name);

-- ============================================================================
-- 5. CREATE COUNTRY LOOKUP FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION get_master_country(p_country_name VARCHAR)
RETURNS TABLE (
    country_id INTEGER,
    country_name VARCHAR,
    currency_code VARCHAR,
    region VARCHAR,
    market_type VARCHAR
) AS $$
BEGIN
    -- Try direct match first
    RETURN QUERY
    SELECT mc.id, mc.country_name, mc.currency_code, mc.region, mc.market_type
    FROM master_countries mc
    WHERE UPPER(TRIM(mc.country_name)) = UPPER(TRIM(p_country_name))
    LIMIT 1;
    
    IF NOT FOUND THEN
        -- Try alias match
        RETURN QUERY
        SELECT mc.id, mc.country_name, mc.currency_code, mc.region, mc.market_type
        FROM country_aliases ca
        JOIN master_countries mc ON ca.master_country_id = mc.id
        WHERE UPPER(TRIM(ca.alias_name)) = UPPER(TRIM(p_country_name))
        LIMIT 1;
    END IF;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. UPDATE vw_unified_sales_complete TO INCLUDE COUNTRY METADATA
-- ============================================================================
DROP VIEW IF EXISTS vw_unified_sales_complete CASCADE;

CREATE VIEW vw_unified_sales_complete AS
SELECT 
    -- Customer (with merge support)
    CASE WHEN cu.is_merged = true THEN cu_target.customer_id ELSE cu.customer_id END AS customer_id,
    CASE WHEN cu.is_merged = true THEN cu_target.display_name ELSE cu.display_name END AS customer_name,
    CASE WHEN cu.is_merged = true THEN cu_target.customer_code ELSE cu.customer_code END AS customer_code,
    cu.is_merged,
    
    -- Sales Rep with Group
    sr.sales_rep_id,
    sr.display_name AS sales_rep_name,
    sr.group_id AS sales_rep_group_id,
    sr.group_name AS sales_rep_group_name,
    
    -- Product Group with PG_Combine
    pg.pg_id AS product_group_id,
    d.productgroup AS raw_product_group,
    COALESCE(rpg.pg_combine, d.productgroup) AS pg_combine,
    COALESCE(pg.material, 'Others') AS material,
    COALESCE(pg.process, 'Others') AS process,
    COALESCE(pg.pg_combined, 'Others Others') AS material_process,
    
    -- Country with metadata (NEW)
    d.countryname AS country,
    COALESCE(mc.id, mca.id) AS country_id,
    COALESCE(mc.region, mca.region, 'Unknown') AS country_region,
    COALESCE(mc.market_type, mca.market_type, 'Emerging') AS country_market_type,
    COALESCE(mc.currency_code, mca.currency_code, 'USD') AS country_currency,
    COALESCE(mc.continent, mca.continent, 'Unknown') AS continent,
    
    -- Time dimensions
    d.year,
    d.month,
    
    -- Data type and values
    d.type AS data_type,
    d.values_type,
    d.values,
    
    -- Division and Currency
    d.division,
    COALESCE(cu.company_currency, 'AED') AS company_currency,
    
    -- Currency conversion (for future use)
    COALESCE(er.rate, 1.0) AS exchange_rate_to_aed,
    d.values * COALESCE(er.rate, 1.0) AS values_in_aed

FROM fp_data_excel d
-- Customer unified
LEFT JOIN fp_customer_unified cu 
    ON cu.normalized_name = UPPER(TRIM(d.customername))
LEFT JOIN fp_customer_unified cu_target 
    ON cu.merged_into_id = cu_target.customer_id
-- Sales rep unified
LEFT JOIN fp_sales_rep_unified sr 
    ON sr.normalized_name = UPPER(TRIM(d.salesrepname))
-- Product group mapping
LEFT JOIN fp_raw_product_groups rpg 
    ON UPPER(TRIM(rpg.raw_product_group)) = UPPER(TRIM(d.productgroup))
LEFT JOIN fp_product_group_unified pg 
    ON pg.pg_combine_name = rpg.pg_combine 
    OR pg.normalized_name = UPPER(TRIM(rpg.pg_combine))
-- Country (direct match)
LEFT JOIN master_countries mc 
    ON UPPER(TRIM(mc.country_name)) = UPPER(TRIM(d.countryname))
-- Country (alias match)
LEFT JOIN country_aliases ca 
    ON UPPER(TRIM(ca.alias_name)) = UPPER(TRIM(d.countryname))
LEFT JOIN master_countries mca 
    ON ca.master_country_id = mca.id
-- Exchange rate (country currency to AED)
LEFT JOIN LATERAL (
    SELECT rate FROM exchange_rates 
    WHERE from_currency = COALESCE(mc.currency_code, mca.currency_code, 'USD')
      AND to_currency = 'AED'
    ORDER BY effective_date DESC 
    LIMIT 1
) er ON true;

-- ============================================================================
-- 7. RECREATE MATERIALIZED VIEWS (they depend on the main view)
-- ============================================================================

-- MV: Sales by Customer
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_customer;
CREATE MATERIALIZED VIEW mv_sales_by_customer AS
SELECT 
    customer_id, customer_name, customer_code,
    sales_rep_group_name, country, country_region, country_market_type,
    year, data_type,
    SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
    SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
    SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm
FROM vw_unified_sales_complete
GROUP BY customer_id, customer_name, customer_code, sales_rep_group_name, 
         country, country_region, country_market_type, year, data_type;

CREATE INDEX idx_mv_customer_year ON mv_sales_by_customer(year, customer_id);

-- MV: Sales by Sales Rep Group
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_rep_group;
CREATE MATERIALIZED VIEW mv_sales_by_rep_group AS
SELECT 
    sales_rep_group_id, sales_rep_group_name,
    year, data_type,
    COUNT(DISTINCT customer_id) AS customer_count,
    SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
    SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs
FROM vw_unified_sales_complete
GROUP BY sales_rep_group_id, sales_rep_group_name, year, data_type;

CREATE INDEX idx_mv_rep_group_year ON mv_sales_by_rep_group(year, sales_rep_group_id);

-- MV: Sales by Product Group (PG_Combine)
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_product_group;
CREATE MATERIALIZED VIEW mv_sales_by_product_group AS
SELECT 
    pg_combine, material, process, material_process,
    year, data_type,
    SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
    SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs
FROM vw_unified_sales_complete
GROUP BY pg_combine, material, process, material_process, year, data_type;

CREATE INDEX idx_mv_pg_year ON mv_sales_by_product_group(year, pg_combine);

-- MV: Sales by Country with metadata
DROP MATERIALIZED VIEW IF EXISTS mv_sales_by_country;
CREATE MATERIALIZED VIEW mv_sales_by_country AS
SELECT 
    country, country_id, country_region, country_market_type, 
    country_currency, continent,
    year, data_type,
    COUNT(DISTINCT customer_id) AS customer_count,
    SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
    SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
    SUM(CASE WHEN values_type = 'AMOUNT' THEN values_in_aed ELSE 0 END) AS total_amount_aed
FROM vw_unified_sales_complete
GROUP BY country, country_id, country_region, country_market_type, 
         country_currency, continent, year, data_type;

CREATE INDEX idx_mv_country_year ON mv_sales_by_country(year, country);
CREATE INDEX idx_mv_country_region ON mv_sales_by_country(country_region);

-- ============================================================================
-- 8. REFRESH FUNCTION
-- ============================================================================
DROP FUNCTION IF EXISTS refresh_unified_materialized_views() CASCADE;

CREATE OR REPLACE FUNCTION refresh_unified_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW mv_sales_by_customer;
    REFRESH MATERIALIZED VIEW mv_sales_by_rep_group;
    REFRESH MATERIALIZED VIEW mv_sales_by_product_group;
    REFRESH MATERIALIZED VIEW mv_sales_by_country;
END;
$$ LANGUAGE plpgsql;

-- Initial refresh
SELECT refresh_unified_materialized_views();

-- ============================================================================
-- 9. VERIFICATION
-- ============================================================================
DO $$
DECLARE
    v_currencies INT;
    v_rates INT;
    v_countries INT;
    v_aliases INT;
    v_view_rows INT;
    v_with_country INT;
    v_with_currency INT;
BEGIN
    SELECT COUNT(*) INTO v_currencies FROM currencies;
    SELECT COUNT(*) INTO v_rates FROM exchange_rates;
    SELECT COUNT(*) INTO v_countries FROM master_countries;
    SELECT COUNT(*) INTO v_aliases FROM country_aliases;
    SELECT COUNT(*) INTO v_view_rows FROM vw_unified_sales_complete;
    SELECT COUNT(*) INTO v_with_country FROM vw_unified_sales_complete WHERE country_id IS NOT NULL;
    SELECT COUNT(*) INTO v_with_currency FROM vw_unified_sales_complete WHERE country_currency IS NOT NULL;
    
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'MIGRATION 309 COMPLETE - Country & Currency Reference Tables';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  currencies: % records', v_currencies;
    RAISE NOTICE '  exchange_rates: % records', v_rates;
    RAISE NOTICE '  master_countries: % records', v_countries;
    RAISE NOTICE '  country_aliases: % records', v_aliases;
    RAISE NOTICE '';
    RAISE NOTICE 'View enrichment:';
    RAISE NOTICE '  vw_unified_sales_complete: % rows', v_view_rows;
    RAISE NOTICE '  - With country_id: % (%.1f%%)', v_with_country, (v_with_country::numeric / v_view_rows * 100);
    RAISE NOTICE '  - With country_currency: % (100%%)', v_with_currency;
    RAISE NOTICE '';
    RAISE NOTICE 'New view columns:';
    RAISE NOTICE '  - country_id, country_region, country_market_type';
    RAISE NOTICE '  - country_currency, continent';
    RAISE NOTICE '  - exchange_rate_to_aed, values_in_aed';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
