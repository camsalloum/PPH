/**
 * Migration mes-master-030 — Category-Specific Parameter Tables
 *
 * Creates dedicated parameter tables for each spec-enabled material class,
 * replacing the single JSONB mes_non_resin_material_specs table.
 * Migrates existing 'films' JSONB data into mes_spec_films.
 *
 * Run: node server/migrations/mes-master-030-category-param-tables.js
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

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting MES migration #030 — Category-Specific Parameter Tables...');
    await client.query('BEGIN');

    // ── Shared columns for all spec tables ──────────────────────────────────
    const SHARED_COLS = `
      id              SERIAL PRIMARY KEY,
      material_key    TEXT NOT NULL,
      mainitem        TEXT,
      maindescription TEXT,
      catlinedesc     TEXT,
      mainunit        TEXT,
      supplier_name   TEXT,
      notes           TEXT,
      status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','review','verified','standard','corrected')),
      user_locked_fields TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
      created_by      INTEGER,
      updated_by      INTEGER,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;

    // ── 1. mes_spec_films (Substrates / Films) ───────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_spec_films (
        ${SHARED_COLS},
        substrate_profile   VARCHAR(40),  -- bopp, cpp, pet, pa, pe, pvc, petc, petg, pap, alu_foil, alu_pap
        parameters_json     JSONB NOT NULL DEFAULT '{}'::JSONB,
        CONSTRAINT uq_spec_films UNIQUE (material_key)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_spec_films_profile ON mes_spec_films(substrate_profile)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_spec_films_catline ON mes_spec_films(catlinedesc)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_spec_films_params  ON mes_spec_films USING GIN(parameters_json)`);
    console.log('  + mes_spec_films created');

    // ── 2. mes_spec_adhesives ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_spec_adhesives (
        ${SHARED_COLS},
        solids_pct      DECIMAL(6,2),
        viscosity_cps   DECIMAL(10,2),
        density_g_cm3   DECIMAL(6,4),
        mix_ratio       VARCHAR(30),
        pot_life_min    DECIMAL(8,2),
        parameters_json JSONB NOT NULL DEFAULT '{}'::JSONB,
        CONSTRAINT uq_spec_adhesives UNIQUE (material_key)
      )
    `);
    console.log('  + mes_spec_adhesives created');

    // ── 3. mes_spec_chemicals ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_spec_chemicals (
        ${SHARED_COLS},
        purity_pct      DECIMAL(6,2),
        density_g_cm3   DECIMAL(6,4),
        boiling_point_c DECIMAL(8,2),
        flash_point_c   DECIMAL(8,2),
        viscosity_cps   DECIMAL(10,2),
        parameters_json JSONB NOT NULL DEFAULT '{}'::JSONB,
        CONSTRAINT uq_spec_chemicals UNIQUE (material_key)
      )
    `);
    console.log('  + mes_spec_chemicals created');

    // ── 4. mes_spec_additives ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_spec_additives (
        ${SHARED_COLS},
        dosage_pct          DECIMAL(8,4),
        carrier_resin       VARCHAR(100),
        active_content_pct  DECIMAL(6,2),
        moisture_pct        DECIMAL(6,3),
        ash_pct             DECIMAL(6,3),
        parameters_json     JSONB NOT NULL DEFAULT '{}'::JSONB,
        CONSTRAINT uq_spec_additives UNIQUE (material_key)
      )
    `);
    console.log('  + mes_spec_additives created');

    // ── 5. mes_spec_coating ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_spec_coating (
        ${SHARED_COLS},
        solids_pct      DECIMAL(6,2),
        viscosity_cps   DECIMAL(10,2),
        coat_weight_gsm DECIMAL(8,3),
        gloss_60deg     DECIMAL(6,2),
        cure_temp_c     DECIMAL(6,1),
        parameters_json JSONB NOT NULL DEFAULT '{}'::JSONB,
        CONSTRAINT uq_spec_coating UNIQUE (material_key)
      )
    `);
    console.log('  + mes_spec_coating created');

    // ── 6. mes_spec_packing_materials ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_spec_packing_materials (
        ${SHARED_COLS},
        length_mm       DECIMAL(10,2),
        width_mm        DECIMAL(10,2),
        gsm             DECIMAL(8,2),
        burst_strength  DECIMAL(8,2),
        moisture_pct    DECIMAL(6,3),
        parameters_json JSONB NOT NULL DEFAULT '{}'::JSONB,
        CONSTRAINT uq_spec_packing_materials UNIQUE (material_key)
      )
    `);
    console.log('  + mes_spec_packing_materials created');

    // ── 7. mes_spec_mounting_tapes ───────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_spec_mounting_tapes (
        ${SHARED_COLS},
        thickness_um        DECIMAL(10,2),
        adhesion_n_25mm     DECIMAL(8,3),
        tensile_n_25mm      DECIMAL(8,3),
        elongation_pct      DECIMAL(8,2),
        temp_resistance_c   DECIMAL(6,1),
        parameters_json     JSONB NOT NULL DEFAULT '{}'::JSONB,
        CONSTRAINT uq_spec_mounting_tapes UNIQUE (material_key)
      )
    `);
    console.log('  + mes_spec_mounting_tapes created');

    // ── Migrate existing films data from mes_non_resin_material_specs ────────
    const { rows: existing } = await client.query(`
      SELECT material_key, mainitem, maindescription, catlinedesc, mainunit,
             supplier_name, notes, status, user_locked_fields,
             parameters_json, created_by, updated_by, created_at, updated_at
      FROM mes_non_resin_material_specs
      WHERE material_class = 'films'
    `);

    let migrated = 0;
    for (const row of existing) {
      await client.query(`
        INSERT INTO mes_spec_films
          (material_key, mainitem, maindescription, catlinedesc, mainunit,
           supplier_name, notes, status, user_locked_fields,
           parameters_json, created_by, updated_by, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (material_key) DO UPDATE SET
          parameters_json    = EXCLUDED.parameters_json,
          status             = EXCLUDED.status,
          updated_at         = NOW()
      `, [
        row.material_key, row.mainitem, row.maindescription, row.catlinedesc,
        row.mainunit, row.supplier_name, row.notes, row.status,
        row.user_locked_fields, row.parameters_json,
        row.created_by, row.updated_by, row.created_at, row.updated_at,
      ]);
      migrated++;
    }
    console.log(`  + Migrated ${migrated} films records → mes_spec_films`);

    // ── Register new tables in mes_category_mapping ──────────────────────────
    const TABLE_MAP = [
      ['films',            'mes_spec_films'],
      ['adhesives',        'mes_spec_adhesives'],
      ['chemicals',        'mes_spec_chemicals'],
      ['additives',        'mes_spec_additives'],
      ['coating',          'mes_spec_coating'],
      ['packing_materials','mes_spec_packing_materials'],
      ['mounting_tapes',   'mes_spec_mounting_tapes'],
    ];
    for (const [cls, tbl] of TABLE_MAP) {
      await client.query(`
        ALTER TABLE mes_category_mapping
        ADD COLUMN IF NOT EXISTS spec_table VARCHAR(60)
      `);
      await client.query(`
        UPDATE mes_category_mapping SET spec_table = $1 WHERE material_class = $2
      `, [tbl, cls]);
    }
    console.log('  + spec_table column added to mes_category_mapping');

    await client.query('COMMIT');
    console.log('\nMigration #030 completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #030 failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
