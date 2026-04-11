/**
 * Migration — MES QC Analysis + CSE tables
 *
 * Creates:
 *  1. mes_qc_analyses
 *  2. mes_cse_reports
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES QC migration — analysis + CSE...\n');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_qc_analyses (
        id                   SERIAL PRIMARY KEY,
        sample_id            INTEGER NOT NULL REFERENCES mes_presales_samples(id) ON DELETE CASCADE,
        inquiry_id           INTEGER NOT NULL REFERENCES mes_presales_inquiries(id) ON DELETE CASCADE,

        test_category        VARCHAR(100),
        test_parameters      JSONB DEFAULT '[]'::jsonb,

        visual_inspection    VARCHAR(20),
        print_quality        VARCHAR(20),
        seal_strength_value  DECIMAL(10,2),
        seal_strength_unit   VARCHAR(20) DEFAULT 'N/15mm',
        seal_strength_status VARCHAR(20),

        observations         TEXT,
        overall_result       VARCHAR(20),
        recommendation       TEXT,

        status               VARCHAR(20) DEFAULT 'draft',

        analyzed_by          INTEGER,
        analyzed_by_name     VARCHAR(255),
        started_at           TIMESTAMPTZ,
        submitted_at         TIMESTAMPTZ,
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_mes_qc_analyses_sample ON mes_qc_analyses(sample_id);
      CREATE INDEX IF NOT EXISTS idx_mes_qc_analyses_inquiry ON mes_qc_analyses(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_mes_qc_analyses_status ON mes_qc_analyses(status);
    `);
    console.log('  ✅ mes_qc_analyses — created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_cse_reports (
        id                     SERIAL PRIMARY KEY,
        cse_number             VARCHAR(50) UNIQUE NOT NULL,
        sample_id              INTEGER NOT NULL REFERENCES mes_presales_samples(id) ON DELETE CASCADE,
        inquiry_id             INTEGER NOT NULL REFERENCES mes_presales_inquiries(id) ON DELETE CASCADE,
        analysis_id            INTEGER NOT NULL REFERENCES mes_qc_analyses(id) ON DELETE CASCADE,

        customer_name          VARCHAR(255),
        product_group          VARCHAR(255),
        sample_number          VARCHAR(50),
        inquiry_number         VARCHAR(50),
        test_summary           JSONB,
        overall_result         VARCHAR(20),
        observations           TEXT,
        recommendation         TEXT,

        status                 VARCHAR(30) DEFAULT 'pending_qc_manager',

        qc_manager_status      VARCHAR(20),
        qc_manager_notes       TEXT,
        qc_manager_user_id     INTEGER,
        qc_manager_name        VARCHAR(255),
        qc_manager_acted_at    TIMESTAMPTZ,

        prod_manager_status    VARCHAR(20),
        prod_manager_notes     TEXT,
        prod_manager_user_id   INTEGER,
        prod_manager_name      VARCHAR(255),
        prod_manager_acted_at  TIMESTAMPTZ,

        final_status           VARCHAR(20),
        completed_at           TIMESTAMPTZ,

        created_by             INTEGER,
        created_by_name        VARCHAR(255),
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        updated_at             TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_mes_cse_reports_sample ON mes_cse_reports(sample_id);
      CREATE INDEX IF NOT EXISTS idx_mes_cse_reports_inquiry ON mes_cse_reports(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_mes_cse_reports_status ON mes_cse_reports(status);
    `);
    console.log('  ✅ mes_cse_reports — created');

    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS mes_cse_seq START 1;

      CREATE OR REPLACE FUNCTION generate_cse_number(div TEXT)
      RETURNS TEXT
      LANGUAGE plpgsql AS $$
      DECLARE
        seq_val BIGINT;
      BEGIN
        seq_val := nextval('mes_cse_seq');
        RETURN 'CSE-' || div || '-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq_val::TEXT, 5, '0');
      END;
      $$;
    `);
    console.log('  ✅ CSE sequence + generator created');

    await client.query(`
      CREATE OR REPLACE FUNCTION trg_set_mes_qc_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_mes_qc_analyses_updated ON mes_qc_analyses;
      CREATE TRIGGER trg_mes_qc_analyses_updated
        BEFORE UPDATE ON mes_qc_analyses
        FOR EACH ROW EXECUTE FUNCTION trg_set_mes_qc_updated_at();

      DROP TRIGGER IF EXISTS trg_mes_cse_reports_updated ON mes_cse_reports;
      CREATE TRIGGER trg_mes_cse_reports_updated
        BEFORE UPDATE ON mes_cse_reports
        FOR EACH ROW EXECUTE FUNCTION trg_set_mes_qc_updated_at();
    `);
    console.log('  ✅ updated_at triggers created');

    await client.query('COMMIT');
    console.log('\n✅ MES QC migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ MES QC migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
