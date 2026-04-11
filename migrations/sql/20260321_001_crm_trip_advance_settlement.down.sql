-- ═══════════════════════════════════════════════════════════════════════════════
-- CRM Trip Advance + Settlement Workflow (DOWN)
-- Reverts schema introduced by 20260321_001_crm_trip_advance_settlement.up.sql
-- ═══════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_trip_settlements_status;
DROP INDEX IF EXISTS idx_trip_settlements_trip_id;

DROP TABLE IF EXISTS crm_trip_settlements;

ALTER TABLE crm_field_trips
  DROP CONSTRAINT IF EXISTS crm_field_trips_advance_status_check;

ALTER TABLE crm_field_trips
  DROP COLUMN IF EXISTS advance_disbursed_by,
  DROP COLUMN IF EXISTS advance_disbursed_at,
  DROP COLUMN IF EXISTS advance_disbursed_notes,
  DROP COLUMN IF EXISTS advance_disbursed_reference,
  DROP COLUMN IF EXISTS advance_disbursed_base_amount,
  DROP COLUMN IF EXISTS advance_disbursed_rate_to_base,
  DROP COLUMN IF EXISTS advance_disbursed_currency,
  DROP COLUMN IF EXISTS advance_disbursed_amount,
  DROP COLUMN IF EXISTS advance_approved_by,
  DROP COLUMN IF EXISTS advance_approved_at,
  DROP COLUMN IF EXISTS advance_approval_comments,
  DROP COLUMN IF EXISTS advance_approved_base_amount,
  DROP COLUMN IF EXISTS advance_approved_rate_to_base,
  DROP COLUMN IF EXISTS advance_approved_currency,
  DROP COLUMN IF EXISTS advance_approved_amount,
  DROP COLUMN IF EXISTS advance_requested_by,
  DROP COLUMN IF EXISTS advance_requested_at,
  DROP COLUMN IF EXISTS advance_request_notes,
  DROP COLUMN IF EXISTS advance_request_base_amount,
  DROP COLUMN IF EXISTS advance_request_rate_to_base,
  DROP COLUMN IF EXISTS advance_request_currency,
  DROP COLUMN IF EXISTS advance_request_amount,
  DROP COLUMN IF EXISTS advance_status;
