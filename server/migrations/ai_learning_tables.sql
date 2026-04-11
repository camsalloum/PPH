-- ============================================================================
-- AI LEARNING PLATFORM - DATABASE MIGRATION
-- ============================================================================
-- Purpose: Create all tables required for AI learning capabilities
-- Version: 1.0
-- Date: December 27, 2025
-- 
-- This script creates tables for:
-- 1. Division behavioral history & seasonality
-- 2. Sales rep behavioral history & clustering
-- 3. Customer behavioral history, segmentation & churn prediction
-- 4. Product metrics history & lifecycle
-- 5. Recommendations & feedback tracking
-- 6. Model performance monitoring
-- ============================================================================

-- ============================================================================
-- SECTION 1: DIVISION LEARNING TABLES
-- ============================================================================

-- Division behavioral history (monthly snapshots)
CREATE TABLE IF NOT EXISTS fp_division_behavior_history (
  id SERIAL PRIMARY KEY,
  year INT NOT NULL,
  month INT NOT NULL,
  total_sales DECIMAL(18,2),
  total_volume DECIMAL(18,2),
  total_margin_pct DECIMAL(8,4),
  customer_count INT,
  product_count INT,
  salesrep_count INT,
  avg_order_value DECIMAL(14,2),
  budget_achievement_pct DECIMAL(8,4),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year, month)
);

-- Learned seasonality patterns
CREATE TABLE IF NOT EXISTS fp_learned_seasonality (
  id SERIAL PRIMARY KEY,
  month INT NOT NULL UNIQUE,
  seasonality_factor DECIMAL(8,4) DEFAULT 1.0,  -- e.g., 1.2 = 20% above average
  sales_factor DECIMAL(8,4) DEFAULT 1.0,
  volume_factor DECIMAL(8,4) DEFAULT 1.0,
  confidence DECIMAL(5,4) DEFAULT 0.5,
  samples_used INT DEFAULT 0,
  last_trained TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initialize seasonality with all 12 months
INSERT INTO fp_learned_seasonality (month, seasonality_factor, confidence, samples_used)
SELECT m, 1.0, 0.0, 0 FROM generate_series(1, 12) AS m
ON CONFLICT (month) DO NOTHING;

-- Division predictions
CREATE TABLE IF NOT EXISTS fp_division_predictions (
  id SERIAL PRIMARY KEY,
  prediction_type VARCHAR(50) NOT NULL,  -- 'sales', 'volume', 'margin'
  target_year INT NOT NULL,
  target_month INT NOT NULL,
  predicted_value DECIMAL(18,2),
  actual_value DECIMAL(18,2),
  error_pct DECIMAL(8,4),
  model_version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP
);

-- ============================================================================
-- SECTION 2: SALES REP LEARNING TABLES
-- ============================================================================

-- Sales rep behavioral history
CREATE TABLE IF NOT EXISTS fp_salesrep_behavior_history (
  id SERIAL PRIMARY KEY,
  salesrep_name VARCHAR(255) NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  total_sales DECIMAL(18,2),
  total_volume DECIMAL(18,2),
  customer_count INT,
  product_count INT,
  avg_deal_size DECIMAL(14,2),
  new_customer_count INT DEFAULT 0,
  lost_customer_count INT DEFAULT 0,
  budget_achievement_pct DECIMAL(8,4),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(salesrep_name, year, month)
);

-- Sales rep clusters (learned groupings)
CREATE TABLE IF NOT EXISTS fp_salesrep_clusters (
  id SERIAL PRIMARY KEY,
  salesrep_name VARCHAR(255) NOT NULL UNIQUE,
  cluster_id INT NOT NULL,
  cluster_name VARCHAR(100),  -- 'High Volume', 'Niche Specialist', etc.
  similarity_score DECIMAL(5,4),
  feature_vector JSONB,  -- Normalized features used for clustering
  last_clustered TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales rep learned patterns (strengths/weaknesses)
CREATE TABLE IF NOT EXISTS fp_salesrep_learned_patterns (
  id SERIAL PRIMARY KEY,
  salesrep_name VARCHAR(255) NOT NULL,
  pattern_type VARCHAR(50) NOT NULL,  -- 'strength', 'weakness', 'tendency'
  pattern_key VARCHAR(100) NOT NULL,  -- 'large_customers', 'product_group_X', etc.
  pattern_value DECIMAL(8,4),
  confidence DECIMAL(5,4),
  samples_used INT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(salesrep_name, pattern_type, pattern_key)
);

-- Sales rep coaching recommendations history
CREATE TABLE IF NOT EXISTS fp_salesrep_coaching_history (
  id SERIAL PRIMARY KEY,
  salesrep_name VARCHAR(255) NOT NULL,
  recommendation_text TEXT NOT NULL,
  recommendation_type VARCHAR(50),
  priority INT DEFAULT 5,
  was_followed BOOLEAN,
  outcome_measured BOOLEAN DEFAULT FALSE,
  outcome_positive BOOLEAN,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  followed_at TIMESTAMP,
  measured_at TIMESTAMP
);

-- ============================================================================
-- SECTION 3: CUSTOMER LEARNING TABLES
-- ============================================================================

-- Customer behavioral history
CREATE TABLE IF NOT EXISTS fp_customer_behavior_history (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  salesrep_name VARCHAR(255),
  year INT NOT NULL,
  month INT NOT NULL,
  total_sales DECIMAL(18,2),
  total_volume DECIMAL(18,2),
  product_count INT,
  order_frequency DECIMAL(8,4),  -- Orders per period (if trackable)
  avg_order_size DECIMAL(14,2),
  days_since_last_order INT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_name, year, month)
);

-- Customer segments (learned clustering)
CREATE TABLE IF NOT EXISTS fp_customer_segments (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL UNIQUE,
  segment_id INT NOT NULL,
  segment_name VARCHAR(100),  -- 'Loyal-Growing', 'At-Risk', 'High-Value', etc.
  segment_probability DECIMAL(5,4),
  feature_vector JSONB,
  last_segmented TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Churn predictions
CREATE TABLE IF NOT EXISTS fp_customer_churn_predictions (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  churn_probability DECIMAL(5,4) NOT NULL,
  risk_level VARCHAR(20),  -- 'HIGH', 'MEDIUM', 'LOW'
  top_risk_factors JSONB,  -- ['declining_volume', 'no_orders_60d', ...]
  prediction_horizon_days INT DEFAULT 90,
  model_version INT DEFAULT 1,
  predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  prediction_date DATE DEFAULT CURRENT_DATE,
  actual_churned BOOLEAN,
  verified_at TIMESTAMP,
  UNIQUE(customer_name, prediction_date)
);

-- Customer lifetime value
CREATE TABLE IF NOT EXISTS fp_customer_lifetime_value (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  predicted_clv DECIMAL(18,2),
  clv_confidence_low DECIMAL(18,2),
  clv_confidence_high DECIMAL(18,2),
  customer_age_months INT,
  avg_monthly_value DECIMAL(14,2),
  growth_rate DECIMAL(8,4),
  model_version INT DEFAULT 1,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer anomalies
CREATE TABLE IF NOT EXISTS fp_customer_anomalies (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  anomaly_type VARCHAR(50),  -- 'volume_spike', 'volume_drop', 'new_product', etc.
  anomaly_severity VARCHAR(20),  -- 'LOW', 'MEDIUM', 'HIGH'
  expected_value DECIMAL(18,2),
  actual_value DECIMAL(18,2),
  deviation_pct DECIMAL(8,4),
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by VARCHAR(255),
  acknowledged_at TIMESTAMP
);

-- ============================================================================
-- SECTION 4: PRODUCT LEARNING TABLES
-- ============================================================================

-- Product metrics history
CREATE TABLE IF NOT EXISTS fp_product_metrics_history (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  total_sales DECIMAL(18,2),
  total_volume DECIMAL(18,2),
  avg_selling_price DECIMAL(12,4),
  customer_count INT,
  budget_variance_pct DECIMAL(8,4),
  yoy_growth_pct DECIMAL(8,4),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_group, year, month)
);

-- Product lifecycle classification
CREATE TABLE IF NOT EXISTS fp_product_lifecycle (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL UNIQUE,
  lifecycle_stage VARCHAR(50),  -- 'introduction', 'growth', 'mature', 'decline'
  stage_probability DECIMAL(5,4),
  months_in_stage INT,
  predicted_next_stage VARCHAR(50),
  transition_probability DECIMAL(5,4),
  model_version INT DEFAULT 1,
  classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Learned thresholds (division-specific)
CREATE TABLE IF NOT EXISTS fp_learned_thresholds (
  id SERIAL PRIMARY KEY,
  threshold_type VARCHAR(50) NOT NULL UNIQUE,  -- 'underperformance_volume', 'growth_trigger', etc.
  threshold_value DECIMAL(8,4),
  baseline_value DECIMAL(8,4),  -- Original hardcoded value
  confidence DECIMAL(5,4) DEFAULT 0.5,
  samples_used INT DEFAULT 0,
  is_active BOOLEAN DEFAULT FALSE,  -- Only active after sufficient training
  learned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initialize with baseline thresholds
INSERT INTO fp_learned_thresholds (threshold_type, threshold_value, baseline_value, confidence)
VALUES 
  ('underperformance_volume_pct', -15.0, -15.0, 0.0),
  ('underperformance_amount_pct', -15.0, -15.0, 0.0),
  ('growth_volume_pct', 10.0, 10.0, 0.0),
  ('growth_amount_pct', 10.0, 10.0, 0.0),
  ('yoy_decline_trigger', -10.0, -10.0, 0.0),
  ('yoy_growth_trigger', 15.0, 15.0, 0.0),
  ('asp_change_highlight', 5.0, 5.0, 0.0),
  ('runrate_warning', 0.85, 0.85, 0.0),
  ('churn_probability_high', 0.7, 0.7, 0.0),
  ('churn_probability_medium', 0.4, 0.4, 0.0)
ON CONFLICT (threshold_type) DO NOTHING;

-- Product demand forecasts
CREATE TABLE IF NOT EXISTS fp_product_forecasts (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL,
  forecast_type VARCHAR(50),  -- 'volume', 'sales'
  target_year INT NOT NULL,
  target_month INT NOT NULL,
  predicted_value DECIMAL(18,2),
  confidence_low DECIMAL(18,2),
  confidence_high DECIMAL(18,2),
  actual_value DECIMAL(18,2),
  model_version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SECTION 5: RECOMMENDATIONS & FEEDBACK TABLES
-- ============================================================================

-- Drop existing fp_ai_recommendations if it exists (has incompatible schema)
DROP TABLE IF EXISTS fp_recommendation_feedback CASCADE;
DROP TABLE IF EXISTS fp_ai_recommendations CASCADE;

-- AI Recommendations
CREATE TABLE IF NOT EXISTS fp_ai_recommendations (
  id SERIAL PRIMARY KEY,
  recommendation_type VARCHAR(50) NOT NULL,  -- 'customer_action', 'product_action', 'rep_coaching'
  entity_type VARCHAR(50),  -- 'customer', 'product_group', 'salesrep', 'division'
  entity_name VARCHAR(255),
  priority_score DECIMAL(8,4),
  confidence DECIMAL(5,4),
  recommendation_text TEXT NOT NULL,
  supporting_evidence JSONB,
  expected_impact_value DECIMAL(18,2),
  expected_impact_pct DECIMAL(8,4),
  effort_level VARCHAR(20),  -- 'LOW', 'MEDIUM', 'HIGH'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  acted_upon BOOLEAN DEFAULT FALSE,
  acted_upon_at TIMESTAMP,
  acted_upon_by VARCHAR(255),
  outcome_measured BOOLEAN DEFAULT FALSE,
  outcome_positive BOOLEAN,
  outcome_notes TEXT,
  measured_at TIMESTAMP
);

-- Recommendation feedback
CREATE TABLE IF NOT EXISTS fp_recommendation_feedback (
  id SERIAL PRIMARY KEY,
  recommendation_id INT REFERENCES fp_ai_recommendations(id),
  feedback_type VARCHAR(20) NOT NULL,  -- 'helpful', 'not_helpful', 'inaccurate', 'already_known'
  feedback_notes TEXT,
  given_by VARCHAR(255),
  given_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insight feedback (for the AI report)
CREATE TABLE IF NOT EXISTS fp_insight_feedback (
  id SERIAL PRIMARY KEY,
  insight_id VARCHAR(100) NOT NULL,  -- e.g., 'alert_0', 'rep_John', 'customer_Acme'
  insight_type VARCHAR(50),  -- 'alert', 'warning', 'sales_rep', 'customer', 'product'
  feedback_type VARCHAR(20) NOT NULL,  -- 'helpful', 'not_helpful'
  division VARCHAR(10) NOT NULL,
  user_id VARCHAR(255),
  report_date DATE,
  given_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SECTION 6: MODEL PERFORMANCE TRACKING
-- ============================================================================

-- Model performance tracking
CREATE TABLE IF NOT EXISTS fp_model_performance (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(100) NOT NULL,  -- 'churn_prediction', 'demand_forecast', 'seasonality'
  model_version INT NOT NULL,
  metric_name VARCHAR(50) NOT NULL,  -- 'accuracy', 'precision', 'recall', 'mae', 'rmse', 'mape'
  metric_value DECIMAL(8,4),
  evaluation_period_start DATE,
  evaluation_period_end DATE,
  sample_count INT,
  evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Training history (like the existing ai_training_history but generalized)
CREATE TABLE IF NOT EXISTS fp_ai_training_history (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(100) NOT NULL,
  model_version INT NOT NULL,
  training_samples INT,
  validation_samples INT,
  training_loss DECIMAL(10,6),
  validation_loss DECIMAL(10,6),
  hyperparameters JSONB,
  feature_importance JSONB,
  training_duration_ms INT,
  trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SECTION 7: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Division indexes
CREATE INDEX IF NOT EXISTS idx_div_behavior_year_month ON fp_division_behavior_history(year, month);

-- Sales rep indexes
CREATE INDEX IF NOT EXISTS idx_salesrep_behavior_name ON fp_salesrep_behavior_history(salesrep_name);
CREATE INDEX IF NOT EXISTS idx_salesrep_behavior_period ON fp_salesrep_behavior_history(year, month);
CREATE INDEX IF NOT EXISTS idx_salesrep_clusters_cluster ON fp_salesrep_clusters(cluster_id);

-- Customer indexes
CREATE INDEX IF NOT EXISTS idx_customer_behavior_name ON fp_customer_behavior_history(customer_name);
CREATE INDEX IF NOT EXISTS idx_customer_behavior_period ON fp_customer_behavior_history(year, month);
CREATE INDEX IF NOT EXISTS idx_customer_segments_segment ON fp_customer_segments(segment_id);
CREATE INDEX IF NOT EXISTS idx_customer_churn_risk ON fp_customer_churn_predictions(risk_level);
CREATE INDEX IF NOT EXISTS idx_customer_churn_date ON fp_customer_churn_predictions(predicted_at);

-- Product indexes
CREATE INDEX IF NOT EXISTS idx_product_metrics_group ON fp_product_metrics_history(product_group);
CREATE INDEX IF NOT EXISTS idx_product_metrics_period ON fp_product_metrics_history(year, month);
CREATE INDEX IF NOT EXISTS idx_product_lifecycle_stage ON fp_product_lifecycle(lifecycle_stage);

-- Recommendations indexes
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON fp_ai_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_recommendations_entity ON fp_ai_recommendations(entity_type, entity_name);
CREATE INDEX IF NOT EXISTS idx_recommendations_active ON fp_ai_recommendations(is_active);
CREATE INDEX IF NOT EXISTS idx_insight_feedback_insight ON fp_insight_feedback(insight_id);

-- Model performance indexes
CREATE INDEX IF NOT EXISTS idx_model_perf_name ON fp_model_performance(model_name);

-- ============================================================================
-- SECTION 8: COPY TABLES FOR HC DIVISION
-- ============================================================================

-- Repeat for HC division (same structure, different prefix)
-- Division behavior
CREATE TABLE IF NOT EXISTS hc_division_behavior_history (LIKE fp_division_behavior_history INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_learned_seasonality (LIKE fp_learned_seasonality INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_division_predictions (LIKE fp_division_predictions INCLUDING ALL);

-- Sales rep
CREATE TABLE IF NOT EXISTS hc_salesrep_behavior_history (LIKE fp_salesrep_behavior_history INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_salesrep_clusters (LIKE fp_salesrep_clusters INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_salesrep_learned_patterns (LIKE fp_salesrep_learned_patterns INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_salesrep_coaching_history (LIKE fp_salesrep_coaching_history INCLUDING ALL);

-- Customer
CREATE TABLE IF NOT EXISTS hc_customer_behavior_history (LIKE fp_customer_behavior_history INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_customer_segments (LIKE fp_customer_segments INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_customer_churn_predictions (LIKE fp_customer_churn_predictions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_customer_lifetime_value (LIKE fp_customer_lifetime_value INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_customer_anomalies (LIKE fp_customer_anomalies INCLUDING ALL);

-- Product
CREATE TABLE IF NOT EXISTS hc_product_metrics_history (LIKE fp_product_metrics_history INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_product_lifecycle (LIKE fp_product_lifecycle INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_learned_thresholds (LIKE fp_learned_thresholds INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_product_forecasts (LIKE fp_product_forecasts INCLUDING ALL);

-- Recommendations
CREATE TABLE IF NOT EXISTS hc_ai_recommendations (LIKE fp_ai_recommendations INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_recommendation_feedback (LIKE fp_recommendation_feedback INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_insight_feedback (LIKE fp_insight_feedback INCLUDING ALL);

-- Model tracking
CREATE TABLE IF NOT EXISTS hc_model_performance (LIKE fp_model_performance INCLUDING ALL);
CREATE TABLE IF NOT EXISTS hc_ai_training_history (LIKE fp_ai_training_history INCLUDING ALL);

-- Initialize HC seasonality
INSERT INTO hc_learned_seasonality (month, seasonality_factor, confidence, samples_used)
SELECT m, 1.0, 0.0, 0 FROM generate_series(1, 12) AS m
ON CONFLICT (month) DO NOTHING;

-- Initialize HC thresholds
INSERT INTO hc_learned_thresholds (threshold_type, threshold_value, baseline_value, confidence)
VALUES 
  ('underperformance_volume_pct', -15.0, -15.0, 0.0),
  ('underperformance_amount_pct', -15.0, -15.0, 0.0),
  ('growth_volume_pct', 10.0, 10.0, 0.0),
  ('growth_amount_pct', 10.0, 10.0, 0.0),
  ('yoy_decline_trigger', -10.0, -10.0, 0.0),
  ('yoy_growth_trigger', 15.0, 15.0, 0.0),
  ('asp_change_highlight', 5.0, 5.0, 0.0),
  ('runrate_warning', 0.85, 0.85, 0.0),
  ('churn_probability_high', 0.7, 0.7, 0.0),
  ('churn_probability_medium', 0.4, 0.4, 0.0)
ON CONFLICT (threshold_type) DO NOTHING;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'AI Learning Platform tables created successfully';
  RAISE NOTICE 'Created tables for: Division, SalesRep, Customer, Product, Recommendations, Model Performance';
  RAISE NOTICE 'Tables created for both FP and HC divisions';
END $$;
