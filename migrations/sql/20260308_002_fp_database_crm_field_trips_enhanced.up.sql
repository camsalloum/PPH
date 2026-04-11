-- DESCRIPTION: Enhanced field trips with trip type, expenses, travel reports, adjustments
-- ROLLBACK: SAFE
-- DATA LOSS: NO

-- ─── Enhance crm_field_trips ────────────────────────────────────────────────
ALTER TABLE crm_field_trips ADD COLUMN IF NOT EXISTS trip_type VARCHAR(20) DEFAULT 'local'
  CHECK (trip_type IN ('local', 'international'));
ALTER TABLE crm_field_trips ADD COLUMN IF NOT EXISTS budget_estimate NUMERIC(12,2);
ALTER TABLE crm_field_trips ADD COLUMN IF NOT EXISTS transport_mode VARCHAR(50);
ALTER TABLE crm_field_trips ADD COLUMN IF NOT EXISTS accommodation TEXT;
ALTER TABLE crm_field_trips ADD COLUMN IF NOT EXISTS visa_required BOOLEAN DEFAULT FALSE;
ALTER TABLE crm_field_trips ADD COLUMN IF NOT EXISTS country_code VARCHAR(3);

-- ─── Enhance crm_field_trip_stops ───────────────────────────────────────────
ALTER TABLE crm_field_trip_stops ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255);
ALTER TABLE crm_field_trip_stops ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
ALTER TABLE crm_field_trip_stops ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE crm_field_trip_stops ADD COLUMN IF NOT EXISTS visit_notes TEXT;
ALTER TABLE crm_field_trip_stops ADD COLUMN IF NOT EXISTS products_discussed TEXT;
ALTER TABLE crm_field_trip_stops ADD COLUMN IF NOT EXISTS samples_delivered BOOLEAN DEFAULT FALSE;
ALTER TABLE crm_field_trip_stops ADD COLUMN IF NOT EXISTS quotation_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE crm_field_trip_stops ADD COLUMN IF NOT EXISTS next_action TEXT;
ALTER TABLE crm_field_trip_stops ADD COLUMN IF NOT EXISTS competitor_info TEXT;
ALTER TABLE crm_field_trip_stops ADD COLUMN IF NOT EXISTS visit_result VARCHAR(30)
  CHECK (visit_result IN ('positive', 'neutral', 'negative', 'needs_follow_up'));

-- ─── Travel Reports ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_travel_reports (
  id                SERIAL PRIMARY KEY,
  trip_id           INTEGER NOT NULL REFERENCES crm_field_trips(id) ON DELETE CASCADE,
  submitted_by      INTEGER NOT NULL,
  submitted_at      TIMESTAMPTZ,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'revision_requested')),
  summary           TEXT,
  key_outcomes      TEXT,
  challenges        TEXT,
  recommendations   TEXT,
  next_steps        TEXT,
  total_expenses    NUMERIC(12,2) DEFAULT 0,
  manager_comments  TEXT,
  reviewed_by       INTEGER,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_travel_reports_trip ON crm_travel_reports(trip_id);
CREATE INDEX IF NOT EXISTS idx_crm_travel_reports_status ON crm_travel_reports(status);

-- ─── Trip Expenses ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_trip_expenses (
  id              SERIAL PRIMARY KEY,
  trip_id         INTEGER NOT NULL REFERENCES crm_field_trips(id) ON DELETE CASCADE,
  stop_id         INTEGER REFERENCES crm_field_trip_stops(id) ON DELETE SET NULL,
  category        VARCHAR(50) NOT NULL
                    CHECK (category IN ('flight','hotel','transport','meals','visa','parking','gift','communication','other')),
  description     TEXT,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(3) DEFAULT 'AED',
  expense_date    DATE,
  receipt_url     TEXT,
  created_by      INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_trip_expenses_trip ON crm_trip_expenses(trip_id);

-- ─── Trip Adjustments Log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_trip_adjustments (
  id               SERIAL PRIMARY KEY,
  trip_id          INTEGER NOT NULL REFERENCES crm_field_trips(id) ON DELETE CASCADE,
  adjusted_by      INTEGER NOT NULL,
  adjustment_type  VARCHAR(30) NOT NULL
                     CHECK (adjustment_type IN ('stop_added','stop_removed','stop_reordered','date_changed','stop_postponed','stop_rescheduled','notes_updated','route_changed','other')),
  description      TEXT,
  stop_id          INTEGER REFERENCES crm_field_trip_stops(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_trip_adjustments_trip ON crm_trip_adjustments(trip_id);
