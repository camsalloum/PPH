-- ============================================================================
-- PROPACKHUB PLATFORM DATABASE SETUP
-- ============================================================================
-- Migration: 001_create_platform_database.sql
-- Description: Creates the central SaaS platform database and core tables
-- Author: GitHub Copilot
-- Date: December 28, 2025
-- ============================================================================

-- Run this in PostgreSQL as superuser to create the database first:
-- CREATE DATABASE propackhub_platform;
-- \c propackhub_platform

-- ============================================================================
-- SUBSCRIPTION PLANS
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  plan_id SERIAL PRIMARY KEY,
  plan_code VARCHAR(50) UNIQUE NOT NULL,
  plan_name VARCHAR(100) NOT NULL,
  
  -- Limits
  max_users INTEGER,
  max_divisions INTEGER,
  max_storage_gb INTEGER,
  
  -- Features
  features JSONB DEFAULT '{}',
  
  -- Pricing
  monthly_price DECIMAL(10,2),
  annual_price DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed subscription plans
INSERT INTO subscription_plans (plan_code, plan_name, max_users, max_divisions, max_storage_gb, features, monthly_price, annual_price) VALUES
('starter', 'Starter', 5, 2, 10, 
  '{"ai_enabled": false, "api_access": false, "export_pdf": true, "export_excel": true}', 
  99.00, 990.00),
('professional', 'Professional', 20, 5, 50, 
  '{"ai_enabled": true, "api_access": true, "export_pdf": true, "export_excel": true, "custom_reports": true}', 
  299.00, 2990.00),
('enterprise', 'Enterprise', NULL, NULL, NULL, 
  '{"ai_enabled": true, "api_access": true, "export_pdf": true, "export_excel": true, "custom_reports": true, "white_label": true, "sla_support": true}', 
  999.00, 9990.00)
ON CONFLICT (plan_code) DO NOTHING;

-- ============================================================================
-- COMPANIES (TENANTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS companies (
  company_id SERIAL PRIMARY KEY,
  company_code VARCHAR(50) UNIQUE NOT NULL,
  company_name VARCHAR(200) NOT NULL,
  database_name VARCHAR(100) UNIQUE NOT NULL,
  
  -- Company Details
  logo_url VARCHAR(500),
  website VARCHAR(200),
  address_line1 VARCHAR(200),
  address_line2 VARCHAR(200),
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100),
  postal_code VARCHAR(20),
  phone VARCHAR(50),
  email VARCHAR(255),
  
  -- Settings
  timezone VARCHAR(50) DEFAULT 'Asia/Dubai',
  currency_code VARCHAR(3) DEFAULT 'AED',
  date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
  fiscal_year_start INTEGER DEFAULT 1, -- Month number (1=January)
  
  -- Subscription
  plan_id INTEGER REFERENCES subscription_plans(plan_id),
  subscription_status VARCHAR(20) DEFAULT 'trial',
  trial_ends_at TIMESTAMP,
  subscription_starts_at TIMESTAMP,
  subscription_ends_at TIMESTAMP,
  
  -- Limits (overrides plan if set)
  max_users INTEGER,
  max_divisions INTEGER,
  max_storage_gb INTEGER,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_demo BOOLEAN DEFAULT false,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER
);

CREATE INDEX idx_companies_code ON companies(company_code);
CREATE INDEX idx_companies_active ON companies(is_active);
CREATE INDEX idx_companies_status ON companies(subscription_status);

-- ============================================================================
-- COMPANY DIVISIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS company_divisions (
  division_id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  division_code VARCHAR(20) NOT NULL,
  division_name VARCHAR(100) NOT NULL,
  
  -- Division Settings
  description TEXT,
  logo_url VARCHAR(500),
  currency_code VARCHAR(3),  -- Override company currency
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(company_id, division_code)
);

CREATE INDEX idx_divisions_company ON company_divisions(company_id);
CREATE INDEX idx_divisions_code ON company_divisions(division_code);

-- ============================================================================
-- PLATFORM USERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_users (
  user_id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(company_id) ON DELETE SET NULL,
  
  -- Identity
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  
  -- Profile
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  display_name VARCHAR(200),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  avatar_url VARCHAR(500),
  job_title VARCHAR(100),
  department VARCHAR(100),
  
  -- Access Control
  role VARCHAR(50) DEFAULT 'user',
  allowed_divisions TEXT[],  -- NULL means all divisions
  permissions JSONB DEFAULT '{}',
  
  -- Platform Admin (can manage multiple companies)
  is_platform_admin BOOLEAN DEFAULT false,
  managed_company_ids INTEGER[],
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  must_change_password BOOLEAN DEFAULT false,
  
  -- Tracking
  last_login_at TIMESTAMP,
  login_count INTEGER DEFAULT 0,
  failed_login_count INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  
  -- Metadata
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER
);

CREATE INDEX idx_users_email ON platform_users(email);
CREATE INDEX idx_users_company ON platform_users(company_id);
CREATE INDEX idx_users_active ON platform_users(is_active);
CREATE INDEX idx_users_platform_admin ON platform_users(is_platform_admin) WHERE is_platform_admin = true;

-- ============================================================================
-- USER ROLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
  role_id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(company_id) ON DELETE CASCADE,
  role_code VARCHAR(50) NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '{}',
  is_system_role BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(company_id, role_code)
);

-- Seed system roles
INSERT INTO user_roles (company_id, role_code, role_name, description, permissions, is_system_role) VALUES
(NULL, 'platform_admin', 'Platform Administrator', 'Full access to all companies and settings', 
  '{"platform": {"companies": "full", "users": "full", "plans": "full"}}', true),
(NULL, 'company_admin', 'Company Administrator', 'Full access to company data and settings',
  '{"company": {"divisions": "full", "users": "full", "settings": "full"}}', true),
(NULL, 'manager', 'Manager', 'Manage division data and view reports',
  '{"division": {"data": "full", "reports": "read", "users": "read"}}', true),
(NULL, 'sales_rep', 'Sales Representative', 'View and edit own sales data',
  '{"division": {"data": "own", "reports": "own"}}', true),
(NULL, 'viewer', 'Viewer', 'Read-only access to reports',
  '{"division": {"reports": "read"}}', true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- USER SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES platform_users(user_id) ON DELETE CASCADE,
  
  -- Token
  token_hash VARCHAR(255) NOT NULL,
  refresh_token_hash VARCHAR(255),
  
  -- Context
  company_id INTEGER REFERENCES companies(company_id),
  current_division VARCHAR(20),
  
  -- Security
  ip_address INET,
  user_agent TEXT,
  device_type VARCHAR(50),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP NOT NULL,
  refresh_expires_at TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_sessions_active ON user_sessions(is_active) WHERE is_active = true;

-- ============================================================================
-- PLATFORM AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_audit_log (
  log_id BIGSERIAL PRIMARY KEY,
  
  -- Who
  user_id INTEGER REFERENCES platform_users(user_id),
  company_id INTEGER REFERENCES companies(company_id),
  
  -- What
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(100),
  
  -- Details
  old_values JSONB,
  new_values JSONB,
  details JSONB,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(100),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON platform_audit_log(user_id);
CREATE INDEX idx_audit_company ON platform_audit_log(company_id);
CREATE INDEX idx_audit_action ON platform_audit_log(action);
CREATE INDEX idx_audit_created ON platform_audit_log(created_at);

-- ============================================================================
-- DATABASE PROVISIONING QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS provisioning_queue (
  queue_id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(company_id),
  
  -- Task
  action VARCHAR(50) NOT NULL,
  priority INTEGER DEFAULT 5,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  
  -- Parameters
  parameters JSONB,
  result JSONB,
  error_message TEXT,
  
  -- Timing
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provision_status ON provisioning_queue(status);
CREATE INDEX idx_provision_scheduled ON provisioning_queue(scheduled_at);

-- ============================================================================
-- INVITE TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS invite_tokens (
  token_id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(company_id),
  
  -- Token
  token_hash VARCHAR(255) NOT NULL,
  
  -- Invitation Details
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  allowed_divisions TEXT[],
  
  -- Status
  is_used BOOLEAN DEFAULT false,
  used_by_user_id INTEGER REFERENCES platform_users(user_id),
  used_at TIMESTAMP,
  
  -- Expiry
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES platform_users(user_id)
);

CREATE INDEX idx_invite_token ON invite_tokens(token_hash);
CREATE INDEX idx_invite_email ON invite_tokens(email);

-- ============================================================================
-- UPDATE TIMESTAMP TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_company_divisions_updated_at BEFORE UPDATE ON company_divisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_users_updated_at BEFORE UPDATE ON platform_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED INTERPLAST AS FIRST COMPANY
-- ============================================================================

-- Insert Interplast as the first company
INSERT INTO companies (
  company_code, 
  company_name, 
  database_name,
  country,
  timezone,
  currency_code,
  plan_id,
  subscription_status,
  is_active,
  onboarding_completed
) VALUES (
  'interplast',
  'Interplast LLC',
  'fp_database',  -- Using existing database name
  'UAE',
  'Asia/Dubai',
  'AED',
  (SELECT plan_id FROM subscription_plans WHERE plan_code = 'enterprise'),
  'active',
  true,
  true
) ON CONFLICT (company_code) DO NOTHING;

-- Add Interplast divisions (only FP - the one with actual data)
-- NOTE: Divisions are created by the SaaS customer, not hardcoded!
-- This is just the demo seed for Interplast's existing FP division
INSERT INTO company_divisions (company_id, division_code, division_name, is_active, sort_order)
SELECT company_id, 'fp', 'Flexible Packaging', true, 1
FROM companies WHERE company_code = 'interplast'
ON CONFLICT (company_id, division_code) DO NOTHING;

-- ============================================================================
-- PLATFORM OWNER (SUPER ADMIN)
-- ============================================================================
-- The ProPackHub platform owner - can manage all companies
-- Password: Change this immediately after first login!
-- Default password is 'ProPackHub2025!' (hashed with bcrypt)

INSERT INTO platform_users (
  company_id,
  email,
  password_hash,
  first_name,
  last_name,
  display_name,
  role,
  is_platform_admin,
  is_active,
  email_verified
) VALUES (
  NULL,  -- Not tied to any company
  'admin@propackhub.com',
  -- Password: ProPackHub2025! (bcrypt hash)
  '$2b$10$8K1p/a0dL1LXMc0RZy4jR.YI8VfW8MRlC7fXvQJH0LT6lK8XQxXXS',
  'Platform',
  'Administrator',
  'ProPackHub Admin',
  'platform_admin',
  true,   -- is_platform_admin
  true,   -- is_active
  true    -- email_verified
) ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'ProPackHub Platform Database Setup Complete';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - subscription_plans (with 3 plans seeded)';
  RAISE NOTICE '  - companies (with Interplast seeded)';
  RAISE NOTICE '  - company_divisions (with FP, HC seeded)';
  RAISE NOTICE '  - platform_users';
  RAISE NOTICE '  - user_roles (with 5 system roles)';
  RAISE NOTICE '  - user_sessions';
  RAISE NOTICE '  - platform_audit_log';
  RAISE NOTICE '  - provisioning_queue';
  RAISE NOTICE '  - invite_tokens';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Migrate existing users to platform_users';
  RAISE NOTICE '  2. Update authentication service';
  RAISE NOTICE '  3. Update connection pooling';
  RAISE NOTICE '============================================';
END $$;
