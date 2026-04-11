-- Migration: Add geolocation fields to fp_prospects for route planning and map-based visit prep.

ALTER TABLE IF EXISTS fp_prospects
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS address_line1 TEXT;

CREATE INDEX IF NOT EXISTS idx_fp_prospects_lat_lng
  ON fp_prospects (latitude, longitude);
