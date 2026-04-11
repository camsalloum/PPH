-- ========================================================================
-- AI LEARNING SYSTEM TABLES
-- ========================================================================
-- Creates tables for machine learning feedback loop
-- The AI learns from admin decisions and improves over time
-- ========================================================================

-- ========================================================================
-- 1. AI LEARNING DATA (Training Data from Admin Decisions)
-- ========================================================================
-- Captures every approve/reject decision with all feature scores
-- Used to train and optimize algorithm weights
-- ========================================================================

CREATE TABLE IF NOT EXISTS ai_learning_data (
  id SERIAL PRIMARY KEY,
  
  -- Customer pair data
  division VARCHAR(100) NOT NULL,
  customer1 TEXT NOT NULL,
  customer2 TEXT NOT NULL,
  
  -- Normalized versions for analysis
  customer1_normalized TEXT,
  customer2_normalized TEXT,
  
  -- All algorithm similarity scores (features for ML)
  levenshtein_score DECIMAL(5,4),
  jaro_winkler_score DECIMAL(5,4),
  token_set_score DECIMAL(5,4),
  ngram_prefix_score DECIMAL(5,4),
  core_brand_score DECIMAL(5,4),
  phonetic_score DECIMAL(5,4),
  suffix_score DECIMAL(5,4),
  
  -- Additional features
  length_ratio DECIMAL(5,4),           -- shorter/longer length ratio
  word_count_diff INTEGER,              -- difference in word count
  shared_unique_words INTEGER,          -- count of shared non-generic words
  is_prefix_match BOOLEAN,              -- one name starts with the other
  is_substring_match BOOLEAN,           -- one name contains the other
  has_numeric_variance BOOLEAN,         -- one has numbers, other doesn't
  
  -- Combined scores (what AI calculated)
  ai_base_score DECIMAL(5,4),           -- score before penalties
  ai_final_score DECIMAL(5,4),          -- score after penalties
  ai_confidence DECIMAL(5,4),           -- final confidence shown to user
  
  -- Weights used at time of decision (for versioning)
  weights_version INTEGER DEFAULT 1,
  weights_used JSONB,                   -- snapshot of weights when calculated
  
  -- Human decision (the label for training)
  human_decision VARCHAR(20) NOT NULL,  -- 'APPROVED', 'REJECTED', 'MODIFIED'
  decision_source VARCHAR(50),          -- 'SUGGESTION_APPROVE', 'SUGGESTION_REJECT', 'MANUAL_RULE'
  decided_by TEXT,
  decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Feedback for learning
  was_later_reversed BOOLEAN DEFAULT FALSE,  -- If admin later changed their mind
  reversal_reason TEXT,
  
  -- Metadata
  suggestion_id INTEGER,                -- Reference to original suggestion if any
  rule_id INTEGER,                      -- Reference to created rule if approved
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_learning_division ON ai_learning_data(division);
CREATE INDEX IF NOT EXISTS idx_ai_learning_decision ON ai_learning_data(human_decision);
CREATE INDEX IF NOT EXISTS idx_ai_learning_date ON ai_learning_data(decided_at);
CREATE INDEX IF NOT EXISTS idx_ai_learning_confidence ON ai_learning_data(ai_confidence);

-- ========================================================================
-- 2. AI MODEL WEIGHTS (Optimized Weights from Training)
-- ========================================================================
-- Stores optimized weights after retraining
-- Multiple versions allow A/B testing and rollback
-- ========================================================================

CREATE TABLE IF NOT EXISTS ai_model_weights (
  id SERIAL PRIMARY KEY,
  
  -- Weight set identification
  division VARCHAR(100),                 -- NULL = global, specific division = division-specific
  version INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,       -- Currently in use
  
  -- Algorithm weights (must sum to 1.0)
  levenshtein_weight DECIMAL(5,4) DEFAULT 0.10,
  jaro_winkler_weight DECIMAL(5,4) DEFAULT 0.10,
  token_set_weight DECIMAL(5,4) DEFAULT 0.15,
  ngram_prefix_weight DECIMAL(5,4) DEFAULT 0.23,
  core_brand_weight DECIMAL(5,4) DEFAULT 0.22,
  phonetic_weight DECIMAL(5,4) DEFAULT 0.12,
  suffix_weight DECIMAL(5,4) DEFAULT 0.08,
  
  -- Penalty multipliers
  single_word_penalty DECIMAL(5,4) DEFAULT 0.85,
  short_name_penalty DECIMAL(5,4) DEFAULT 0.90,
  length_mismatch_penalty DECIMAL(5,4) DEFAULT 0.85,
  numeric_variance_penalty DECIMAL(5,4) DEFAULT 0.80,
  generic_only_penalty DECIMAL(5,4) DEFAULT 0.40,
  
  -- Boost multipliers
  prefix_match_boost DECIMAL(5,4) DEFAULT 1.15,
  substring_match_min_confidence DECIMAL(5,4) DEFAULT 0.70,
  core_brand_boost_threshold DECIMAL(5,4) DEFAULT 0.90,
  
  -- Training metadata
  training_samples INTEGER,              -- Number of samples used
  training_approved INTEGER,             -- Count of approved samples
  training_rejected INTEGER,             -- Count of rejected samples
  accuracy DECIMAL(5,4),                 -- Cross-validation accuracy
  precision_score DECIMAL(5,4),          -- Precision on positive class
  recall_score DECIMAL(5,4),             -- Recall on positive class
  f1_score DECIMAL(5,4),                 -- F1 score
  
  -- Timestamps
  trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  activated_at TIMESTAMP,
  deactivated_at TIMESTAMP,
  
  -- Notes
  training_notes TEXT,
  
  UNIQUE(division, version)
);

-- Insert default global weights
INSERT INTO ai_model_weights (
  division, version, is_active,
  levenshtein_weight, jaro_winkler_weight, token_set_weight,
  ngram_prefix_weight, core_brand_weight, phonetic_weight, suffix_weight,
  training_notes
) VALUES (
  NULL, 1, TRUE,
  0.10, 0.10, 0.15, 0.23, 0.22, 0.12, 0.08,
  'Initial default weights - not trained yet'
) ON CONFLICT (division, version) DO NOTHING;

-- ========================================================================
-- 3. AI TRAINING HISTORY (Audit Trail)
-- ========================================================================
-- Logs every training run for audit and debugging
-- ========================================================================

CREATE TABLE IF NOT EXISTS ai_training_history (
  id SERIAL PRIMARY KEY,
  
  -- Training run info
  division VARCHAR(100),                 -- NULL = global
  triggered_by TEXT,
  trigger_reason VARCHAR(100),           -- 'MANUAL', 'SCHEDULED', 'THRESHOLD_REACHED'
  
  -- Training data stats
  total_samples INTEGER,
  approved_samples INTEGER,
  rejected_samples INTEGER,
  modified_samples INTEGER,
  
  -- Old vs New comparison
  old_weights_version INTEGER,
  new_weights_version INTEGER,
  old_accuracy DECIMAL(5,4),
  new_accuracy DECIMAL(5,4),
  improvement DECIMAL(5,4),
  
  -- Training details
  algorithm_used VARCHAR(100),           -- 'GRADIENT_DESCENT', 'GRID_SEARCH', etc.
  iterations INTEGER,
  learning_rate DECIMAL(10,8),
  convergence_achieved BOOLEAN,
  
  -- Result
  status VARCHAR(50),                    -- 'SUCCESS', 'FAILED', 'NO_IMPROVEMENT'
  activated BOOLEAN DEFAULT FALSE,       -- Was new model activated?
  
  -- Timestamps
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  
  -- Error tracking
  error_message TEXT,
  
  -- Full logs
  training_log JSONB
);

-- ========================================================================
-- 4. TRANSACTION SIMILARITY CACHE (Phase 2: Transaction-Based Matching)
-- ========================================================================
-- Pre-computed similarity based on transaction patterns
-- Customers who buy same products are likely same entity
-- ========================================================================

CREATE TABLE IF NOT EXISTS transaction_similarity_cache (
  id SERIAL PRIMARY KEY,
  
  division VARCHAR(100) NOT NULL,
  customer1 TEXT NOT NULL,
  customer2 TEXT NOT NULL,
  
  -- Transaction-based signals
  shared_products INTEGER DEFAULT 0,         -- Count of same products purchased
  shared_sales_reps INTEGER DEFAULT 0,       -- Count of same sales reps
  shared_countries INTEGER DEFAULT 0,        -- Count of same countries
  transaction_overlap_score DECIMAL(5,4),    -- Combined transaction similarity
  
  -- Time-based analysis
  first_customer1_transaction DATE,
  last_customer1_transaction DATE,
  first_customer2_transaction DATE,
  last_customer2_transaction DATE,
  overlapping_period_days INTEGER,           -- Days both customers were active
  
  -- Combined with name similarity
  name_similarity_score DECIMAL(5,4),
  combined_score DECIMAL(5,4),               -- name + transaction combined
  
  -- Cache metadata
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_stale BOOLEAN DEFAULT FALSE,            -- Mark for recalculation after upload
  
  UNIQUE(division, customer1, customer2)
);

CREATE INDEX IF NOT EXISTS idx_txn_sim_division ON transaction_similarity_cache(division);
CREATE INDEX IF NOT EXISTS idx_txn_sim_combined ON transaction_similarity_cache(combined_score DESC);
CREATE INDEX IF NOT EXISTS idx_txn_sim_stale ON transaction_similarity_cache(is_stale) WHERE is_stale = TRUE;

-- ========================================================================
-- 5. AI CONFIGURATION (Runtime Settings)
-- ========================================================================
-- Runtime configuration for AI behavior
-- ========================================================================

CREATE TABLE IF NOT EXISTS ai_configuration (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

-- Insert default configuration
INSERT INTO ai_configuration (key, value, description) VALUES
  ('auto_retrain_enabled', 'true', 'Whether to auto-retrain when threshold reached'),
  ('auto_retrain_threshold', '50', 'Number of new decisions before auto-retrain'),
  ('min_training_samples', '20', 'Minimum decisions needed before first training'),
  ('min_improvement_threshold', '0.02', 'Minimum accuracy improvement to activate new weights'),
  ('transaction_similarity_weight', '0.15', 'Weight for transaction-based similarity in combined score'),
  ('last_training_date', NULL, 'Timestamp of last training run'),
  ('pending_decisions_count', '0', 'Count of decisions since last training')
ON CONFLICT (key) DO NOTHING;

-- ========================================================================
-- HELPER FUNCTIONS
-- ========================================================================

-- Function to increment pending decisions count
CREATE OR REPLACE FUNCTION increment_pending_decisions()
RETURNS void AS $$
BEGIN
  UPDATE ai_configuration 
  SET value = (COALESCE(value::INTEGER, 0) + 1)::TEXT,
      updated_at = CURRENT_TIMESTAMP
  WHERE key = 'pending_decisions_count';
END;
$$ LANGUAGE plpgsql;

-- Function to check if retraining should be triggered
CREATE OR REPLACE FUNCTION should_trigger_retraining()
RETURNS BOOLEAN AS $$
DECLARE
  pending INTEGER;
  threshold INTEGER;
  enabled BOOLEAN;
BEGIN
  SELECT value::INTEGER INTO pending FROM ai_configuration WHERE key = 'pending_decisions_count';
  SELECT value::INTEGER INTO threshold FROM ai_configuration WHERE key = 'auto_retrain_threshold';
  SELECT value::BOOLEAN INTO enabled FROM ai_configuration WHERE key = 'auto_retrain_enabled';
  
  RETURN enabled AND pending >= threshold;
END;
$$ LANGUAGE plpgsql;

-- ========================================================================
-- Division-specific tables (run for each division: fp, hc)
-- ========================================================================
-- Note: These are created dynamically per division
-- Example for FP division shown below
-- ========================================================================

-- FP Division AI Learning
CREATE TABLE IF NOT EXISTS fp_ai_learning_data (LIKE ai_learning_data INCLUDING ALL);
CREATE TABLE IF NOT EXISTS fp_ai_model_weights (LIKE ai_model_weights INCLUDING ALL);
CREATE TABLE IF NOT EXISTS fp_ai_training_history (LIKE ai_training_history INCLUDING ALL);
CREATE TABLE IF NOT EXISTS fp_transaction_similarity_cache (LIKE transaction_similarity_cache INCLUDING ALL);

-- HC Division AI Learning
CREATE TABLE IF NOT EXISTS hc_ai_learning_data (LIKE ai_learning_data INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_ai_model_weights (LIKE ai_model_weights INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_ai_training_history (LIKE ai_training_history INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_transaction_similarity_cache (LIKE transaction_similarity_cache INCLUDING ALL);

-- Insert default weights for each division
INSERT INTO fp_ai_model_weights (
  division, version, is_active,
  levenshtein_weight, jaro_winkler_weight, token_set_weight,
  ngram_prefix_weight, core_brand_weight, phonetic_weight, suffix_weight,
  training_notes
) VALUES (
  'FP', 1, TRUE,
  0.10, 0.10, 0.15, 0.23, 0.22, 0.12, 0.08,
  'Initial default weights - not trained yet'
) ON CONFLICT DO NOTHING;

INSERT INTO hc_ai_model_weights (
  division, version, is_active,
  levenshtein_weight, jaro_winkler_weight, token_set_weight,
  ngram_prefix_weight, core_brand_weight, phonetic_weight, suffix_weight,
  training_notes
) VALUES (
  'HC', 1, TRUE,
  0.10, 0.10, 0.15, 0.23, 0.22, 0.12, 0.08,
  'Initial default weights - not trained yet'
) ON CONFLICT DO NOTHING;

-- ========================================================================
-- GRANT PERMISSIONS
-- ========================================================================
-- Ensure proper access rights
-- ========================================================================

GRANT ALL PRIVILEGES ON TABLE ai_learning_data TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE ai_model_weights TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE ai_training_history TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE transaction_similarity_cache TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE ai_configuration TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE fp_ai_learning_data TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE fp_ai_model_weights TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE fp_ai_training_history TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE fp_transaction_similarity_cache TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE hc_ai_learning_data TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE hc_ai_model_weights TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE hc_ai_training_history TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE hc_transaction_similarity_cache TO PUBLIC;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;

SELECT 'AI Learning System tables created successfully!' as result;
