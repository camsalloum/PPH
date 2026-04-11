-- ═══════════════════════════════════════════════════════════════════════════════
-- CRM Trip Advance + Settlement Workflow
-- - Adds advance request/approval/disbursement tracking on crm_field_trips
-- - Adds trip settlement table for post-trip closure
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm_field_trips
  ADD COLUMN IF NOT EXISTS advance_status                VARCHAR(32) DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS advance_request_amount        NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS advance_request_currency      CHAR(3),
  ADD COLUMN IF NOT EXISTS advance_request_rate_to_base  NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS advance_request_base_amount   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS advance_request_notes         TEXT,
  ADD COLUMN IF NOT EXISTS advance_requested_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS advance_requested_by          INTEGER,
  ADD COLUMN IF NOT EXISTS advance_approved_amount       NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS advance_approved_currency     CHAR(3),
  ADD COLUMN IF NOT EXISTS advance_approved_rate_to_base NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS advance_approved_base_amount  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS advance_approval_comments     TEXT,
  ADD COLUMN IF NOT EXISTS advance_approved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS advance_approved_by           INTEGER,
  ADD COLUMN IF NOT EXISTS advance_disbursed_amount      NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS advance_disbursed_currency    CHAR(3),
  ADD COLUMN IF NOT EXISTS advance_disbursed_rate_to_base NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS advance_disbursed_base_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS advance_disbursed_reference   VARCHAR(120),
  ADD COLUMN IF NOT EXISTS advance_disbursed_notes       TEXT,
  ADD COLUMN IF NOT EXISTS advance_disbursed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS advance_disbursed_by          INTEGER;

DO $$
BEGIN
  ALTER TABLE crm_field_trips DROP CONSTRAINT IF EXISTS crm_field_trips_advance_status_check;
  ALTER TABLE crm_field_trips ADD CONSTRAINT crm_field_trips_advance_status_check
    CHECK (advance_status IN ('not_requested','requested','approved','disbursed','rejected'));
EXCEPTION WHEN others THEN
  -- non-blocking in case of race/legacy env
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS crm_trip_settlements (
  id                            SERIAL PRIMARY KEY,
  trip_id                       INTEGER NOT NULL UNIQUE REFERENCES crm_field_trips(id) ON DELETE CASCADE,
  submitted_by                  INTEGER,
  submitted_at                  TIMESTAMPTZ,
  status                        VARCHAR(32) NOT NULL DEFAULT 'draft',
  base_currency                 CHAR(3) NOT NULL,
  opening_advance_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_expenses_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  returned_amount               NUMERIC(14,2) NOT NULL DEFAULT 0,
  returned_currency             CHAR(3),
  returned_rate_to_base         NUMERIC(12,6) DEFAULT 1.000000,
  returned_base_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount                    NUMERIC(14,2) NOT NULL DEFAULT 0,
  settlement_direction          VARCHAR(32) NOT NULL DEFAULT 'balanced',
  rep_notes                     TEXT,
  manager_comments              TEXT,
  reviewed_by                   INTEGER,
  reviewed_at                   TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE crm_trip_settlements DROP CONSTRAINT IF EXISTS crm_trip_settlements_status_check;
  ALTER TABLE crm_trip_settlements ADD CONSTRAINT crm_trip_settlements_status_check
    CHECK (status IN ('draft','submitted','approved','rejected','revision_requested'));

  ALTER TABLE crm_trip_settlements DROP CONSTRAINT IF EXISTS crm_trip_settlements_direction_check;
  ALTER TABLE crm_trip_settlements ADD CONSTRAINT crm_trip_settlements_direction_check
    CHECK (settlement_direction IN ('rep_to_company','company_to_rep','balanced'));
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_trip_settlements_trip_id ON crm_trip_settlements(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_settlements_status ON crm_trip_settlements(status);
