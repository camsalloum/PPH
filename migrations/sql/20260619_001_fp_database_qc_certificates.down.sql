-- DESCRIPTION: Rollback Phase 6 certificate foundation
-- ROLLBACK: SAFE
-- DATA LOSS: YES (drops certificate tables)

DROP INDEX IF EXISTS idx_qc_rm_incoming_certificate_id;
DROP INDEX IF EXISTS idx_qc_cert_revisions_certificate;
DROP INDEX IF EXISTS idx_qc_cert_division_issued;
DROP INDEX IF EXISTS idx_qc_cert_status;
DROP INDEX IF EXISTS idx_qc_cert_supplier;
DROP INDEX IF EXISTS idx_qc_cert_material;
DROP INDEX IF EXISTS idx_qc_cert_batch;
DROP INDEX IF EXISTS idx_qc_cert_incoming;

ALTER TABLE qc_rm_incoming
  DROP CONSTRAINT IF EXISTS fk_qc_rm_incoming_certificate_id;

ALTER TABLE qc_rm_incoming
  DROP COLUMN IF EXISTS certificate_id;

DROP TABLE IF EXISTS qc_certificate_revisions;
DROP TABLE IF EXISTS qc_certificates;

DROP SEQUENCE IF EXISTS qc_cert_seq;
