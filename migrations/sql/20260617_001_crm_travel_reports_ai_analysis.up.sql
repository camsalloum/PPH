-- Add AI analysis storage to travel reports
ALTER TABLE crm_travel_reports
  ADD COLUMN IF NOT EXISTS ai_analysis JSONB,
  ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_status VARCHAR(20) DEFAULT 'not_generated'
    CHECK (ai_status IN ('not_generated', 'generated', 'applied_by_rep'));

CREATE INDEX IF NOT EXISTS idx_crm_travel_reports_ai_status
  ON crm_travel_reports(ai_status);
