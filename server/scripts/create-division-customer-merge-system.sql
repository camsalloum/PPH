-- ========================================================================
-- Division-Level Customer Merge System - Database Schema
-- ========================================================================
-- This script creates the new AI-powered, division-level customer merge system
-- that replaces the sales rep-specific approach with a centralized solution.
-- ========================================================================

-- 0. Ensure the updated_at trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$func$ language 'plpgsql';

-- ========================================================================
-- 1. DIVISION CUSTOMER MERGE RULES (Main Table)
-- ========================================================================
-- Stores division-level customer merge rules (sales rep independent)
-- This is the new "single source of truth" for customer merging
-- ========================================================================

CREATE TABLE IF NOT EXISTS division_customer_merge_rules (
  id SERIAL PRIMARY KEY,

  -- Core merge rule data
  division VARCHAR(100) NOT NULL,
  merged_customer_name VARCHAR(500) NOT NULL,
  original_customers JSONB NOT NULL,  -- Array of customer names to merge

  -- Rule metadata
  rule_source VARCHAR(50) NOT NULL DEFAULT 'ADMIN_CREATED',
  -- Values: 'AI_SUGGESTED', 'ADMIN_CREATED', 'ADMIN_EDITED', 'MIGRATED_FROM_SALES_REP'

  confidence_score DECIMAL(3,2),  -- 0.00 to 1.00 (for AI suggestions)

  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  -- Values: 'PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'INACTIVE'

  -- Audit trail - Who created/modified this rule
  created_by VARCHAR(255),
  suggested_at TIMESTAMP,
  suggested_by VARCHAR(255),  -- 'AI_ENGINE' or username
  reviewed_at TIMESTAMP,
  reviewed_by VARCHAR(255),
  approved_at TIMESTAMP,
  approved_by VARCHAR(255),

  -- Validation status (updated after database uploads)
  last_validated_at TIMESTAMP,
  validation_status VARCHAR(50) DEFAULT 'VALID',
  -- Values: 'VALID', 'NEEDS_UPDATE', 'ORPHANED', 'NOT_VALIDATED'

  validation_notes JSONB,  -- Stores AI suggestions for fixes

  -- Standard timestamps
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  UNIQUE(division, merged_customer_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_div_merge_division ON division_customer_merge_rules(division);
CREATE INDEX IF NOT EXISTS idx_div_merge_status ON division_customer_merge_rules(status);
CREATE INDEX IF NOT EXISTS idx_div_merge_source ON division_customer_merge_rules(rule_source);
CREATE INDEX IF NOT EXISTS idx_div_merge_validation ON division_customer_merge_rules(validation_status);
CREATE INDEX IF NOT EXISTS idx_div_merge_active ON division_customer_merge_rules(division, is_active, status);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_division_customer_merge_rules_updated_at ON division_customer_merge_rules;
CREATE TRIGGER update_division_customer_merge_rules_updated_at
  BEFORE UPDATE ON division_customer_merge_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================================================
-- 2. MERGE RULE SUGGESTIONS (AI Suggestions Queue)
-- ========================================================================
-- Stores AI-generated merge suggestions waiting for admin review
-- Also serves as training data for improving the AI model
-- ========================================================================

CREATE TABLE IF NOT EXISTS merge_rule_suggestions (
  id SERIAL PRIMARY KEY,

  -- Suggestion data
  division VARCHAR(100) NOT NULL,
  suggested_merge_name VARCHAR(500),
  customer_group JSONB NOT NULL,  -- Array of customers AI thinks should be merged

  -- AI confidence and methodology
  confidence_score DECIMAL(3,2),
  matching_algorithm VARCHAR(100),  -- 'FUZZY_STRING', 'LEVENSHTEIN', 'MULTI_ALGORITHM', etc.
  match_details JSONB,  -- Detailed similarity scores for transparency

  -- Admin review
  admin_action VARCHAR(50) DEFAULT 'PENDING',
  -- Values: 'APPROVED', 'REJECTED', 'MODIFIED', 'PENDING'

  suggested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  reviewed_by VARCHAR(255),
  feedback_notes TEXT,

  -- AI learning feedback
  was_correct BOOLEAN,  -- True if admin approved without changes

  -- Link to created rule (if approved)
  created_rule_id INTEGER REFERENCES division_customer_merge_rules(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_suggestions_division ON merge_rule_suggestions(division);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON merge_rule_suggestions(admin_action);
CREATE INDEX IF NOT EXISTS idx_suggestions_confidence ON merge_rule_suggestions(confidence_score);

-- ========================================================================
-- 3. DATABASE UPLOAD LOG (Upload Tracking)
-- ========================================================================
-- Tracks all database uploads to trigger validation and detect changes
-- ========================================================================

CREATE TABLE IF NOT EXISTS database_upload_log (
  id SERIAL PRIMARY KEY,

  -- Upload metadata
  division VARCHAR(100) NOT NULL,
  upload_type VARCHAR(50) NOT NULL,  -- 'ACTUAL', 'BUDGET', 'ESTIMATE'
  upload_mode VARCHAR(50) NOT NULL,  -- 'UPSERT', 'REPLACE'
  file_name VARCHAR(500),
  uploaded_by VARCHAR(255),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Data changes detected
  customer_count INTEGER,
  new_customers JSONB,      -- List of customers that appeared
  removed_customers JSONB,  -- Customers that disappeared (REPLACE mode)
  changed_customers JSONB,  -- Customers with name changes detected

  -- Validation tracking
  validation_triggered BOOLEAN DEFAULT false,
  validation_completed_at TIMESTAMP,
  rules_affected INTEGER DEFAULT 0,
  rules_broken INTEGER DEFAULT 0,

  -- Summary
  upload_summary JSONB  -- Overall stats (row count, date range, etc.)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_upload_log_division ON database_upload_log(division);
CREATE INDEX IF NOT EXISTS idx_upload_log_date ON database_upload_log(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_upload_log_validation ON database_upload_log(validation_triggered);

-- ========================================================================
-- 4. ADMIN NOTIFICATIONS (Alert System)
-- ========================================================================
-- Stores notifications for admins about merge rule issues
-- ========================================================================

CREATE TABLE IF NOT EXISTS merge_rule_notifications (
  id SERIAL PRIMARY KEY,

  -- Notification details
  division VARCHAR(100) NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  -- Values: 'RULES_NEED_VALIDATION', 'NEW_AI_SUGGESTIONS', 'UPLOAD_COMPLETED'

  title VARCHAR(500) NOT NULL,
  message TEXT,
  severity VARCHAR(20) DEFAULT 'INFO',  -- 'INFO', 'WARNING', 'ERROR'

  -- Related data
  related_upload_id INTEGER REFERENCES database_upload_log(id) ON DELETE SET NULL,
  affected_rules_count INTEGER DEFAULT 0,

  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  read_by VARCHAR(255),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_division ON merge_rule_notifications(division);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON merge_rule_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON merge_rule_notifications(created_at);

-- ========================================================================
-- 5. CUSTOMER SIMILARITY CACHE (Performance Optimization)
-- ========================================================================
-- Caches AI similarity calculations to avoid recalculating
-- ========================================================================

CREATE TABLE IF NOT EXISTS customer_similarity_cache (
  id SERIAL PRIMARY KEY,

  division VARCHAR(100) NOT NULL,
  customer_a VARCHAR(500) NOT NULL,
  customer_b VARCHAR(500) NOT NULL,

  -- Similarity scores
  overall_similarity DECIMAL(3,2),
  levenshtein_score DECIMAL(3,2),
  jaro_winkler_score DECIMAL(3,2),
  token_set_score DECIMAL(3,2),

  -- Cache metadata
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  algorithm_version VARCHAR(20) DEFAULT '1.0',

  UNIQUE(division, customer_a, customer_b)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_similarity_division ON customer_similarity_cache(division);
CREATE INDEX IF NOT EXISTS idx_similarity_score ON customer_similarity_cache(overall_similarity);

-- ========================================================================
-- COMMENTS (Documentation)
-- ========================================================================

COMMENT ON TABLE division_customer_merge_rules IS 'Division-level customer merge rules (sales rep independent)';
COMMENT ON TABLE merge_rule_suggestions IS 'AI-generated merge suggestions awaiting admin review';
COMMENT ON TABLE database_upload_log IS 'Tracks database uploads and triggers validation';
COMMENT ON TABLE merge_rule_notifications IS 'Admin notifications about merge rule issues';
COMMENT ON TABLE customer_similarity_cache IS 'Performance cache for AI similarity calculations';

COMMENT ON COLUMN division_customer_merge_rules.validation_status IS 'VALID: all customers exist, NEEDS_UPDATE: some missing, ORPHANED: none found';
COMMENT ON COLUMN merge_rule_suggestions.was_correct IS 'Training data: true if admin approved without modifications';
COMMENT ON COLUMN database_upload_log.upload_mode IS 'UPSERT: partial update, REPLACE: full replacement';

-- ========================================================================
-- SUCCESS MESSAGE
-- ========================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Division-level customer merge system tables created successfully!';
  RAISE NOTICE '📊 Created tables:';
  RAISE NOTICE '   - division_customer_merge_rules (main rules table)';
  RAISE NOTICE '   - merge_rule_suggestions (AI suggestions queue)';
  RAISE NOTICE '   - database_upload_log (upload tracking)';
  RAISE NOTICE '   - merge_rule_notifications (admin alerts)';
  RAISE NOTICE '   - customer_similarity_cache (performance optimization)';
END $$;
