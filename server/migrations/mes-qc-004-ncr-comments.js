/**
 * MES QC Migration #004
 * G-004: Non-Conformance Reports (NCR)
 * G-005: CSE Discussion Thread (comments)
 * G-006: CSE Revision History
 *
 * Run: node server/migrations/mes-qc-004-ncr-comments.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT)  || 5432,
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'fp_database',
});

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES QC migration #004 — NCR + Comments + Revisions...');

    // ─────────────────────────────────────────────────────────
    // 1. NCR (Non-Conformance Reports) — G-004
    // ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_ncr_reports (
        id                  SERIAL PRIMARY KEY,
        ncr_number          VARCHAR(50) UNIQUE,
        sample_id           INTEGER REFERENCES mes_presales_samples(id)   ON DELETE SET NULL,
        analysis_id         INTEGER REFERENCES mes_qc_analyses(id)        ON DELETE SET NULL,
        inquiry_id          INTEGER REFERENCES mes_presales_inquiries(id) ON DELETE CASCADE,
        category            VARCHAR(50) DEFAULT 'other'
                              CHECK (category IN ('material','process','equipment','human_error','specification','other')),
        description         TEXT NOT NULL,
        root_cause          TEXT,
        corrective_action   TEXT,
        preventive_action   TEXT,
        status              VARCHAR(30) NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','in_progress','resolved','verified','closed')),
        assigned_to         INTEGER,          -- user id
        assigned_to_name    VARCHAR(255),
        due_date            DATE,
        resolution_notes    TEXT,
        verified_by         INTEGER,
        verified_by_name    VARCHAR(255),
        verified_at         TIMESTAMP,
        created_by          INTEGER NOT NULL,
        created_by_name     VARCHAR(255),
        created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_ncr_reports created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ncr_reports_inquiry  ON mes_ncr_reports(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_ncr_reports_sample   ON mes_ncr_reports(sample_id);
      CREATE INDEX IF NOT EXISTS idx_ncr_reports_status   ON mes_ncr_reports(status);
    `);

    // Auto-generate NCR number via sequence + trigger
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS ncr_number_seq START 1;
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION generate_ncr_number()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.ncr_number IS NULL THEN
          NEW.ncr_number := 'NCR-FP-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('ncr_number_seq')::text, 5, '0');
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trg_ncr_number ON mes_ncr_reports;
      CREATE TRIGGER trg_ncr_number
        BEFORE INSERT ON mes_ncr_reports
        FOR EACH ROW EXECUTE FUNCTION generate_ncr_number();
    `);
    console.log('  ✅ NCR auto-numbering trigger created');

    // ─────────────────────────────────────────────────────────
    // 2. CSE Comments (discussion thread) — G-005
    // ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_cse_comments (
        id                SERIAL PRIMARY KEY,
        cse_id            INTEGER NOT NULL REFERENCES mes_cse_reports(id) ON DELETE CASCADE,
        user_id           INTEGER NOT NULL,
        user_name         VARCHAR(255) NOT NULL,
        user_role         VARCHAR(50),
        comment           TEXT NOT NULL,
        is_internal       BOOLEAN NOT NULL DEFAULT FALSE,
        parent_comment_id INTEGER REFERENCES mes_cse_comments(id) ON DELETE SET NULL,
        created_at        TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_cse_comments created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cse_comments_cse ON mes_cse_comments(cse_id, created_at DESC);
    `);

    // ─────────────────────────────────────────────────────────
    // 3. CSE Revision History — G-006
    // ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_cse_revisions (
        id                    SERIAL PRIMARY KEY,
        cse_id                INTEGER NOT NULL REFERENCES mes_cse_reports(id) ON DELETE CASCADE,
        revision_number       INTEGER NOT NULL DEFAULT 1,
        action                VARCHAR(50) NOT NULL
                                CHECK (action IN ('submitted','revision_requested','revised','approved','rejected','created')),
        test_summary_snapshot JSONB,
        actor_id              INTEGER,
        actor_name            VARCHAR(255),
        notes                 TEXT,
        created_at            TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_cse_revisions created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cse_revisions_cse ON mes_cse_revisions(cse_id, created_at DESC);
    `);

    await client.query('COMMIT');
    console.log('✅ Migration #004 complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration #004 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

up().catch(() => process.exit(1));
