-- AI Report System Tables
-- Creates tables for AI-powered comprehensive division reports
-- Run this migration to add AI report tracking and feedback tables

-- Table: AI Report Insights (stores generated insights for learning)
CREATE TABLE IF NOT EXISTS fp_ai_report_insights (
  id SERIAL PRIMARY KEY,
  report_id UUID NOT NULL DEFAULT gen_random_uuid(),
  insight_type VARCHAR(50) NOT NULL,      -- 'risk', 'recommendation', 'anomaly', 'trend'
  insight_category VARCHAR(100),           -- 'margin', 'customer', 'sales_rep', 'product', 'budget'
  insight_id VARCHAR(100) NOT NULL,        -- Unique identifier for the insight
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(20),                    -- 'critical', 'high', 'medium', 'low', 'positive'
  confidence DECIMAL(5,4),                 -- 0.0000 to 1.0000
  expected_impact DECIMAL(18,2),           -- Monetary impact if applicable
  supporting_data JSONB,                   -- Evidence/data supporting the insight
  period_year INTEGER NOT NULL,
  period_months TEXT[] NOT NULL,
  period_type VARCHAR(20) DEFAULT 'Actual',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER
);

-- Table: AI Report Feedback (tracks user responses to insights)
CREATE TABLE IF NOT EXISTS fp_ai_report_feedback (
  id SERIAL PRIMARY KEY,
  insight_id VARCHAR(100) NOT NULL,
  insight_type VARCHAR(50),
  feedback_type VARCHAR(30) NOT NULL,      -- 'helpful', 'not_helpful', 'acted_upon', 'wrong', 'ignored'
  notes TEXT,
  outcome VARCHAR(50),                      -- 'positive', 'negative', 'neutral', null
  actual_impact DECIMAL(18,2),              -- Actual monetary impact after action
  user_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: AI Report Generation Log (tracks report generation for analytics)
CREATE TABLE IF NOT EXISTS fp_ai_report_log (
  id SERIAL PRIMARY KEY,
  report_id UUID NOT NULL,
  division VARCHAR(10) NOT NULL,
  period_year INTEGER NOT NULL,
  period_months TEXT[],
  period_type VARCHAR(20),
  comparison_year INTEGER,
  comparison_months TEXT[],
  health_score DECIMAL(4,2),
  generation_time_ms INTEGER,
  sections_generated TEXT[],
  user_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: AI Recommendations Tracking
CREATE TABLE IF NOT EXISTS fp_ai_recommendations (
  id SERIAL PRIMARY KEY,
  recommendation_id VARCHAR(100) NOT NULL UNIQUE,
  recommendation_type VARCHAR(50) NOT NULL,  -- 'margin', 'retention', 'budget', 'growth'
  priority INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  expected_impact DECIMAL(18,2),
  impact_description TEXT,
  confidence DECIMAL(5,4),
  actions JSONB,                             -- Array of recommended actions
  effort_level VARCHAR(20),                  -- 'low', 'medium', 'high'
  entity_type VARCHAR(50),                   -- 'customer', 'product', 'sales_rep', 'division'
  entity_name VARCHAR(255),
  period_year INTEGER NOT NULL,
  period_months TEXT[],
  status VARCHAR(30) DEFAULT 'active',       -- 'active', 'acted', 'expired', 'dismissed'
  acted_at TIMESTAMP,
  outcome_measured BOOLEAN DEFAULT FALSE,
  outcome_positive BOOLEAN,
  outcome_notes TEXT,
  measured_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

-- Table: AI Model Performance (tracks prediction accuracy)
CREATE TABLE IF NOT EXISTS fp_ai_model_performance (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(100) NOT NULL,          -- 'health_score', 'risk_prediction', 'recommendation'
  model_version VARCHAR(20),
  metric_name VARCHAR(50) NOT NULL,          -- 'accuracy', 'precision', 'recall', 'helpfulness_rate'
  metric_value DECIMAL(8,4),
  evaluation_period_start DATE,
  evaluation_period_end DATE,
  sample_count INTEGER,
  notes TEXT,
  evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fp_ai_report_insights_type ON fp_ai_report_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_fp_ai_report_insights_category ON fp_ai_report_insights(insight_category);
CREATE INDEX IF NOT EXISTS idx_fp_ai_report_insights_period ON fp_ai_report_insights(period_year, period_months);
CREATE INDEX IF NOT EXISTS idx_fp_ai_report_feedback_insight ON fp_ai_report_feedback(insight_id);
CREATE INDEX IF NOT EXISTS idx_fp_ai_report_feedback_type ON fp_ai_report_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_fp_ai_report_log_division ON fp_ai_report_log(division, period_year);
CREATE INDEX IF NOT EXISTS idx_fp_ai_recommendations_status ON fp_ai_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_fp_ai_recommendations_type ON fp_ai_recommendations(recommendation_type);

-- NOTE: Tables for other divisions (besides FP) are created automatically 
-- by the division sync system when new divisions are added via Company Settings.
-- The sync system clones fp_* tables to {division}_* tables automatically.

-- Add comment for documentation
COMMENT ON TABLE fp_ai_report_insights IS 'Stores AI-generated insights from comprehensive division reports for learning and tracking';
COMMENT ON TABLE fp_ai_report_feedback IS 'Tracks user feedback on AI insights to improve future recommendations';
COMMENT ON TABLE fp_ai_report_log IS 'Logs each AI report generation for analytics and performance tracking';
COMMENT ON TABLE fp_ai_recommendations IS 'Detailed tracking of AI recommendations including outcomes';
COMMENT ON TABLE fp_ai_model_performance IS 'Tracks AI model accuracy and performance over time';

