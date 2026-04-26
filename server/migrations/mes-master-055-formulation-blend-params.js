/**
 * Migration mes-master-055 — Formulation blend params + attachment link
 *
 * Day 3 of MATERIAL_SPECS_AND_PARSER_CONSOLIDATED_FIX_PLAN_2026-04-24.md (Phase 4).
 *
 * Models 2-K adhesives (resin + hardener) as formulation rows so that:
 *   - Each component (Part A / Part B) keeps its own non-resin spec row
 *   - The formulation parent holds the blend-only parameters (mix ratio,
 *     pot life, cure time, application temp, bond strength, tack time)
 *   - The single TDS PDF that covers both components links to the parent
 *     formulation via `mes_tds_attachments.formulation_id`
 *
 * Columns added on `mes_formulations`:
 *   - mix_ratio              VARCHAR(40)   e.g. "100:75"
 *   - pot_life_min           NUMERIC
 *   - cure_time_hours        NUMERIC
 *   - application_temp_c     NUMERIC
 *   - bond_strength_n_mm2    NUMERIC
 *   - tack_time_min          NUMERIC
 *   - is_two_component       BOOLEAN DEFAULT false
 *
 * Columns added on `mes_tds_attachments`:
 *   - formulation_id         INT  FK→mes_formulations(id) ON DELETE SET NULL
 *
 * Indexes:
 *   - idx_formulations_two_component_partial WHERE is_two_component
 *   - idx_tds_attach_formulation_id WHERE formulation_id IS NOT NULL
 *
 * `mes_formulation_components` already exposes `component_role` (text) and
 * `parts` (numeric) — that covers the role_label + parts_by_weight requirement
 * from plan §4.B step 4.2 with no schema change needed.
 *
 * Run: node server/migrations/mes-master-055-formulation-blend-params.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const FORMULATION_BLEND_COLUMNS = [
  ['mix_ratio',           'VARCHAR(40)'],
  ['pot_life_min',        'NUMERIC'],
  ['cure_time_hours',     'NUMERIC'],
  ['application_temp_c',  'NUMERIC'],
  ['bond_strength_n_mm2', 'NUMERIC'],
  ['tack_time_min',       'NUMERIC'],
  ['is_two_component',    'BOOLEAN DEFAULT false'],
];

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  console.log('Starting migration #055 — Formulation blend params + attachment link...');
  try {
    // ── 1. Add blend-param columns on mes_formulations ────────────────
    for (const [col, type] of FORMULATION_BLEND_COLUMNS) {
      await pool.query(
        `ALTER TABLE mes_formulations ADD COLUMN IF NOT EXISTS ${col} ${type}`
      );
      console.log(`  + mes_formulations.${col} ensured`);
    }

    // ── 2. Add formulation_id FK on mes_tds_attachments ───────────────
    await pool.query(
      `ALTER TABLE mes_tds_attachments ADD COLUMN IF NOT EXISTS formulation_id INT`
    );
    // Best-effort FK (ignore if it already exists)
    try {
      await pool.query(
        `ALTER TABLE mes_tds_attachments
           ADD CONSTRAINT fk_tds_attach_formulation
           FOREIGN KEY (formulation_id) REFERENCES mes_formulations(id) ON DELETE SET NULL`
      );
      console.log('  + FK fk_tds_attach_formulation added');
    } catch (e) {
      if (e.code === '42710' || /already exists/i.test(e.message)) {
        console.log('  = FK fk_tds_attach_formulation already present');
      } else {
        throw e;
      }
    }

    // ── 3. Indexes ────────────────────────────────────────────────────
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_formulations_two_component
         ON mes_formulations (is_two_component)
         WHERE is_two_component = true`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_tds_attach_formulation_id
         ON mes_tds_attachments (formulation_id)
         WHERE formulation_id IS NOT NULL`
    );
    console.log('  + indexes ensured');

    // ── 4. Verify ─────────────────────────────────────────────────────
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'mes_formulations'
          AND column_name = ANY($1::text[])`,
      [FORMULATION_BLEND_COLUMNS.map(([c]) => c)]
    );
    console.log(`  + verification: ${rows.length}/${FORMULATION_BLEND_COLUMNS.length} blend columns present`);

    console.log('Migration #055 completed successfully.');
  } catch (err) {
    console.error('Migration #055 FAILED:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
