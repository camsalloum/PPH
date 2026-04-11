-- DESCRIPTION: Add source/source_ref_id and unique dedup index for external activity ingestion
-- ROLLBACK: SAFE
-- DATA LOSS: NO

ALTER TABLE crm_activities
  ADD COLUMN IF NOT EXISTS source VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_ref_id VARCHAR(500);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_activities_source_ref_unique
  ON crm_activities(source, source_ref_id)
  WHERE source IS NOT NULL AND source_ref_id IS NOT NULL;
