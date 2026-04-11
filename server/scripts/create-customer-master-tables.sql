-- ============================================================================
-- CUSTOMER MASTER DATA MODULE - DATABASE SCHEMA
-- ============================================================================
-- Created: December 23, 2025
-- Purpose: Create foundation tables for Customer Master Data module
-- Priority: HIGH
-- ============================================================================

-- This script creates division-specific tables. 
-- Replace {div} with actual division code (fp, ipd, pp, etc.)
-- Or run through the Node.js setup script which handles this automatically.

-- ============================================================================
-- SEQUENCE TABLE FOR CODE GENERATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS {div}_code_sequences (
  id SERIAL PRIMARY KEY,
  sequence_type VARCHAR(50) NOT NULL,  -- 'customer', 'merge', 'group', etc.
  year INTEGER NOT NULL,
  current_value INTEGER DEFAULT 0,
  division VARCHAR(50) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(sequence_type, year, division)
);

COMMENT ON TABLE {div}_code_sequences IS 'Tracks sequence numbers for generating unique codes';

-- ============================================================================
-- 1. CUSTOMER MASTER TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS {div}_customer_master (
  id SERIAL PRIMARY KEY,
  
  -- Unique identification
  customer_code VARCHAR(50) UNIQUE NOT NULL,  -- e.g., 'FP-CUST-2025-00001'
  
  -- Core information
  customer_name VARCHAR(500) NOT NULL,
  customer_name_normalized VARCHAR(500),  -- Lowercase, no suffixes, for matching
  customer_type VARCHAR(50) DEFAULT 'Company',  -- 'Company', 'Individual', 'Partnership'
  
  -- Classification (will be FK when hierarchy tables are created)
  customer_group VARCHAR(255),
  territory VARCHAR(255),
  industry VARCHAR(255),
  market_segment VARCHAR(100),
  
  -- Contact information
  primary_contact VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  website VARCHAR(255),
  
  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100) DEFAULT 'UAE',
  postal_code VARCHAR(20),
  
  -- Business details
  tax_id VARCHAR(100),
  trade_license VARCHAR(100),
  credit_limit DECIMAL(15,2),
  payment_terms VARCHAR(100),
  default_currency VARCHAR(10) DEFAULT 'AED',
  
  -- Sales assignment
  account_manager VARCHAR(255),
  sales_rep VARCHAR(255),
  
  -- Status flags
  is_active BOOLEAN DEFAULT true,
  is_merged BOOLEAN DEFAULT false,
  merged_into_code VARCHAR(50),  -- Points to parent customer if merged
  
  -- Metadata
  division VARCHAR(50) NOT NULL,
  notes TEXT,
  
  -- Audit fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  updated_by VARCHAR(100)
);

-- Indexes for customer_master
CREATE INDEX IF NOT EXISTS idx_{div}_customer_master_code ON {div}_customer_master(customer_code);
CREATE INDEX IF NOT EXISTS idx_{div}_customer_master_name ON {div}_customer_master(customer_name);
CREATE INDEX IF NOT EXISTS idx_{div}_customer_master_normalized ON {div}_customer_master(customer_name_normalized);
CREATE INDEX IF NOT EXISTS idx_{div}_customer_master_division ON {div}_customer_master(division);
CREATE INDEX IF NOT EXISTS idx_{div}_customer_master_active ON {div}_customer_master(is_active);
CREATE INDEX IF NOT EXISTS idx_{div}_customer_master_group ON {div}_customer_master(customer_group);
CREATE INDEX IF NOT EXISTS idx_{div}_customer_master_territory ON {div}_customer_master(territory);
CREATE INDEX IF NOT EXISTS idx_{div}_customer_master_sales_rep ON {div}_customer_master(sales_rep);

-- Full text search index for customer name
CREATE INDEX IF NOT EXISTS idx_{div}_customer_master_name_search 
ON {div}_customer_master USING gin(to_tsvector('english', customer_name));

COMMENT ON TABLE {div}_customer_master IS 'Master table for all customer data - single source of truth';
COMMENT ON COLUMN {div}_customer_master.customer_code IS 'Unique identifier in format: {DIV}-CUST-{YEAR}-{SEQUENCE}';
COMMENT ON COLUMN {div}_customer_master.customer_name_normalized IS 'Lowercase name without business suffixes for matching';
COMMENT ON COLUMN {div}_customer_master.merged_into_code IS 'If merged, points to the parent customer code';

-- ============================================================================
-- 2. CUSTOMER ALIASES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS {div}_customer_aliases (
  id SERIAL PRIMARY KEY,
  
  -- Link to master customer
  customer_code VARCHAR(50) NOT NULL,
  
  -- Alias information
  alias_name VARCHAR(500) NOT NULL,  -- The name variation
  alias_name_normalized VARCHAR(500) NOT NULL,  -- Normalized for matching
  
  -- Source tracking
  source_system VARCHAR(50),  -- 'EXCEL_UPLOAD', 'BUDGET', 'MANUAL', 'AI_DETECTED'
  source_file VARCHAR(255),
  source_table VARCHAR(100),
  
  -- Occurrence tracking
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  occurrence_count INTEGER DEFAULT 1,
  
  -- AI matching info (if auto-linked)
  ai_confidence DECIMAL(3,2),
  ai_matched_at TIMESTAMP,
  
  -- Status
  is_primary BOOLEAN DEFAULT false,  -- Is this the primary/canonical name?
  is_verified BOOLEAN DEFAULT false,  -- Has admin verified this alias?
  verified_by VARCHAR(100),
  verified_at TIMESTAMP,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  
  -- Constraints
  FOREIGN KEY (customer_code) REFERENCES {div}_customer_master(customer_code) ON DELETE CASCADE,
  UNIQUE(customer_code, alias_name_normalized)
);

-- Indexes for customer_aliases
CREATE INDEX IF NOT EXISTS idx_{div}_customer_aliases_code ON {div}_customer_aliases(customer_code);
CREATE INDEX IF NOT EXISTS idx_{div}_customer_aliases_name ON {div}_customer_aliases(alias_name);
CREATE INDEX IF NOT EXISTS idx_{div}_customer_aliases_normalized ON {div}_customer_aliases(alias_name_normalized);
CREATE INDEX IF NOT EXISTS idx_{div}_customer_aliases_source ON {div}_customer_aliases(source_system);
CREATE INDEX IF NOT EXISTS idx_{div}_customer_aliases_primary ON {div}_customer_aliases(is_primary) WHERE is_primary = true;

COMMENT ON TABLE {div}_customer_aliases IS 'Stores all known name variations for each customer';
COMMENT ON COLUMN {div}_customer_aliases.alias_name IS 'Original name as found in source system';
COMMENT ON COLUMN {div}_customer_aliases.alias_name_normalized IS 'Normalized name for deduplication matching';
COMMENT ON COLUMN {div}_customer_aliases.is_primary IS 'True if this is the canonical/official name';

-- ============================================================================
-- 3. UPDATE MERGE RULES TABLE - ADD MERGE CODE
-- ============================================================================

-- Add merge_code column to existing merge rules table
DO $$
BEGIN
  -- Add merge_code column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = '{div}_division_customer_merge_rules' 
    AND column_name = 'merge_code'
  ) THEN
    ALTER TABLE {div}_division_customer_merge_rules 
    ADD COLUMN merge_code VARCHAR(50) UNIQUE;
  END IF;
  
  -- Add master_customer_code column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = '{div}_division_customer_merge_rules' 
    AND column_name = 'master_customer_code'
  ) THEN
    ALTER TABLE {div}_division_customer_merge_rules 
    ADD COLUMN master_customer_code VARCHAR(50);
  END IF;
END $$;

-- Create index on merge_code
CREATE INDEX IF NOT EXISTS idx_{div}_merge_rules_code ON {div}_division_customer_merge_rules(merge_code);

COMMENT ON COLUMN {div}_division_customer_merge_rules.merge_code IS 'Unique merge code in format: {DIV}-MRG-{YEAR}-{SEQUENCE}';
COMMENT ON COLUMN {div}_division_customer_merge_rules.master_customer_code IS 'Reference to customer_master for the merged entity';

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Function to get next sequence number
CREATE OR REPLACE FUNCTION {div}_get_next_sequence(
  p_sequence_type VARCHAR(50),
  p_year INTEGER,
  p_division VARCHAR(50)
) RETURNS INTEGER AS $$
DECLARE
  v_next_val INTEGER;
BEGIN
  -- Insert or update sequence
  INSERT INTO {div}_code_sequences (sequence_type, year, division, current_value)
  VALUES (p_sequence_type, p_year, p_division, 1)
  ON CONFLICT (sequence_type, year, division) 
  DO UPDATE SET 
    current_value = {div}_code_sequences.current_value + 1,
    updated_at = CURRENT_TIMESTAMP
  RETURNING current_value INTO v_next_val;
  
  RETURN v_next_val;
END;
$$ LANGUAGE plpgsql;

-- Function to generate customer code
CREATE OR REPLACE FUNCTION {div}_generate_customer_code(
  p_division VARCHAR(50)
) RETURNS VARCHAR(50) AS $$
DECLARE
  v_year INTEGER;
  v_sequence INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_TIMESTAMP);
  v_sequence := {div}_get_next_sequence('customer', v_year, p_division);
  RETURN UPPER(p_division) || '-CUST-' || v_year || '-' || LPAD(v_sequence::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to generate merge code
CREATE OR REPLACE FUNCTION {div}_generate_merge_code(
  p_division VARCHAR(50)
) RETURNS VARCHAR(50) AS $$
DECLARE
  v_year INTEGER;
  v_sequence INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_TIMESTAMP);
  v_sequence := {div}_get_next_sequence('merge', v_year, p_division);
  RETURN UPPER(p_division) || '-MRG-' || v_year || '-' || LPAD(v_sequence::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to normalize customer name
CREATE OR REPLACE FUNCTION {div}_normalize_customer_name(
  p_name VARCHAR(500)
) RETURNS VARCHAR(500) AS $$
BEGIN
  RETURN LOWER(
    TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(p_name, '\b(llc|l\.l\.c|l\.l\.c\.|ltd|limited|inc|incorporated|corp|corporation|co|company|est|establishment|fze|fzc|fzco|plc|pllc)\b', '', 'gi'),
          '[^\w\s]', '', 'g'
        ),
        '\s+', ' ', 'g'
      )
    )
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

-- Trigger to auto-generate customer_code on insert
CREATE OR REPLACE FUNCTION {div}_customer_master_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate customer_code if not provided
  IF NEW.customer_code IS NULL OR NEW.customer_code = '' THEN
    NEW.customer_code := {div}_generate_customer_code(NEW.division);
  END IF;
  
  -- Normalize customer name
  IF NEW.customer_name_normalized IS NULL OR NEW.customer_name_normalized = '' THEN
    NEW.customer_name_normalized := {div}_normalize_customer_name(NEW.customer_name);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_{div}_customer_master_before_insert ON {div}_customer_master;
CREATE TRIGGER trg_{div}_customer_master_before_insert
  BEFORE INSERT ON {div}_customer_master
  FOR EACH ROW
  EXECUTE FUNCTION {div}_customer_master_before_insert();

-- Trigger to auto-normalize alias name on insert
CREATE OR REPLACE FUNCTION {div}_customer_aliases_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Normalize alias name
  IF NEW.alias_name_normalized IS NULL OR NEW.alias_name_normalized = '' THEN
    NEW.alias_name_normalized := {div}_normalize_customer_name(NEW.alias_name);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_{div}_customer_aliases_before_insert ON {div}_customer_aliases;
CREATE TRIGGER trg_{div}_customer_aliases_before_insert
  BEFORE INSERT ON {div}_customer_aliases
  FOR EACH ROW
  EXECUTE FUNCTION {div}_customer_aliases_before_insert();

-- Trigger to update updated_at on customer_master
CREATE OR REPLACE FUNCTION {div}_customer_master_before_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  
  -- Re-normalize if name changed
  IF NEW.customer_name <> OLD.customer_name THEN
    NEW.customer_name_normalized := {div}_normalize_customer_name(NEW.customer_name);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_{div}_customer_master_before_update ON {div}_customer_master;
CREATE TRIGGER trg_{div}_customer_master_before_update
  BEFORE UPDATE ON {div}_customer_master
  FOR EACH ROW
  EXECUTE FUNCTION {div}_customer_master_before_update();

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Customer Master Data tables created successfully!';
  RAISE NOTICE '📊 Created tables:';
  RAISE NOTICE '   - {div}_code_sequences (sequence tracking)';
  RAISE NOTICE '   - {div}_customer_master (main customer table)';
  RAISE NOTICE '   - {div}_customer_aliases (name variations)';
  RAISE NOTICE '   - Updated {div}_division_customer_merge_rules (added merge_code)';
  RAISE NOTICE '📊 Created functions:';
  RAISE NOTICE '   - {div}_get_next_sequence()';
  RAISE NOTICE '   - {div}_generate_customer_code()';
  RAISE NOTICE '   - {div}_generate_merge_code()';
  RAISE NOTICE '   - {div}_normalize_customer_name()';
END $$;
