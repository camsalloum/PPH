-- Migration: Add sent_to_qc_at timestamp to mes_presales_samples
-- ISS-03: The "Sent to QC" step in SampleProgressSteps shows no timestamp
-- because this column was missing from the schema.

ALTER TABLE mes_presales_samples
  ADD COLUMN IF NOT EXISTS sent_to_qc_at TIMESTAMPTZ DEFAULT NULL;

-- Backfill: for samples already in sent_to_qc or later status, use updated_at as best approximation
UPDATE mes_presales_samples
SET sent_to_qc_at = updated_at
WHERE sent_to_qc_at IS NULL
  AND status IN ('sent_to_qc', 'received_by_qc', 'testing', 'tested', 'approved', 'rejected');
