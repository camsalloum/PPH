-- Rollback: remove external source dedup support

DROP INDEX IF EXISTS idx_crm_activities_source_ref_unique;

ALTER TABLE crm_activities
  DROP COLUMN IF EXISTS source_ref_id,
  DROP COLUMN IF EXISTS source;
