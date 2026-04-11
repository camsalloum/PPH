/**
 * MES QC Migration #003
 * G-001: QC Inspection Templates
 * G-002: Formula-based acceptance criteria fields
 *
 * Run: node server/migrations/mes-qc-003-templates.js
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
    console.log('🔧 Starting MES QC migration #003 — Templates...');

    // ─────────────────────────────────────────────────────────
    // 1. QC Inspection Templates table
    // ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_qc_templates (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(255) NOT NULL,
        product_group VARCHAR(255),
        test_category VARCHAR(100) NOT NULL DEFAULT 'physical'
                        CHECK (test_category IN ('physical','print','seal','optical','chemical')),

        -- Array of parameter definitions:
        -- [{name, spec, min_value, max_value, unit, method, acceptance_formula}]
        parameters    JSONB NOT NULL DEFAULT '[]',

        notes         TEXT,
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        created_by    INTEGER,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_qc_templates created');

    // Index for fast lookup by product_group
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qc_templates_product_group
        ON mes_qc_templates(product_group)
        WHERE is_active = TRUE
    `);
    console.log('  ✅ idx_qc_templates_product_group created');

    // ─────────────────────────────────────────────────────────
    // 2. Seed default templates for common product groups
    //    (Admin can edit/delete/add via the template management UI)
    // ─────────────────────────────────────────────────────────
    const defaultTemplates = [
      {
        name: 'Flexible Packaging — Physical',
        product_group: 'Flexible Packaging',
        test_category: 'physical',
        parameters: JSON.stringify([
          { name: 'Thickness', spec: 'As per TDS', min_value: null, max_value: null, unit: 'μm',      method: 'Micrometer',       acceptance_formula: '' },
          { name: 'Width',     spec: 'As per drawing', min_value: null, max_value: null, unit: 'mm', method: 'Steel rule',       acceptance_formula: '' },
          { name: 'Length',    spec: 'As per drawing', min_value: null, max_value: null, unit: 'm',  method: 'Measuring tape',   acceptance_formula: '' },
          { name: 'GSM',       spec: 'As per TDS',     min_value: null, max_value: null, unit: 'g/m²', method: 'GSM Balance',   acceptance_formula: '' },
        ]),
      },
      {
        name: 'Shrink Film — Seal + Physical',
        product_group: 'Shrink Film',
        test_category: 'seal',
        parameters: JSON.stringify([
          { name: 'Seal Strength',  spec: 'Min 10 N/15mm', min_value: 10, max_value: null,   unit: 'N/15mm', method: 'Tensile Tester', acceptance_formula: 'result >= 10' },
          { name: 'Shrink ratio',   spec: '40-60%',         min_value: 40, max_value: 60,     unit: '%',      method: 'Oven test',      acceptance_formula: 'result >= 40 && result <= 60' },
          { name: 'Haze',           spec: '< 5%',           min_value: null, max_value: 5,   unit: '%',      method: 'Haze meter',     acceptance_formula: 'result <= 5' },
        ]),
      },
      {
        name: 'Printed Material — Print Quality',
        product_group: null,
        test_category: 'print',
        parameters: JSON.stringify([
          { name: 'Color Density',     spec: 'Visual standard', min_value: null, max_value: null, unit: '',    method: 'Spectrophotometer', acceptance_formula: '' },
          { name: 'Registration',      spec: 'Max ±0.5mm',      min_value: null, max_value: 0.5,  unit: 'mm', method: 'Loupe',             acceptance_formula: 'result <= 0.5' },
          { name: 'Print Adhesion',    spec: 'No ink transfer',  min_value: null, max_value: null, unit: '',    method: 'Tape test',         acceptance_formula: '' },
          { name: 'Surface Tension',   spec: 'Min 38 dynes',     min_value: 38,   max_value: null, unit: 'dynes', method: 'Dyne pens',      acceptance_formula: 'result >= 38' },
        ]),
      },
    ];

    for (const t of defaultTemplates) {
      await client.query(
        `INSERT INTO mes_qc_templates (name, product_group, test_category, parameters)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT DO NOTHING`,
        [t.name, t.product_group, t.test_category, t.parameters]
      );
    }
    console.log('  ✅ Default templates seeded');

    await client.query('COMMIT');
    console.log('✅ Migration #003 complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration #003 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

up().catch(() => process.exit(1));
