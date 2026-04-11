-- Rollback: Remove sent_to_qc_at timestamp from mes_presales_samples
ALTER TABLE mes_presales_samples DROP COLUMN IF EXISTS sent_to_qc_at;
