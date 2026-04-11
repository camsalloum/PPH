/**
 * Migration #006 — MOQ Verification, Material Availability & Pre-Sales Clearance
 *
 * New tables:
 *   mes_presales_moq_checks      — per-sample MOQ & feasibility checks
 *   mes_presales_material_checks  — raw-material availability per inquiry
 *
 * Alters:
 *   mes_presales_inquiries        — adds moq_status, material_status,
 *                                   presales_cleared, clearance_by, clearance_at,
 *                                   presales_phase
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const logger = {
  info: (...a) => console.log('[migration-006]', ...a),
  error: (...a) => console.error('[migration-006]', ...a),
};

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. MOQ checks table ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_presales_moq_checks (
        id                    SERIAL PRIMARY KEY,
        inquiry_id            INT NOT NULL REFERENCES mes_presales_inquiries(id) ON DELETE CASCADE,
        sample_id             INT REFERENCES mes_presales_samples(id) ON DELETE SET NULL,
        product_group         VARCHAR(100),
        customer_qty          NUMERIC(14,2),
        moq_required          NUMERIC(14,2),
        unit                  VARCHAR(30) DEFAULT 'Kgs',
        meets_moq             BOOLEAN,
        production_capacity   VARCHAR(200),
        production_days       INT,
        tooling_available     BOOLEAN,
        tooling_notes         VARCHAR(500),
        feasibility_status    VARCHAR(20) DEFAULT 'pending'
                              CHECK (feasibility_status IN ('pending','feasible','not_feasible','conditional')),
        verified_by           INT,
        verified_by_name      VARCHAR(100),
        verified_at           TIMESTAMPTZ,
        notes                 TEXT,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── 2. Material availability checks table ─────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_presales_material_checks (
        id                    SERIAL PRIMARY KEY,
        inquiry_id            INT NOT NULL REFERENCES mes_presales_inquiries(id) ON DELETE CASCADE,
        material_type         VARCHAR(50) NOT NULL
                              CHECK (material_type IN ('film','ink','adhesive','solvent','cylinder','zipper','valve','other')),
        material_name         VARCHAR(200),
        specification         VARCHAR(300),
        required_qty          NUMERIC(14,2),
        available_qty         NUMERIC(14,2),
        unit                  VARCHAR(30) DEFAULT 'Kgs',
        is_available          BOOLEAN,
        supplier              VARCHAR(200),
        lead_time_days        INT,
        estimated_cost        NUMERIC(14,2),
        currency              VARCHAR(5) DEFAULT 'AED',
        status                VARCHAR(20) DEFAULT 'pending'
                              CHECK (status IN ('pending','in_stock','ordered','partial','not_available')),
        checked_by            INT,
        checked_by_name       VARCHAR(100),
        checked_at            TIMESTAMPTZ,
        notes                 TEXT,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── 3. Add tracking columns to inquiries ──────────────────────────────
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS moq_status        VARCHAR(20) DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS material_status    VARCHAR(20) DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS presales_cleared   BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS clearance_by       INT,
        ADD COLUMN IF NOT EXISTS clearance_by_name  VARCHAR(100),
        ADD COLUMN IF NOT EXISTS clearance_at       TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS presales_phase     VARCHAR(30) DEFAULT 'inquiry';
    `);

    // ── 4. Indexes ────────────────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_moq_checks_inquiry   ON mes_presales_moq_checks(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_moq_checks_sample    ON mes_presales_moq_checks(sample_id);
      CREATE INDEX IF NOT EXISTS idx_mat_checks_inquiry   ON mes_presales_material_checks(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_inquiries_phase      ON mes_presales_inquiries(presales_phase);
    `);

    await client.query('COMMIT');
    logger.info('Migration #006 (MOQ + Materials + Clearance) — UP complete');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration #006 UP failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS mes_presales_material_checks CASCADE;');
    await client.query('DROP TABLE IF EXISTS mes_presales_moq_checks CASCADE;');
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        DROP COLUMN IF EXISTS moq_status,
        DROP COLUMN IF EXISTS material_status,
        DROP COLUMN IF EXISTS presales_cleared,
        DROP COLUMN IF EXISTS clearance_by,
        DROP COLUMN IF EXISTS clearance_by_name,
        DROP COLUMN IF EXISTS clearance_at,
        DROP COLUMN IF EXISTS presales_phase;
    `);
    await client.query('COMMIT');
    logger.info('Migration #006 (MOQ + Materials + Clearance) — DOWN complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
