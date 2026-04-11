/**
 * Rejection Feedback Loop - Database Schema
 *
 * Stores pairs of customers that admin manually rejected
 * AI will skip these pairs in future scans
 */

-- Table to store rejected customer pairs (feedback loop)
CREATE TABLE IF NOT EXISTS merge_rule_rejections (
  id SERIAL PRIMARY KEY,
  division VARCHAR(50) NOT NULL,
  customer1 VARCHAR(500) NOT NULL,
  customer2 VARCHAR(500) NOT NULL,
  rejected_by VARCHAR(100),
  rejected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  rejection_reason TEXT,
  confidence_score DECIMAL(5,4), -- The confidence score when it was suggested

  -- Ensure we don't store duplicate rejections
  UNIQUE(division, customer1, customer2)
);

-- Indexes for fast lookups during AI scan
CREATE INDEX idx_rejection_division ON merge_rule_rejections(division);
CREATE INDEX idx_rejection_customers ON merge_rule_rejections(customer1, customer2);

-- Comments
COMMENT ON TABLE merge_rule_rejections IS 'Stores manually rejected customer merge suggestions for AI feedback loop';
COMMENT ON COLUMN merge_rule_rejections.customer1 IS 'First customer name in the rejected pair (normalized lowercase for matching)';
COMMENT ON COLUMN merge_rule_rejections.customer2 IS 'Second customer name in the rejected pair (normalized lowercase for matching)';
COMMENT ON COLUMN merge_rule_rejections.confidence_score IS 'AI confidence score when this was suggested (helps improve thresholds)';
COMMENT ON COLUMN merge_rule_rejections.rejection_reason IS 'Optional admin note explaining why this was rejected';
