/**
 * MES QC Migration #005
 * G-008: QC Equipment Registry
 *
 * Creates mes_qc_equipment table for tracking which instruments/equipment
 * are used for each test parameter. Enables calibration tracking and
 * audit compliance.
 *
 * Run: node server/migrations/mes-qc-005-equipment.js
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
    console.log('🔧 Starting MES QC migration #005 — Equipment Registry...');

    // ── 1. QC Equipment table ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_qc_equipment (
        id               SERIAL PRIMARY KEY,
        name             VARCHAR(255) NOT NULL,
        equipment_code   VARCHAR(50),
        category         VARCHAR(100) DEFAULT 'general'
                           CHECK (category IN ('tensile','thickness','optical','seal','chemical','electrical','weight','general')),
        manufacturer     VARCHAR(255),
        model_number     VARCHAR(100),
        serial_number    VARCHAR(100),
        location         VARCHAR(255),
        calibration_due  DATE,
        calibrated_at    DATE,
        is_active        BOOLEAN NOT NULL DEFAULT TRUE,
        notes            TEXT,
        created_by       INTEGER,
        created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_qc_equipment created');

    // Unique index on equipment_code (nullable but unique when set)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_qc_equipment_code
        ON mes_qc_equipment(equipment_code)
        WHERE equipment_code IS NOT NULL
    `);

    // Fast lookup by category
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qc_equipment_category
        ON mes_qc_equipment(category)
        WHERE is_active = TRUE
    `);
    console.log('  ✅ Equipment indexes created');

    // ── 2. analysis_equipment — links an analysis to equipment used ──────
    // (records equipment_id and optional reading_id per parameter)
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_analysis_equipment (
        id             SERIAL PRIMARY KEY,
        analysis_id    INTEGER NOT NULL REFERENCES mes_qc_analyses(id) ON DELETE CASCADE,
        equipment_id   INTEGER NOT NULL REFERENCES mes_qc_equipment(id) ON DELETE RESTRICT,
        parameter_name VARCHAR(255),   -- which parameter this equipment was used for
        used_at        TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_equipment_analysis
        ON mes_analysis_equipment(analysis_id)
    `);
    console.log('  ✅ mes_analysis_equipment created');

    // ── 3. Seed common lab equipment ────────────────────────────────────
    const rows = await client.query(`SELECT COUNT(*) FROM mes_qc_equipment`);
    if (parseInt(rows.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO mes_qc_equipment (name, equipment_code, category, notes) VALUES
          ('Tensile Strength Tester',       'EQ-TST-001', 'tensile',   'ASTM D882 compliant'),
          ('Thickness Gauge (Digital)',      'EQ-TG-001',  'thickness', '±0.001mm precision'),
          ('Optical Haze Meter',             'EQ-HZ-001',  'optical',   'ASTM D1003'),
          ('Seal Strength Tester',           'EQ-SS-001',  'seal',      'Heat-seal peel test'),
          ('Electronic Balance (0.001g)',    'EQ-BAL-001', 'weight',    'ASTM E617'),
          ('Hot Tack Tester',                'EQ-HT-001',  'seal',      'Hot tack seal strength'),
          ('Surface Resistivity Meter',      'EQ-SR-001',  'electrical','For antistatic films'),
          ('Coefficient of Friction Tester', 'EQ-COF-001', 'general',   'ASTM D1894')
      `);
      console.log('  ✅ Seeded 8 default equipment entries');
    } else {
      console.log('  ⏭️ Equipment already seeded, skipping');
    }

    await client.query('COMMIT');
    console.log('✅ Migration #005 complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration #005 failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

up();
