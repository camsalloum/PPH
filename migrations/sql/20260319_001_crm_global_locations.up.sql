-- Shared company locations library for field-trip location stops

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS crm_locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  label VARCHAR(50),
  country VARCHAR(100),
  country_code_2 VARCHAR(2),
  city VARCHAR(100),
  address TEXT,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'trip_stop',
  place_id VARCHAR(150),
  use_count INTEGER NOT NULL DEFAULT 0,
  added_by INTEGER,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_locations_label_chk CHECK (label IS NULL OR label IN ('hotel','airport','meeting','restaurant','office','waypoint','other')),
  CONSTRAINT crm_locations_source_chk CHECK (source IN ('trip_stop','manual','imported','google')),
  CONSTRAINT crm_locations_coords_uniq UNIQUE (latitude, longitude)
);

CREATE TABLE IF NOT EXISTS crm_location_trip_usage (
  trip_id INTEGER NOT NULL REFERENCES crm_field_trips(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES crm_locations(id) ON DELETE CASCADE,
  first_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trip_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_locations_country_label
  ON crm_locations (country, label);

CREATE INDEX IF NOT EXISTS idx_crm_locations_country_code_label
  ON crm_locations (country_code_2, label);

CREATE INDEX IF NOT EXISTS idx_crm_locations_name_trgm
  ON crm_locations USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_crm_locations_last_used
  ON crm_locations (last_used_at DESC NULLS LAST, use_count DESC);

-- Seed shared library from historical location/custom stops with coordinates
WITH distinct_stops AS (
  SELECT DISTINCT ON (ROUND(COALESCE(s.latitude, 0)::numeric, 7), ROUND(COALESCE(s.longitude, 0)::numeric, 7))
         TRIM(SPLIT_PART(COALESCE(s.address_snapshot, ''), ',', 1)) AS name,
         CASE
           WHEN LOWER(COALESCE(s.custom_label, '')) IN ('hotel','airport','meeting','restaurant','office','waypoint','other')
             THEN LOWER(s.custom_label)
           ELSE NULL
         END AS label,
         NULLIF(TRIM(s.stop_country), '') AS country,
         CASE
           WHEN s.stop_country ~ '^[A-Za-z]{2}$' THEN UPPER(s.stop_country)
           ELSE NULL
         END AS country_code_2,
         NULLIF(TRIM(COALESCE(s.address_snapshot, '')), '') AS address,
         ROUND(s.latitude::numeric, 7) AS latitude,
         ROUND(s.longitude::numeric, 7) AS longitude,
         t.rep_id AS added_by
    FROM crm_field_trip_stops s
    JOIN crm_field_trips t ON t.id = s.trip_id
   WHERE s.stop_type IN ('location', 'custom')
     AND s.latitude IS NOT NULL
     AND s.longitude IS NOT NULL
     AND TRIM(COALESCE(s.address_snapshot, '')) <> ''
   ORDER BY ROUND(COALESCE(s.latitude, 0)::numeric, 7), ROUND(COALESCE(s.longitude, 0)::numeric, 7), s.id DESC
)
INSERT INTO crm_locations (name, label, country, country_code_2, address, latitude, longitude, source, added_by, use_count, last_used_at)
SELECT COALESCE(NULLIF(name, ''), address) AS name,
       label,
       country,
       country_code_2,
       address,
       latitude,
       longitude,
       'imported' AS source,
       added_by,
       0,
       NOW()
  FROM distinct_stops
ON CONFLICT (latitude, longitude) DO NOTHING;

INSERT INTO crm_location_trip_usage (trip_id, location_id, first_used_at, last_used_at)
SELECT DISTINCT s.trip_id,
       l.id,
       COALESCE(t.created_at, NOW()),
       NOW()
  FROM crm_field_trip_stops s
  JOIN crm_locations l
    ON ROUND(s.latitude::numeric, 7) = l.latitude
   AND ROUND(s.longitude::numeric, 7) = l.longitude
  JOIN crm_field_trips t ON t.id = s.trip_id
 WHERE s.stop_type IN ('location', 'custom')
   AND s.latitude IS NOT NULL
   AND s.longitude IS NOT NULL
ON CONFLICT (trip_id, location_id) DO NOTHING;

UPDATE crm_locations l
SET use_count = usage.ct,
    last_used_at = NOW(),
    updated_at = NOW()
FROM (
  SELECT location_id, COUNT(*)::int AS ct
  FROM crm_location_trip_usage
  GROUP BY location_id
) usage
WHERE usage.location_id = l.id;
