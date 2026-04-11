-- DESCRIPTION: Phase 4 foundation for incoming raw-material QC workflow
-- ROLLBACK: SAFE
-- DATA LOSS: NO

CREATE SEQUENCE IF NOT EXISTS qc_rm_lot_seq START 1;

CREATE OR REPLACE FUNCTION generate_qc_rm_lot_id(p_material_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_seq BIGINT;
BEGIN
  v_prefix := UPPER(LEFT(REGEXP_REPLACE(COALESCE(p_material_code, 'RM'), '[^A-Za-z0-9]', '', 'g'), 4));
  IF v_prefix IS NULL OR v_prefix = '' THEN
    v_prefix := 'RM';
  END IF;

  v_seq := nextval('qc_rm_lot_seq');
  RETURN 'QC-' || TO_CHAR(NOW(), 'YYYY-MM') || '-' || v_prefix || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS qc_rm_incoming (
  id                      SERIAL PRIMARY KEY,
  rm_sync_id              INTEGER,
  source                  VARCHAR(20) NOT NULL DEFAULT 'oracle_sync'
                            CHECK (source IN ('oracle_sync', 'manual', 'regrind')),
  division                VARCHAR(10) NOT NULL DEFAULT 'FP'
                            CHECK (division IN ('FP', 'HC')),
  material_code           VARCHAR(120) NOT NULL,
  material_name           TEXT NOT NULL,
  material_type           VARCHAR(120),
  material_subtype        VARCHAR(120),
  supplier_code           VARCHAR(50),
  supplier_name           VARCHAR(200),
  batch_number            VARCHAR(100),
  grn_reference           VARCHAR(120),
  po_reference            VARCHAR(120),
  received_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity                NUMERIC(14, 3),
  unit                    VARCHAR(30),
  priority                VARCHAR(20) NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  qc_status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (qc_status IN ('pending', 'assigned', 'in_progress', 'passed', 'failed', 'conditional')),
  assigned_to             INTEGER,
  assigned_to_name        VARCHAR(200),
  assigned_at             TIMESTAMPTZ,
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  verdict_notes           TEXT,
  conditional_restriction TEXT,
  verdict_by              INTEGER,
  verdict_by_name         VARCHAR(200),
  verdict_at              TIMESTAMPTZ,
  qc_lot_id               VARCHAR(60) NOT NULL UNIQUE,
  created_by              INTEGER,
  created_by_name         VARCHAR(200),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qc_rm_test_parameters (
  id                      SERIAL PRIMARY KEY,
  material_type           VARCHAR(120) NOT NULL,
  material_subtype        VARCHAR(120),
  parameter_name          VARCHAR(140) NOT NULL,
  parameter_code          VARCHAR(80) NOT NULL,
  unit                    VARCHAR(40),
  test_method             VARCHAR(220),
  spec_min                NUMERIC(14, 4),
  spec_target             NUMERIC(14, 4),
  spec_max                NUMERIC(14, 4),
  conditional_min         NUMERIC(14, 4),
  conditional_max         NUMERIC(14, 4),
  conditional_action      TEXT,
  inspection_level        VARCHAR(20) NOT NULL DEFAULT 'l1'
                            CHECK (inspection_level IN ('l1', 'l2', 'conditional')),
  tested_by_role          VARCHAR(30) NOT NULL DEFAULT 'qc_lab'
                            CHECK (tested_by_role IN ('operator', 'qc_technician', 'qc_lab')),
  frequency_rule          VARCHAR(80) NOT NULL DEFAULT 'every_lot',
  applies_to_subtype      VARCHAR(120),
  process_impact          TEXT,
  equipment_category      VARCHAR(60),
  is_ctq                  BOOLEAN NOT NULL DEFAULT FALSE,
  is_required             BOOLEAN NOT NULL DEFAULT TRUE,
  display_order           INTEGER NOT NULL DEFAULT 100,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_by              INTEGER,
  created_by_name         VARCHAR(200),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qc_rm_test_results (
  id                      SERIAL PRIMARY KEY,
  incoming_id             INTEGER NOT NULL REFERENCES qc_rm_incoming(id) ON DELETE CASCADE,
  parameter_id            INTEGER NOT NULL REFERENCES qc_rm_test_parameters(id) ON DELETE RESTRICT,
  result_value            NUMERIC(14, 4),
  result_text             TEXT,
  result_status           VARCHAR(20)
                            CHECK (result_status IN ('pass', 'fail', 'conditional', 'not_applicable', 'pending')),
  replicate_number        INTEGER NOT NULL DEFAULT 1,
  measurement_point       VARCHAR(100),
  tested_by               INTEGER,
  tested_by_name          VARCHAR(200),
  tested_by_role          VARCHAR(30),
  test_method             VARCHAR(220),
  equipment_id            INTEGER REFERENCES mes_qc_equipment(id) ON DELETE SET NULL,
  equipment_name          VARCHAR(200),
  equipment_calibration_due DATE,
  notes                   TEXT,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  tested_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qc_rm_activity_log (
  id                      SERIAL PRIMARY KEY,
  incoming_id             INTEGER NOT NULL REFERENCES qc_rm_incoming(id) ON DELETE CASCADE,
  action                  VARCHAR(40) NOT NULL,
  from_status             VARCHAR(20),
  to_status               VARCHAR(20),
  performed_by            INTEGER,
  performed_by_name       VARCHAR(200) NOT NULL,
  details                 TEXT,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qc_supplier_tiers (
  id                      SERIAL PRIMARY KEY,
  supplier_code           VARCHAR(50) NOT NULL UNIQUE,
  supplier_name           VARCHAR(200),
  tier                    VARCHAR(20) NOT NULL DEFAULT 'tier_2'
                            CHECK (tier IN ('tier_1', 'tier_2', 'tier_3', 'suspended')),
  tier_reason             TEXT,
  tier_assigned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tier_assigned_by        INTEGER,
  review_due_date         DATE,
  pass_rate_90d           DECIMAL(5, 2),
  total_lots_tested       INTEGER NOT NULL DEFAULT 0,
  last_ncr_date           DATE,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION trg_set_qc_rm_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qc_rm_incoming_updated ON qc_rm_incoming;
CREATE TRIGGER trg_qc_rm_incoming_updated
  BEFORE UPDATE ON qc_rm_incoming
  FOR EACH ROW EXECUTE FUNCTION trg_set_qc_rm_updated_at();

DROP TRIGGER IF EXISTS trg_qc_rm_test_parameters_updated ON qc_rm_test_parameters;
CREATE TRIGGER trg_qc_rm_test_parameters_updated
  BEFORE UPDATE ON qc_rm_test_parameters
  FOR EACH ROW EXECUTE FUNCTION trg_set_qc_rm_updated_at();

DROP TRIGGER IF EXISTS trg_qc_rm_test_results_updated ON qc_rm_test_results;
CREATE TRIGGER trg_qc_rm_test_results_updated
  BEFORE UPDATE ON qc_rm_test_results
  FOR EACH ROW EXECUTE FUNCTION trg_set_qc_rm_updated_at();

DROP TRIGGER IF EXISTS trg_qc_supplier_tiers_updated ON qc_supplier_tiers;
CREATE TRIGGER trg_qc_supplier_tiers_updated
  BEFORE UPDATE ON qc_supplier_tiers
  FOR EACH ROW EXECUTE FUNCTION trg_set_qc_rm_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_qc_rm_incoming_sync_id
  ON qc_rm_incoming(rm_sync_id)
  WHERE rm_sync_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qc_rm_incoming_status
  ON qc_rm_incoming(qc_status);

CREATE INDEX IF NOT EXISTS idx_qc_rm_incoming_material
  ON qc_rm_incoming(material_type);

CREATE INDEX IF NOT EXISTS idx_qc_rm_incoming_received_date
  ON qc_rm_incoming(received_date DESC);

CREATE INDEX IF NOT EXISTS idx_qc_rm_incoming_supplier
  ON qc_rm_incoming(supplier_code);

CREATE INDEX IF NOT EXISTS idx_qc_rm_test_params_material
  ON qc_rm_test_parameters(material_type, is_active, display_order);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_rm_test_parameters_material_code
  ON qc_rm_test_parameters(material_type, COALESCE(material_subtype, ''), parameter_code);

CREATE INDEX IF NOT EXISTS idx_qc_rm_test_results_incoming
  ON qc_rm_test_results(incoming_id);

CREATE INDEX IF NOT EXISTS idx_qc_rm_test_results_parameter
  ON qc_rm_test_results(parameter_id);

CREATE INDEX IF NOT EXISTS idx_qc_rm_test_results_incoming_param
  ON qc_rm_test_results(incoming_id, parameter_id);

CREATE INDEX IF NOT EXISTS idx_qc_rm_activity_incoming
  ON qc_rm_activity_log(incoming_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qc_supplier_tiers_tier
  ON qc_supplier_tiers(tier);
