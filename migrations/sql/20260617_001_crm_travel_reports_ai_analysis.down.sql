-- Rollback AI analysis storage columns from travel reports
DROP INDEX IF EXISTS idx_crm_travel_reports_ai_status;

ALTER TABLE crm_travel_reports
  DROP COLUMN IF EXISTS ai_status,
  DROP COLUMN IF EXISTS ai_generated_at,
  DROP COLUMN IF EXISTS ai_analysis;
