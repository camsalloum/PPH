-- Rollback: Remove geolocation fields from fp_prospects.

DROP INDEX IF EXISTS idx_fp_prospects_lat_lng;

ALTER TABLE IF EXISTS fp_prospects
  DROP COLUMN IF EXISTS address_line1,
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS longitude,
  DROP COLUMN IF EXISTS latitude;
