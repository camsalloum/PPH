-- DESCRIPTION: CRM field trip planner foundation tables
-- ROLLBACK: SAFE
-- DATA LOSS: NO

CREATE TABLE IF NOT EXISTS crm_field_trips (
  id               SERIAL PRIMARY KEY,
  rep_id           INTEGER NOT NULL,
  title            VARCHAR(255) NOT NULL,
  country          VARCHAR(120),
  cities           JSONB NOT NULL DEFAULT '[]'::jsonb,
  departure_date   DATE NOT NULL,
  return_date      DATE,
  status           VARCHAR(20) NOT NULL DEFAULT 'planning'
                    CHECK (status IN ('planning', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  travel_notes     TEXT,
  objectives       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_field_trips_rep_status ON crm_field_trips(rep_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_field_trips_departure ON crm_field_trips(departure_date);

CREATE TABLE IF NOT EXISTS crm_field_trip_stops (
  id                  SERIAL PRIMARY KEY,
  trip_id             INTEGER NOT NULL REFERENCES crm_field_trips(id) ON DELETE CASCADE,
  stop_order          INTEGER NOT NULL DEFAULT 1,
  stop_type           VARCHAR(20) NOT NULL DEFAULT 'customer'
                        CHECK (stop_type IN ('customer', 'prospect', 'supplier', 'other')),
  customer_id         INTEGER,
  prospect_id         INTEGER,
  visit_date          DATE,
  visit_time          TIME,
  duration_mins       INTEGER NOT NULL DEFAULT 60,
  latitude            NUMERIC(10,7),
  longitude           NUMERIC(10,7),
  address_snapshot    TEXT,
  objectives          TEXT,
  pre_visit_notes     TEXT,
  outcome_notes       TEXT,
  outcome_status      VARCHAR(20) NOT NULL DEFAULT 'planned'
                        CHECK (outcome_status IN ('planned', 'visited', 'no_show', 'postponed', 'cancelled')),
  follow_ups_created  BOOLEAN NOT NULL DEFAULT false,
  meeting_id          INTEGER,
  arrival_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_field_trip_stops_trip_order ON crm_field_trip_stops(trip_id, stop_order);
CREATE INDEX IF NOT EXISTS idx_crm_field_trip_stops_visit_date ON crm_field_trip_stops(visit_date);
CREATE INDEX IF NOT EXISTS idx_crm_field_trip_stops_customer ON crm_field_trip_stops(customer_id);
