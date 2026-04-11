-- ============================================================================
-- CRM FOUNDATION TABLES
-- Migration: 100_create_crm_foundation.sql
-- Created: 2025-12-27
-- Description: Creates the foundational CRM tables for flexible packaging
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CUSTOMER MASTER
-- Core customer entity with full business information
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_master (
  customer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_code VARCHAR(50) UNIQUE NOT NULL,
  
  -- Basic Info
  company_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  short_name VARCHAR(100),
  
  -- Classification
  customer_type VARCHAR(50) DEFAULT 'Prospect',  -- Prospect, Active Customer, Inactive, Churned
  customer_category VARCHAR(50),  -- Direct, Distributor, Converter, End User
  industry VARCHAR(100),  -- FMCG, Pharma, F&B, Industrial, Personal Care
  market_segment VARCHAR(100),  -- Snacks, Beverages, Dairy, Confectionery, etc.
  
  -- Territory & Assignment
  country VARCHAR(100),
  region VARCHAR(100),
  territory VARCHAR(100),
  assigned_salesrep VARCHAR(255),  -- Links to existing salesrep data
  assigned_salesrep_id UUID,  -- Optional FK to employees/users
  
  -- Financial
  credit_limit DECIMAL(18,2) DEFAULT 0,
  credit_used DECIMAL(18,2) DEFAULT 0,
  payment_terms VARCHAR(100),  -- Net 30, Net 60, etc.
  currency VARCHAR(10) DEFAULT 'AED',
  tax_id VARCHAR(50),  -- VAT/TRN number
  
  -- Primary Contact (quick reference)
  primary_contact_name VARCHAR(255),
  primary_email VARCHAR(255),
  primary_phone VARCHAR(50),
  
  -- Address (primary)
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  
  -- Business Data
  annual_revenue DECIMAL(18,2),
  employee_count VARCHAR(50),  -- 1-10, 11-50, 51-200, etc.
  website VARCHAR(255),
  linkedin_url VARCHAR(255),
  
  -- Lead Source & Conversion
  lead_source VARCHAR(100),  -- Website, Exhibition, Referral, Cold Call, Email Campaign
  lead_source_details TEXT,
  lead_date DATE,
  conversion_date DATE,
  converted_from_lead_id UUID,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_key_account BOOLEAN DEFAULT false,
  rating VARCHAR(20),  -- A, B, C, D
  tags TEXT[],  -- ['key_account', 'food_grade', 'high_barrier', 'pharma_certified']
  
  -- Integration with existing sales data
  legacy_customer_names TEXT[],  -- Array of names from fp_data_excel for matching
  data_source VARCHAR(50) DEFAULT 'manual',  -- manual, import, excel_sync
  
  -- Internal Notes
  internal_notes TEXT,
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Full-text search optimization
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', 
      COALESCE(company_name, '') || ' ' || 
      COALESCE(display_name, '') || ' ' ||
      COALESCE(customer_code, '') || ' ' ||
      COALESCE(primary_email, '') || ' ' ||
      COALESCE(city, '') || ' ' ||
      COALESCE(country, '') || ' ' ||
      COALESCE(industry, '') || ' ' ||
      COALESCE(array_to_string(tags, ' '), '')
    )
  ) STORED
);

COMMENT ON TABLE customer_master IS 'Master table for all customer/prospect records in CRM';
COMMENT ON COLUMN customer_master.legacy_customer_names IS 'Array of customer names from fp_data_excel for backward compatibility matching';

-- ============================================================================
-- CUSTOMER CONTACTS
-- Multiple contacts per customer with permission flags
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_contacts (
  contact_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customer_master(customer_id) ON DELETE CASCADE,
  
  -- Contact Details
  salutation VARCHAR(20),  -- Mr., Mrs., Ms., Dr., etc.
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  job_title VARCHAR(100),
  department VARCHAR(100),
  
  -- Communication
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  whatsapp VARCHAR(50),
  fax VARCHAR(50),
  
  -- Permission Flags (important for flex-pack workflow)
  is_primary BOOLEAN DEFAULT false,
  can_approve_samples BOOLEAN DEFAULT false,
  can_approve_quotes BOOLEAN DEFAULT false,
  can_place_orders BOOLEAN DEFAULT false,
  receives_invoices BOOLEAN DEFAULT false,
  receives_delivery_notifications BOOLEAN DEFAULT false,
  
  -- Preferences
  is_active BOOLEAN DEFAULT true,
  preferred_language VARCHAR(10) DEFAULT 'en',
  preferred_contact_method VARCHAR(50),  -- Email, Phone, WhatsApp
  timezone VARCHAR(50),
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE customer_contacts IS 'Contact persons for each customer with approval permissions';
COMMENT ON COLUMN customer_contacts.can_approve_samples IS 'Whether this contact can approve samples on behalf of customer';
COMMENT ON COLUMN customer_contacts.can_approve_quotes IS 'Whether this contact can accept quotations';

-- ============================================================================
-- CUSTOMER ADDRESSES
-- Multiple addresses per customer (billing, shipping, plant locations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_addresses (
  address_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customer_master(customer_id) ON DELETE CASCADE,
  
  address_type VARCHAR(50) NOT NULL,  -- Billing, Shipping, Plant, Warehouse, Head Office
  address_name VARCHAR(255),  -- e.g., "Dubai Factory", "Abu Dhabi Warehouse"
  is_default BOOLEAN DEFAULT false,
  
  -- Address Fields
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  
  -- Location Contact
  contact_person VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  
  -- Delivery Info
  delivery_instructions TEXT,
  receiving_hours VARCHAR(100),  -- e.g., "8AM-4PM Sunday-Thursday"
  
  -- Coordinates (for logistics)
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE customer_addresses IS 'Multiple addresses per customer for billing, shipping, plants';

-- ============================================================================
-- CUSTOMER ACTIVITY LOG
-- Track all interactions with customers
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_activity_log (
  activity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customer_master(customer_id) ON DELETE CASCADE,
  
  activity_type VARCHAR(50) NOT NULL,  -- Note, Call, Email, Meeting, Visit, Status Change
  activity_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  subject VARCHAR(255),
  description TEXT,
  
  -- For calls/meetings
  duration_minutes INT,
  outcome VARCHAR(100),  -- Successful, No Answer, Left Message, Rescheduled
  
  -- Follow-up
  next_action TEXT,
  next_action_date DATE,
  
  -- Related entities
  related_lead_id UUID,
  related_opportunity_id UUID,
  related_sample_id UUID,
  related_quotation_id UUID,
  
  -- Metadata
  performed_by UUID,
  performed_by_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE customer_activity_log IS 'Activity history for all customer interactions';

-- ============================================================================
-- NUMBER SEQUENCES
-- ============================================================================

-- Customer code sequence
CREATE SEQUENCE IF NOT EXISTS customer_code_seq START WITH 1;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate customer code: CUS-2025-0001
CREATE OR REPLACE FUNCTION generate_customer_code()
RETURNS VARCHAR(50) AS $$
DECLARE
  new_code VARCHAR(50);
  year_part VARCHAR(4);
  seq_num INT;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
  seq_num := NEXTVAL('customer_code_seq');
  new_code := 'CUS-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_customer_code IS 'Generates sequential customer codes in format CUS-YYYY-NNNN';

-- Update timestamp trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamp on customer_master
DROP TRIGGER IF EXISTS customer_master_updated_at ON customer_master;
CREATE TRIGGER customer_master_updated_at
  BEFORE UPDATE ON customer_master
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update timestamp on customer_contacts
DROP TRIGGER IF EXISTS customer_contacts_updated_at ON customer_contacts;
CREATE TRIGGER customer_contacts_updated_at
  BEFORE UPDATE ON customer_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update timestamp on customer_addresses
DROP TRIGGER IF EXISTS customer_addresses_updated_at ON customer_addresses;
CREATE TRIGGER customer_addresses_updated_at
  BEFORE UPDATE ON customer_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Customer Master indexes
CREATE INDEX IF NOT EXISTS idx_customer_master_code ON customer_master(customer_code);
CREATE INDEX IF NOT EXISTS idx_customer_master_company ON customer_master(company_name);
CREATE INDEX IF NOT EXISTS idx_customer_master_salesrep ON customer_master(assigned_salesrep);
CREATE INDEX IF NOT EXISTS idx_customer_master_type ON customer_master(customer_type);
CREATE INDEX IF NOT EXISTS idx_customer_master_country ON customer_master(country);
CREATE INDEX IF NOT EXISTS idx_customer_master_industry ON customer_master(industry);
CREATE INDEX IF NOT EXISTS idx_customer_master_active ON customer_master(is_active);
CREATE INDEX IF NOT EXISTS idx_customer_master_key_account ON customer_master(is_key_account) WHERE is_key_account = true;
CREATE INDEX IF NOT EXISTS idx_customer_master_search ON customer_master USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_customer_master_legacy ON customer_master USING GIN(legacy_customer_names);
CREATE INDEX IF NOT EXISTS idx_customer_master_tags ON customer_master USING GIN(tags);

-- Customer Contacts indexes
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_primary ON customer_contacts(customer_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_customer_contacts_email ON customer_contacts(email);

-- Customer Addresses indexes
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_type ON customer_addresses(customer_id, address_type);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default ON customer_addresses(customer_id, is_default) WHERE is_default = true;

-- Customer Activity Log indexes
CREATE INDEX IF NOT EXISTS idx_customer_activity_customer ON customer_activity_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_activity_date ON customer_activity_log(activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_customer_activity_type ON customer_activity_log(activity_type);

-- ============================================================================
-- DEFAULT DATA
-- ============================================================================

-- Customer types lookup
CREATE TABLE IF NOT EXISTS crm_lookup_customer_types (
  type_id SERIAL PRIMARY KEY,
  type_name VARCHAR(50) NOT NULL UNIQUE,
  type_order INT,
  is_active BOOLEAN DEFAULT true
);

INSERT INTO crm_lookup_customer_types (type_name, type_order) VALUES
('Prospect', 1),
('Active Customer', 2),
('Inactive', 3),
('Churned', 4),
('Partner', 5)
ON CONFLICT (type_name) DO NOTHING;

-- Customer categories lookup
CREATE TABLE IF NOT EXISTS crm_lookup_customer_categories (
  category_id SERIAL PRIMARY KEY,
  category_name VARCHAR(50) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true
);

INSERT INTO crm_lookup_customer_categories (category_name) VALUES
('Direct'),
('Distributor'),
('Converter'),
('End User'),
('Trader'),
('OEM')
ON CONFLICT (category_name) DO NOTHING;

-- Industries lookup
CREATE TABLE IF NOT EXISTS crm_lookup_industries (
  industry_id SERIAL PRIMARY KEY,
  industry_name VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true
);

INSERT INTO crm_lookup_industries (industry_name) VALUES
('FMCG'),
('Food & Beverage'),
('Dairy'),
('Snacks & Confectionery'),
('Personal Care'),
('Pharmaceuticals'),
('Pet Food'),
('Agricultural'),
('Industrial'),
('Chemicals'),
('Healthcare'),
('Other')
ON CONFLICT (industry_name) DO NOTHING;

-- Market segments lookup
CREATE TABLE IF NOT EXISTS crm_lookup_market_segments (
  segment_id SERIAL PRIMARY KEY,
  segment_name VARCHAR(100) NOT NULL UNIQUE,
  industry VARCHAR(100),
  is_active BOOLEAN DEFAULT true
);

INSERT INTO crm_lookup_market_segments (segment_name, industry) VALUES
('Chips & Snacks', 'Snacks & Confectionery'),
('Biscuits', 'Snacks & Confectionery'),
('Chocolate', 'Snacks & Confectionery'),
('Coffee', 'Food & Beverage'),
('Tea', 'Food & Beverage'),
('Spices', 'Food & Beverage'),
('Rice & Grains', 'Food & Beverage'),
('Dairy Products', 'Dairy'),
('Cheese', 'Dairy'),
('Ice Cream', 'Dairy'),
('Shampoo & Soap', 'Personal Care'),
('Detergent', 'Personal Care'),
('Tablets & Capsules', 'Pharmaceuticals'),
('Nutraceuticals', 'Pharmaceuticals'),
('Pet Food Dry', 'Pet Food'),
('Pet Food Wet', 'Pet Food'),
('Fertilizers', 'Agricultural'),
('Seeds', 'Agricultural')
ON CONFLICT (segment_name) DO NOTHING;

-- Lead sources lookup
CREATE TABLE IF NOT EXISTS crm_lookup_lead_sources (
  source_id SERIAL PRIMARY KEY,
  source_name VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true
);

INSERT INTO crm_lookup_lead_sources (source_name) VALUES
('Website'),
('Exhibition'),
('Referral'),
('Cold Call'),
('Email Campaign'),
('LinkedIn'),
('Trade Publication'),
('Walk-in'),
('Existing Customer'),
('Partner Referral'),
('Google Search'),
('Other')
ON CONFLICT (source_name) DO NOTHING;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Customer summary view with aggregated data
CREATE OR REPLACE VIEW v_customer_summary AS
SELECT 
  cm.customer_id,
  cm.customer_code,
  cm.company_name,
  cm.display_name,
  cm.customer_type,
  cm.customer_category,
  cm.industry,
  cm.country,
  cm.assigned_salesrep,
  cm.is_active,
  cm.is_key_account,
  cm.credit_limit,
  cm.tags,
  cm.created_at,
  
  -- Contact count
  (SELECT COUNT(*) FROM customer_contacts cc WHERE cc.customer_id = cm.customer_id) as contact_count,
  
  -- Primary contact
  (SELECT first_name || ' ' || COALESCE(last_name, '') 
   FROM customer_contacts cc 
   WHERE cc.customer_id = cm.customer_id AND cc.is_primary = true 
   LIMIT 1) as primary_contact,
  
  -- Address count
  (SELECT COUNT(*) FROM customer_addresses ca WHERE ca.customer_id = cm.customer_id) as address_count,
  
  -- Last activity
  (SELECT MAX(activity_date) 
   FROM customer_activity_log cal 
   WHERE cal.customer_id = cm.customer_id) as last_activity_date

FROM customer_master cm;

COMMENT ON VIEW v_customer_summary IS 'Aggregated customer view with contact and activity counts';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'CRM Foundation tables created successfully';
  RAISE NOTICE 'Tables created: customer_master, customer_contacts, customer_addresses, customer_activity_log';
  RAISE NOTICE 'Lookup tables created: crm_lookup_customer_types, crm_lookup_customer_categories, crm_lookup_industries, crm_lookup_market_segments, crm_lookup_lead_sources';
END $$;
