/**
 * Migration #004 — Sample Registration + Activity History
 *
 * Creates:
 *  1. mes_presales_activity_log   — full audit trail per inquiry
 *  2. mes_presales_samples        — registered samples with unique refs + QR support
 *  3. sample number sequence + generator function
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES Pre-Sales migration #004 — Samples & History...\n');

    // ─── 1. Activity log ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_presales_activity_log (
        id            SERIAL PRIMARY KEY,
        inquiry_id    INTEGER NOT NULL REFERENCES mes_presales_inquiries(id) ON DELETE CASCADE,
        action        VARCHAR(60)  NOT NULL,
        details       JSONB        DEFAULT '{}',
        user_id       INTEGER,
        user_name     VARCHAR(150),
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_presales_activity_inquiry
        ON mes_presales_activity_log(inquiry_id, created_at DESC);
    `);
    console.log('  ✅ mes_presales_activity_log — created');

    // ─── 2. Sample registration ───────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_presales_samples (
        id              SERIAL PRIMARY KEY,
        inquiry_id      INTEGER NOT NULL REFERENCES mes_presales_inquiries(id) ON DELETE CASCADE,
        sample_number   VARCHAR(30)  UNIQUE NOT NULL,
        product_group   VARCHAR(100) NOT NULL,
        customer_name   VARCHAR(255),
        description     TEXT,
        sample_type     VARCHAR(20)  NOT NULL DEFAULT 'physical'
                        CHECK (sample_type IN ('physical','digital','both')),
        status          VARCHAR(30)  NOT NULL DEFAULT 'registered'
                        CHECK (status IN (
                          'registered',
                          'sent_to_qc',
                          'received_by_qc',
                          'testing',
                          'tested',
                          'approved',
                          'rejected'
                        )),
        -- QC tracking
        received_by_qc_user   INTEGER,
        received_by_qc_name   VARCHAR(150),
        received_at            TIMESTAMPTZ,
        qc_started_at          TIMESTAMPTZ,
        qc_completed_at        TIMESTAMPTZ,
        qc_result              VARCHAR(20) CHECK (qc_result IN ('pass','fail','conditional')),
        qc_notes               TEXT,
        -- creator
        created_by       INTEGER,
        created_by_name  VARCHAR(150),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_presales_samples_inquiry
        ON mes_presales_samples(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_presales_samples_status
        ON mes_presales_samples(status);
    `);
    console.log('  ✅ mes_presales_samples — created');

    // ─── 3. Sample number sequence + generator ────────────────────────────
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS mes_sample_seq START 1;

      CREATE OR REPLACE FUNCTION generate_sample_number(div TEXT)
      RETURNS TEXT
      LANGUAGE plpgsql AS $$
      DECLARE
        seq_val BIGINT;
      BEGIN
        seq_val := nextval('mes_sample_seq');
        RETURN 'SMP-' || div || '-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq_val::TEXT, 5, '0');
      END;
      $$;
    `);
    console.log('  ✅ Sample number sequence & generator (SMP-FP-2026-00001)');

    // ─── 4. updated_at trigger for samples ────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION trg_set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_presales_samples_updated ON mes_presales_samples;
      CREATE TRIGGER trg_presales_samples_updated
        BEFORE UPDATE ON mes_presales_samples
        FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
    `);
    console.log('  ✅ updated_at trigger on samples');

    await client.query('COMMIT');
    console.log('\n✅ MES Pre-Sales migration #004 completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration #004 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
