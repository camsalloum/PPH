/**
 * MES Flow Migration #001 — Phase Engine
 *
 * Creates the core infrastructure for the department-to-department handoff system.
 * This is the mechanism layer — form/field content for each phase comes later.
 *
 * Tables:
 *   1. mes_workflow_phases      — master list of the 17 phases (static reference)
 *   2. mes_phase_transitions    — allowed from→to transitions (state machine rules)
 *   3. mes_job_tracker          — one row per job (inquiry → order lifecycle)
 *   4. mes_job_phases           — per-job progress through each phase (status, owner, dates)
 *   5. mes_job_activity_log     — audit trail of every action (handoff, comment, approval…)
 *   6. mes_job_attachments      — files attached at any phase (TDS, emails, samples, design sheets…)
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const { pool } = require('../database/config');

// ───────────────────────────────────────────────────────────────────────────
// Phase definitions from FP_OPW v3
// ───────────────────────────────────────────────────────────────────────────
const PHASES = [
  { num: 1,  key: 'customer_inquiry',     name: 'Customer Inquiry & Sample Receipt',   stage: 'presales',       depts: ['sales'] },
  { num: 2,  key: 'registration_credit',  name: 'Registration & Credit Check',         stage: 'presales',       depts: ['sales', 'accounts'] },
  { num: 3,  key: 'tech_spec_review',     name: 'Technical Specification Review',      stage: 'presales',       depts: ['qc', 'prepress', 'estimation'] },
  { num: 4,  key: 'moq_verification',     name: 'MOQ Verification',                    stage: 'presales',       depts: ['sales', 'estimation'] },
  { num: 5,  key: 'material_availability',name: 'Material Availability Check',         stage: 'presales',       depts: ['procurement'] },
  { num: 6,  key: 'cost_estimation',      name: 'Cost Estimation & Pricing',           stage: 'quotation',      depts: ['estimation', 'prepress'] },
  { num: 7,  key: 'quotation_negotiation',name: 'Quotation & Negotiation',             stage: 'quotation',      depts: ['sales'] },
  { num: 8,  key: 'po_so_generation',     name: 'PO Confirmation & SO Generation',     stage: 'quotation',      depts: ['sales', 'accounts'] },
  { num: 9,  key: 'material_procurement', name: 'Material Procurement Process',        stage: 'preproduction',  depts: ['procurement', 'qc'] },
  { num: 10, key: 'artwork_plate_prep',   name: 'Artwork Processing & Plate Prep',     stage: 'preproduction',  depts: ['prepress', 'sales', 'qc'] },
  { num: 11, key: 'production_planning',  name: 'Production Planning & Scheduling',    stage: 'production',     depts: ['production', 'procurement'] },
  { num: 12, key: 'ink_preparation',      name: 'Ink Preparation & Color Matching',    stage: 'production',     depts: ['inkhead', 'qc'] },
  { num: 13, key: 'production_execution', name: 'Production Execution',                stage: 'production',     depts: ['production', 'qc', 'sales', 'maintenance'] },
  { num: 14, key: 'final_qc_packaging',   name: 'Final QC & Packaging',                stage: 'production',     depts: ['qc', 'logistics'] },
  { num: 15, key: 'invoicing',            name: 'Invoicing & Payment Processing',      stage: 'delivery',       depts: ['accounts'] },
  { num: 16, key: 'delivery_logistics',   name: 'Delivery & Logistics',                stage: 'delivery',       depts: ['logistics'] },
  { num: 17, key: 'post_delivery',        name: 'Post-Delivery & Feedback',            stage: 'delivery',       depts: ['sales', 'qc'] },
];

// Allowed phase transitions (from_phase → to_phase)
// Phases 9 & 10 are parallel (both triggered from phase 8).
// Phases 11+ require both 9 & 10 to be complete.
const TRANSITIONS = [
  [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
  [6, 7], [7, 8],
  [8, 9], [8, 10],             // parallel fork
  [9, 11], [10, 11],           // parallel join (both needed)
  [11, 12], [12, 13], [13, 14],
  [14, 15], [15, 16], [16, 17],
  // Backward/rework transitions
  [3, 1],  // tech spec needs more info → back to inquiry
  [7, 6],  // customer rejects price → re-estimate
  [13, 12], // production issue → re-prepare ink
];

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔧 Starting MES Flow migration #001 — Phase Engine...');
    await client.query('BEGIN');

    // ─── 1. mes_workflow_phases (reference table) ────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_workflow_phases (
        phase_number    SMALLINT PRIMARY KEY,
        phase_key       VARCHAR(40) UNIQUE NOT NULL,
        phase_name      VARCHAR(120) NOT NULL,
        stage           VARCHAR(30) NOT NULL,           -- presales, quotation, preproduction, production, delivery
        departments     TEXT[] NOT NULL DEFAULT '{}',    -- array of dept keys involved
        is_parallel     BOOLEAN NOT NULL DEFAULT false,
        is_quality_gate BOOLEAN NOT NULL DEFAULT false,
        sort_order      SMALLINT NOT NULL DEFAULT 0
      );
    `);
    console.log('  ✅ mes_workflow_phases — created');

    // Seed phases
    for (const p of PHASES) {
      await client.query(
        `INSERT INTO mes_workflow_phases (phase_number, phase_key, phase_name, stage, departments, is_parallel, is_quality_gate, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (phase_number) DO UPDATE SET
           phase_key = EXCLUDED.phase_key,
           phase_name = EXCLUDED.phase_name,
           stage = EXCLUDED.stage,
           departments = EXCLUDED.departments,
           is_parallel = EXCLUDED.is_parallel,
           is_quality_gate = EXCLUDED.is_quality_gate,
           sort_order = EXCLUDED.sort_order`,
        [
          p.num, p.key, p.name, p.stage,
          `{${p.depts.join(',')}}`,
          p.num === 9 || p.num === 10,
          p.num === 13 || p.num === 14,
          p.num,
        ]
      );
    }
    console.log('  ✅ 17 phases seeded');

    // ─── 2. mes_phase_transitions (rules) ───────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_phase_transitions (
        id              SERIAL PRIMARY KEY,
        from_phase      SMALLINT NOT NULL REFERENCES mes_workflow_phases(phase_number),
        to_phase        SMALLINT NOT NULL REFERENCES mes_workflow_phases(phase_number),
        transition_type VARCHAR(20) NOT NULL DEFAULT 'forward',  -- forward, parallel_fork, parallel_join, rework
        requires_all    BOOLEAN NOT NULL DEFAULT false,          -- for parallel_join: all incoming must be complete
        UNIQUE (from_phase, to_phase)
      );
    `);
    for (const [from, to] of TRANSITIONS) {
      let ttype = 'forward';
      let requiresAll = false;
      if (from === 8 && (to === 9 || to === 10))  ttype = 'parallel_fork';
      if ((from === 9 || from === 10) && to === 11) { ttype = 'parallel_join'; requiresAll = true; }
      if (to < from) ttype = 'rework';

      await client.query(
        `INSERT INTO mes_phase_transitions (from_phase, to_phase, transition_type, requires_all)
         VALUES ($1, $2, $3, $4) ON CONFLICT (from_phase, to_phase) DO NOTHING`,
        [from, to, ttype, requiresAll]
      );
    }
    console.log('  ✅ mes_phase_transitions — created & seeded');

    // ─── 3. mes_job_tracker (one row per job lifecycle) ─────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_job_tracker (
        id              SERIAL PRIMARY KEY,
        job_number      VARCHAR(30) UNIQUE NOT NULL,              -- JOB-FP-2026-00001
        division        VARCHAR(10) NOT NULL DEFAULT 'FP',
        inquiry_id      INTEGER REFERENCES mes_presales_inquiries(id) ON DELETE SET NULL,
        prospect_id     INTEGER REFERENCES fp_prospects(id) ON DELETE SET NULL,
        customer_name   VARCHAR(255) NOT NULL,
        customer_country VARCHAR(100),
        current_phase   SMALLINT NOT NULL DEFAULT 1 REFERENCES mes_workflow_phases(phase_number),
        overall_status  VARCHAR(30) NOT NULL DEFAULT 'active'
                        CHECK (overall_status IN ('active','on_hold','completed','cancelled')),
        assigned_dept   VARCHAR(30),                              -- current owning department
        assigned_group_id INTEGER,                                -- sales_rep_group_id (for scoping)
        assigned_group_name VARCHAR(120),
        priority        VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
        started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_mjt_division    ON mes_job_tracker(division);
      CREATE INDEX IF NOT EXISTS idx_mjt_status      ON mes_job_tracker(overall_status);
      CREATE INDEX IF NOT EXISTS idx_mjt_phase       ON mes_job_tracker(current_phase);
      CREATE INDEX IF NOT EXISTS idx_mjt_inquiry     ON mes_job_tracker(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_mjt_dept        ON mes_job_tracker(assigned_dept);
      CREATE INDEX IF NOT EXISTS idx_mjt_group       ON mes_job_tracker(assigned_group_id);
    `);
    console.log('  ✅ mes_job_tracker — created');

    // Job number sequence
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS mes_job_seq START 1;
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION generate_job_number(p_division TEXT)
      RETURNS TEXT AS $$
      DECLARE
        seq_val INTEGER;
      BEGIN
        SELECT nextval('mes_job_seq') INTO seq_val;
        RETURN 'JOB-' || p_division || '-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || LPAD(seq_val::TEXT, 5, '0');
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('  ✅ Job number sequence & generator');

    // ─── 4. mes_job_phases (per-job phase progress) ─────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_job_phases (
        id              SERIAL PRIMARY KEY,
        job_id          INTEGER NOT NULL REFERENCES mes_job_tracker(id) ON DELETE CASCADE,
        phase_number    SMALLINT NOT NULL REFERENCES mes_workflow_phases(phase_number),
        status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','active','awaiting_input','completed','skipped','blocked')),
        owned_by_dept   VARCHAR(30),                               -- which department currently has it
        assigned_to_user_id INTEGER,                               -- specific user assignment (optional)
        assigned_to_name VARCHAR(120),
        started_at      TIMESTAMPTZ,
        completed_at    TIMESTAMPTZ,
        completed_by    VARCHAR(120),
        notes           TEXT,
        phase_data      JSONB DEFAULT '{}',                        -- flexible data per phase (form content goes here later)
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (job_id, phase_number)
      );

      CREATE INDEX IF NOT EXISTS idx_mjp_job     ON mes_job_phases(job_id);
      CREATE INDEX IF NOT EXISTS idx_mjp_status  ON mes_job_phases(status);
      CREATE INDEX IF NOT EXISTS idx_mjp_dept    ON mes_job_phases(owned_by_dept);
    `);
    console.log('  ✅ mes_job_phases — created');

    // ─── 5. mes_job_activity_log (audit trail) ──────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_job_activity_log (
        id              SERIAL PRIMARY KEY,
        job_id          INTEGER NOT NULL REFERENCES mes_job_tracker(id) ON DELETE CASCADE,
        phase_number    SMALLINT REFERENCES mes_workflow_phases(phase_number),
        action          VARCHAR(50) NOT NULL,                      -- 'phase_started','phase_completed','handoff','comment','attachment_added','approval','rejection','status_change'
        from_dept       VARCHAR(30),
        to_dept         VARCHAR(30),
        from_status     VARCHAR(30),
        to_status       VARCHAR(30),
        performed_by_id INTEGER,
        performed_by    VARCHAR(120),
        details         TEXT,
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_mjal_job    ON mes_job_activity_log(job_id);
      CREATE INDEX IF NOT EXISTS idx_mjal_action ON mes_job_activity_log(action);
      CREATE INDEX IF NOT EXISTS idx_mjal_phase  ON mes_job_activity_log(phase_number);
    `);
    console.log('  ✅ mes_job_activity_log — created');

    // ─── 6. mes_job_attachments (files at any phase) ────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_job_attachments (
        id              SERIAL PRIMARY KEY,
        job_id          INTEGER NOT NULL REFERENCES mes_job_tracker(id) ON DELETE CASCADE,
        phase_number    SMALLINT REFERENCES mes_workflow_phases(phase_number),
        file_name       VARCHAR(255) NOT NULL,
        file_path       VARCHAR(500) NOT NULL,
        file_size       INTEGER,                                    -- bytes
        mime_type       VARCHAR(100),
        attachment_type VARCHAR(50) NOT NULL DEFAULT 'document'
                        CHECK (attachment_type IN (
                          'tds','email','document','sample_photo','design_sheet',
                          'test_report','coa','artwork','proof','coc','invoice',
                          'po','dn','other'
                        )),
        description     TEXT,
        uploaded_by_id  INTEGER,
        uploaded_by     VARCHAR(120),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_mja_job   ON mes_job_attachments(job_id);
      CREATE INDEX IF NOT EXISTS idx_mja_phase ON mes_job_attachments(phase_number);
      CREATE INDEX IF NOT EXISTS idx_mja_type  ON mes_job_attachments(attachment_type);
    `);
    console.log('  ✅ mes_job_attachments — created');

    // ─── 7. Updated_at triggers ─────────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION update_mes_flow_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    for (const tbl of ['mes_job_tracker', 'mes_job_phases']) {
      await client.query(`
        DROP TRIGGER IF EXISTS trg_${tbl}_updated_at ON ${tbl};
        CREATE TRIGGER trg_${tbl}_updated_at
          BEFORE UPDATE ON ${tbl}
          FOR EACH ROW EXECUTE FUNCTION update_mes_flow_updated_at();
      `);
    }
    console.log('  ✅ updated_at triggers');

    await client.query('COMMIT');
    console.log('\n✅ MES Flow migration #001 completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration #001 failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
