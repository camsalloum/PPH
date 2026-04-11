-- ═══════════════════════════════════════════════════════════════════════════════
-- Field Visit Enhancements — Consolidated Migration
-- Corrected from FieldVisit_Complete_Implementation_Prompt.md
-- Fixes: table name mismatches, existing column conflicts
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Migration 01: Approval columns on crm_field_trips ─────────────────────
DO $$
BEGIN
  ALTER TABLE crm_field_trips
    ADD COLUMN IF NOT EXISTS submitted_for_approval_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approval_decision         VARCHAR(32),
    ADD COLUMN IF NOT EXISTS approval_comments         TEXT,
    ADD COLUMN IF NOT EXISTS approved_by               INTEGER,
    ADD COLUMN IF NOT EXISTS approved_at               TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS co_travellers             INTEGER[],
    ADD COLUMN IF NOT EXISTS predeparture_checklist    JSONB          DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS visa_details              JSONB          DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS template_name             VARCHAR(200),
    ADD COLUMN IF NOT EXISTS is_template               BOOLEAN        DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cloned_from_trip_id       INTEGER;

  -- Update status constraint to include 'pending_approval'
  ALTER TABLE crm_field_trips DROP CONSTRAINT IF EXISTS crm_field_trips_status_check;
  ALTER TABLE crm_field_trips ADD CONSTRAINT crm_field_trips_status_check
    CHECK (status IN ('planning','pending_approval','confirmed','in_progress','completed','cancelled'));
END
$$;

-- ─── Migration 02: Multi-modal transport legs table ─────────────────────────
CREATE TABLE IF NOT EXISTS crm_field_trip_legs (
  id               SERIAL PRIMARY KEY,
  trip_id          INTEGER NOT NULL REFERENCES crm_field_trips(id) ON DELETE CASCADE,
  leg_order        INTEGER NOT NULL DEFAULT 1,
  mode             VARCHAR(30) NOT NULL DEFAULT 'car',
  from_stop_order  INTEGER,
  to_stop_order    INTEGER,
  from_label       VARCHAR(200),
  to_label         VARCHAR(200),
  dep_datetime     TIMESTAMPTZ,
  arr_datetime     TIMESTAMPTZ,
  airline          VARCHAR(100),
  flight_number    VARCHAR(30),
  dep_airport      VARCHAR(10),
  arr_airport      VARCHAR(10),
  seat_class       VARCHAR(30),
  booking_ref      VARCHAR(60),
  rental_company   VARCHAR(100),
  rental_ref       VARCHAR(60),
  est_km           NUMERIC(8,1),
  train_operator   VARCHAR(100),
  train_number     VARCHAR(30),
  train_class      VARCHAR(30),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ftlegs_trip ON crm_field_trip_legs(trip_id);

-- ─── Migration 03: Stop-level enhancements (GPS, enrichments) ──────────────
ALTER TABLE crm_field_trip_stops
  ADD COLUMN IF NOT EXISTS check_in_lat          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS check_in_lng          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS check_in_accuracy_m   INTEGER,
  ADD COLUMN IF NOT EXISTS check_in_timestamp    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_in_distance_m   INTEGER,
  ADD COLUMN IF NOT EXISTS samples_provided      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS samples_qty           INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_potential   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS geocoded_by           VARCHAR(20) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS stop_type_sub         VARCHAR(30),
  ADD COLUMN IF NOT EXISTS supplier_id           INTEGER;
-- Note: products_discussed, competitor_info, contact_email already exist from previous migration (kept as TEXT)

-- Extend stop_type constraint
ALTER TABLE crm_field_trip_stops DROP CONSTRAINT IF EXISTS crm_field_trip_stops_stop_type_check;
ALTER TABLE crm_field_trip_stops ADD CONSTRAINT crm_field_trip_stops_stop_type_check
  CHECK (stop_type IN ('customer','prospect','supplier','airport','hotel','conference','other'));

-- ─── Migration 04: Expense multi-currency (targets crm_trip_expenses) ──────
-- NOTE: Doc said crm_field_trip_expenses but actual table is crm_trip_expenses
ALTER TABLE crm_trip_expenses
  ADD COLUMN IF NOT EXISTS original_amount   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS original_currency CHAR(3) DEFAULT 'AED',
  ADD COLUMN IF NOT EXISTS fx_rate           NUMERIC(12,6) DEFAULT 1.000000,
  ADD COLUMN IF NOT EXISTS aed_equivalent    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS receipt_filename  VARCHAR(300),
  ADD COLUMN IF NOT EXISTS receipt_mime      VARCHAR(80),
  ADD COLUMN IF NOT EXISTS approved          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_by       INTEGER,
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes             TEXT;
-- Note: receipt_url already exists in crm_trip_expenses from original migration

-- Backfill existing expense rows
UPDATE crm_trip_expenses
SET original_amount = amount,
    original_currency = COALESCE(currency, 'AED'),
    fx_rate = 1.000000,
    aed_equivalent = amount
WHERE aed_equivalent IS NULL;

-- ─── Migration 05: Travel report enrichment (targets crm_travel_reports) ───
-- NOTE: Doc said crm_field_trip_travel_reports but actual table is crm_travel_reports
ALTER TABLE crm_travel_reports
  ADD COLUMN IF NOT EXISTS manager_stop_comments JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS planned_vs_actual     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS roi_metrics           JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pdf_url               TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at      TIMESTAMPTZ;

-- ─── Migration 06: Stop attachments table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_field_trip_stop_attachments (
  id           SERIAL PRIMARY KEY,
  trip_id      INTEGER NOT NULL REFERENCES crm_field_trips(id) ON DELETE CASCADE,
  stop_id      INTEGER NOT NULL REFERENCES crm_field_trip_stops(id) ON DELETE CASCADE,
  filename     VARCHAR(300) NOT NULL,
  mime_type    VARCHAR(80),
  file_url     TEXT NOT NULL,
  file_size_kb INTEGER,
  uploaded_by  INTEGER,
  uploaded_at  TIMESTAMPTZ DEFAULT NOW(),
  caption      TEXT
);
CREATE INDEX IF NOT EXISTS idx_ftstop_attach_stop ON crm_field_trip_stop_attachments(stop_id);
CREATE INDEX IF NOT EXISTS idx_ftstop_attach_trip ON crm_field_trip_stop_attachments(trip_id);

-- ─── Migration 07: FX rates reference table ────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_fx_rates (
  id            SERIAL PRIMARY KEY,
  from_currency CHAR(3) NOT NULL,
  to_currency   CHAR(3) NOT NULL DEFAULT 'AED',
  rate          NUMERIC(12,6) NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source        VARCHAR(50) DEFAULT 'manual',
  UNIQUE (from_currency, to_currency, effective_date)
);
INSERT INTO crm_fx_rates (from_currency, to_currency, rate, source) VALUES
  ('USD','AED', 3.6725, 'seed'),
  ('EUR','AED', 3.9800, 'seed'),
  ('GBP','AED', 4.6500, 'seed'),
  ('SAR','AED', 0.9793, 'seed'),
  ('KWD','AED', 11.940, 'seed'),
  ('BHD','AED', 9.7500, 'seed'),
  ('QAR','AED', 1.0090, 'seed'),
  ('OMR','AED', 9.5400, 'seed'),
  ('INR','AED', 0.0441, 'seed'),
  ('CNY','AED', 0.5060, 'seed')
ON CONFLICT (from_currency, to_currency, effective_date) DO NOTHING;

-- ─── Migration 08: Trip templates table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_field_trip_templates (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  description  TEXT,
  trip_type    VARCHAR(20) DEFAULT 'local',
  country_code VARCHAR(3),
  transport_mode VARCHAR(30),
  stops_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by   INTEGER,
  is_shared    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fttpl_rep ON crm_field_trip_templates(created_by);
