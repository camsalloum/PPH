-- ============================================================
-- MIGRATION 300: Create Unified Customer Master Table
-- ============================================================
-- Purpose: Single source of truth for all customer data
-- Created: January 1, 2026
-- ============================================================

-- Step 1: Create the unified customer table
CREATE TABLE IF NOT EXISTS fp_customer_unified (
  customer_id SERIAL PRIMARY KEY,
  customer_code VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(500) NOT NULL,
  normalized_name VARCHAR(500) NOT NULL,
  
  -- Merge status
  is_active BOOLEAN DEFAULT TRUE,
  is_merged BOOLEAN DEFAULT FALSE,
  merged_into_id INTEGER REFERENCES fp_customer_unified(customer_id),
  original_names TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Sales rep assignment (will be linked after sales_rep_unified is created)
  primary_sales_rep_name VARCHAR(200),
  
  -- Geography
  primary_country VARCHAR(100),
  countries TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Aggregated metrics
  total_amount_all_time DECIMAL(18,2) DEFAULT 0,
  total_kgs_all_time DECIMAL(18,2) DEFAULT 0,
  total_morm_all_time DECIMAL(18,2) DEFAULT 0,
  first_transaction_date DATE,
  last_transaction_date DATE,
  transaction_years INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  
  -- CRM fields (migrated from fp_customer_master)
  customer_type VARCHAR(50),
  customer_group VARCHAR(100),
  industry VARCHAR(100),
  market_segment VARCHAR(100),
  credit_limit DECIMAL(15,2),
  payment_terms VARCHAR(50),
  default_currency VARCHAR(10) DEFAULT 'AED',
  
  -- Contact info
  primary_contact VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  website VARCHAR(200),
  
  -- Address
  address_line1 VARCHAR(500),
  address_line2 VARCHAR(500),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(50),
  
  -- Map fields
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  pin_confirmed BOOLEAN DEFAULT FALSE,
  pin_source VARCHAR(50),
  pin_confirmed_by VARCHAR(100),
  pin_confirmed_at TIMESTAMP,
  
  -- Administrative
  division VARCHAR(10) DEFAULT 'FP',
  notes TEXT,
  tax_id VARCHAR(50),
  trade_license VARCHAR(50),
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'migration',
  updated_by VARCHAR(100) DEFAULT 'migration'
);

-- Step 2: Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_cust_unified_norm ON fp_customer_unified(normalized_name);
CREATE INDEX IF NOT EXISTS idx_cust_unified_active ON fp_customer_unified(is_active, is_merged);
CREATE INDEX IF NOT EXISTS idx_cust_unified_country ON fp_customer_unified(primary_country);
CREATE INDEX IF NOT EXISTS idx_cust_unified_sales_rep ON fp_customer_unified(primary_sales_rep_name);
CREATE INDEX IF NOT EXISTS idx_cust_unified_division ON fp_customer_unified(division);

-- Step 3: Populate from fp_data_excel (563 unique customers)
-- First, create a temp table with aggregations
WITH customer_agg AS (
  SELECT 
    UPPER(TRIM(customername)) AS norm_name,
    MIN(customername) AS display_name,
    ARRAY_AGG(DISTINCT countryname) AS countries,
    SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
    SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
    SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
    MIN(MAKE_DATE(year, month, 1)) AS first_transaction_date,
    MAX(MAKE_DATE(year, month, 1)) AS last_transaction_date,
    ARRAY_AGG(DISTINCT year ORDER BY year) AS transaction_years
  FROM fp_data_excel
  GROUP BY UPPER(TRIM(customername))
),
customer_sales_rep AS (
  SELECT DISTINCT ON (UPPER(TRIM(customername)))
    UPPER(TRIM(customername)) AS norm_name,
    salesrepname
  FROM fp_data_excel
  GROUP BY UPPER(TRIM(customername)), salesrepname
  ORDER BY UPPER(TRIM(customername)), COUNT(*) DESC
),
customer_country AS (
  SELECT DISTINCT ON (UPPER(TRIM(customername)))
    UPPER(TRIM(customername)) AS norm_name,
    countryname
  FROM fp_data_excel
  GROUP BY UPPER(TRIM(customername)), countryname
  ORDER BY UPPER(TRIM(customername)), COUNT(*) DESC
)
INSERT INTO fp_customer_unified (
  customer_code,
  display_name,
  normalized_name,
  primary_sales_rep_name,
  primary_country,
  countries,
  total_amount_all_time,
  total_kgs_all_time,
  total_morm_all_time,
  first_transaction_date,
  last_transaction_date,
  transaction_years,
  division
)
SELECT 
  'FP-CUST-' || LPAD(ROW_NUMBER() OVER (ORDER BY ca.display_name)::TEXT, 5, '0') AS customer_code,
  ca.display_name,
  ca.norm_name AS normalized_name,
  csr.salesrepname AS primary_sales_rep_name,
  cc.countryname AS primary_country,
  ca.countries,
  ca.total_amount,
  ca.total_kgs,
  ca.total_morm,
  ca.first_transaction_date,
  ca.last_transaction_date,
  ca.transaction_years,
  'FP' AS division
FROM customer_agg ca
LEFT JOIN customer_sales_rep csr ON ca.norm_name = csr.norm_name
LEFT JOIN customer_country cc ON ca.norm_name = cc.norm_name
ON CONFLICT (customer_code) DO NOTHING;

-- Step 4: Copy CRM data from fp_customer_master (contact, map, etc.)
UPDATE fp_customer_unified cu
SET 
  customer_type = cm.customer_type,
  customer_group = cm.customer_group,
  industry = cm.industry,
  market_segment = cm.market_segment,
  credit_limit = cm.credit_limit,
  payment_terms = cm.payment_terms,
  default_currency = cm.default_currency,
  primary_contact = cm.primary_contact,
  email = cm.email,
  phone = cm.phone,
  mobile = cm.mobile,
  website = cm.website,
  address_line1 = cm.address_line1,
  address_line2 = cm.address_line2,
  city = cm.city,
  state = cm.state,
  postal_code = cm.postal_code,
  latitude = cm.latitude,
  longitude = cm.longitude,
  pin_confirmed = cm.pin_confirmed,
  pin_source = cm.pin_source,
  pin_confirmed_by = cm.pin_confirmed_by,
  pin_confirmed_at = cm.pin_confirmed_at,
  notes = cm.notes,
  tax_id = cm.tax_id,
  trade_license = cm.trade_license,
  updated_at = NOW()
FROM fp_customer_master cm
WHERE cu.normalized_name = UPPER(TRIM(cm.customer_name));

-- Step 5: Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_customer_unified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_unified_updated ON fp_customer_unified;
CREATE TRIGGER trg_customer_unified_updated
  BEFORE UPDATE ON fp_customer_unified
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_unified_timestamp();

-- Step 6: Output summary
DO $$
DECLARE
  total_count INTEGER;
  with_crm INTEGER;
  with_coords INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM fp_customer_unified;
  SELECT COUNT(*) INTO with_crm FROM fp_customer_unified WHERE customer_type IS NOT NULL;
  SELECT COUNT(*) INTO with_coords FROM fp_customer_unified WHERE latitude IS NOT NULL;
  
  RAISE NOTICE '=== MIGRATION 300 COMPLETE ===';
  RAISE NOTICE 'Total customers created: %', total_count;
  RAISE NOTICE 'With CRM data: %', with_crm;
  RAISE NOTICE 'With map coordinates: %', with_coords;
END $$;
