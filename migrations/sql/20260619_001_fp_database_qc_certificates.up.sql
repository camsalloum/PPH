-- DESCRIPTION: Phase 6 foundation for digital QC certificates and revision history
-- ROLLBACK: SAFE
-- DATA LOSS: LOW (new objects only)

CREATE SEQUENCE IF NOT EXISTS qc_cert_seq START 1;

CREATE TABLE IF NOT EXISTS qc_certificates (
  id                    SERIAL PRIMARY KEY,
  certificate_number    VARCHAR(50) NOT NULL UNIQUE,
  verification_token    VARCHAR(32) NOT NULL UNIQUE,
  certificate_type      VARCHAR(20) NOT NULL DEFAULT 'COA'
                          CHECK (certificate_type IN ('COA', 'COC', 'COT')),
  incoming_id           INTEGER NOT NULL REFERENCES qc_rm_incoming(id) ON DELETE RESTRICT,
  material_code         VARCHAR(120) NOT NULL,
  material_name         VARCHAR(220) NOT NULL,
  material_type         VARCHAR(120),
  batch_number          VARCHAR(100),
  qc_lot_id             VARCHAR(60),
  supplier_name         VARCHAR(200),
  supplier_code         VARCHAR(50),
  division              VARCHAR(10) NOT NULL DEFAULT 'FP'
                          CHECK (division IN ('FP', 'HC')),
  test_summary          JSONB NOT NULL,
  parameters_tested     INTEGER NOT NULL DEFAULT 0,
  parameters_passed     INTEGER NOT NULL DEFAULT 0,
  overall_result        VARCHAR(20) NOT NULL
                          CHECK (overall_result IN ('passed', 'conditional')),
  conditions            TEXT,
  received_date         DATE NOT NULL,
  tested_date           DATE NOT NULL,
  issued_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until           DATE,
  tested_by             INTEGER,
  tested_by_name        VARCHAR(200) NOT NULL,
  approved_by           INTEGER NOT NULL,
  approved_by_name      VARCHAR(200) NOT NULL,
  approved_at           TIMESTAMPTZ NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'superseded', 'revoked', 'expired')),
  revision_number       INTEGER NOT NULL DEFAULT 1,
  supersedes_id         INTEGER REFERENCES qc_certificates(id) ON DELETE SET NULL,
  revoked_by            INTEGER,
  revoked_at            TIMESTAMPTZ,
  revocation_reason     TEXT,
  pdf_path              VARCHAR(500),
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qc_certificate_revisions (
  id                    SERIAL PRIMARY KEY,
  certificate_id        INTEGER NOT NULL REFERENCES qc_certificates(id) ON DELETE CASCADE,
  revision_number       INTEGER NOT NULL,
  action                VARCHAR(30) NOT NULL
                          CHECK (action IN ('issued', 'revised', 'superseded', 'revoked', 'expired')),
  test_summary_snapshot JSONB,
  actor_id              INTEGER,
  actor_name            VARCHAR(200) NOT NULL,
  reason                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE qc_rm_incoming
  ADD COLUMN IF NOT EXISTS certificate_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_qc_rm_incoming_certificate_id'
  ) THEN
    ALTER TABLE qc_rm_incoming
      ADD CONSTRAINT fk_qc_rm_incoming_certificate_id
      FOREIGN KEY (certificate_id)
      REFERENCES qc_certificates(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_qc_cert_incoming
  ON qc_certificates(incoming_id);

CREATE INDEX IF NOT EXISTS idx_qc_cert_batch
  ON qc_certificates(batch_number);

CREATE INDEX IF NOT EXISTS idx_qc_cert_material
  ON qc_certificates(material_code);

CREATE INDEX IF NOT EXISTS idx_qc_cert_supplier
  ON qc_certificates(supplier_code);

CREATE INDEX IF NOT EXISTS idx_qc_cert_status
  ON qc_certificates(status);

CREATE INDEX IF NOT EXISTS idx_qc_cert_division_issued
  ON qc_certificates(division, issued_date DESC);

CREATE INDEX IF NOT EXISTS idx_qc_cert_revisions_certificate
  ON qc_certificate_revisions(certificate_id, revision_number DESC);

CREATE INDEX IF NOT EXISTS idx_qc_rm_incoming_certificate_id
  ON qc_rm_incoming(certificate_id);
