/**
 * Migration mes-master-053 — Greaseproof Profile + enum_options Column
 *
 * Day 2 of MATERIAL_SPECS_AND_PARSER_CONSOLIDATED_FIX_PLAN_2026-04-24.md (Phase 3).
 *
 * Combines:
 *  - S-01: New `substrates_greaseproof` profile (12 params, incl. 3 grease-specific
 *    fields: grease_resistance_hours, coating_type, coat_weight_gsm).
 *  - S-04: Add `enum_options TEXT[]` column on mes_parameter_definitions and
 *    backfill known enums (treatment_side, dead_fold, surface_type,
 *    thermoformability, coating_type).
 *  - Updates `mes_category_mapping` so 'GREASEPROOF' Oracle keyword maps to
 *    substrates / mes_spec_substrates with the new profile detected client-side.
 *
 * Note: Greaseproof rows live in `mes_spec_substrates` (the canonical table
 * since migration 038), distinguished by `substrate_profile = 'greaseproof'`.
 * No new spec table is created — the JSONB-based substrates table already
 * supports per-profile parameters.
 *
 * Run: node server/migrations/mes-master-053-greaseproof-and-enums.js
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

// ─── Greaseproof parameter definitions (12 fields) ─────────────────────────
// Reuses the standard PAP/paper baseline (9 fields) + 3 grease-specific fields.
const GREASEPROOF_PARAMS = [
  // Physical
  { key: 'grammage_gsm',              label: 'Grammage',              unit: 'g/m2', type: 'number', step: 0.1, min: 20,  max: 200, required: true,  sort: 1 },
  { key: 'thickness_mic',             label: 'Caliper',               unit: 'um',   type: 'number', step: 0.1, min: 20,  max: 200,                  sort: 2 },
  { key: 'density_g_cm3',             label: 'Density',               unit: 'g/cm3', type: 'number', step: 0.001, min: 0.5, max: 2,                sort: 3 },
  // Mechanical
  { key: 'tensile_strength_md_n_15mm', label: 'Tensile Strength MD',   unit: 'N/15mm', type: 'number', step: 0.1, min: 5,  max: 200,                sort: 4 },
  { key: 'tensile_strength_td_n_15mm', label: 'Tensile Strength TD',   unit: 'N/15mm', type: 'number', step: 0.1, min: 5,  max: 200,                sort: 5 },
  { key: 'burst_strength_kpa',        label: 'Burst Strength',        unit: 'kPa',  type: 'number', step: 1,   min: 50,  max: 800,                  sort: 6 },
  // Surface / Barrier
  { key: 'cobb_60_g_m2',              label: 'Cobb-60',               unit: 'g/m2', type: 'number', step: 0.1, min: 0,   max: 100,                  sort: 7 },
  { key: 'porosity_gurley_s',         label: 'Porosity (Gurley)',     unit: 's',    type: 'number', step: 1,   min: 1,   max: 10000,                sort: 8 },
  { key: 'moisture_pct',              label: 'Moisture',              unit: '%',    type: 'number', step: 0.1, min: 0,   max: 20,                   sort: 9 },
  // Greaseproof-specific (S-01)
  { key: 'grease_resistance_hours',   label: 'Grease Resistance',     unit: 'hours', type: 'number', step: 1,   min: 1,   max: 48, required: true,   sort: 10 },
  { key: 'coating_type',              label: 'Coating Type',          unit: '-',    type: 'text',  maxLength: 40,                                   sort: 11,
    enum: ['Silicone', 'PTFE', 'Wax', 'Emulsion', 'Fluorocarbon', 'Quilon', 'Other'] },
  { key: 'coat_weight_gsm',           label: 'Coat Weight',           unit: 'g/m2', type: 'number', step: 0.01, min: 0,  max: 30,                   sort: 12 },
];

// ─── Known enums to backfill across existing parameter definitions (S-04) ──
// Applies anywhere the field_key appears (across all profiles).
const ENUM_BACKFILL = {
  treatment_side:    ['Untreated', 'One Side', 'Both Sides', 'Inside', 'Outside'],
  dead_fold:         ['Poor', 'Fair', 'Good', 'Excellent'],
  surface_type:      ['Matte', 'Glossy', 'Semi-Glossy', 'Embossed', 'Smooth', 'Textured'],
  surface_finish:    ['Bright', 'Matte', 'Mill', 'Satin', 'Brushed'],
  thermoformability: ['Poor', 'Fair', 'Good', 'Excellent'],
  coating_type:      ['Silicone', 'PTFE', 'Wax', 'Emulsion', 'Fluorocarbon', 'Quilon', 'Other'],
  carrier_resin:     ['LDPE', 'LLDPE', 'HDPE', 'PP', 'EVA', 'Other'],
  appearance:        ['Clear', 'Hazy', 'Opaque', 'Pigmented', 'Transparent'],
  functionality:     ['Adhesive', 'Sealant', 'Primer', 'Coating', 'Other'],
};

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting migration #053 — Greaseproof profile + enum_options...');
    await client.query('BEGIN');

    // ─── 1. Add enum_options TEXT[] column ────────────────────────────────
    await client.query(`
      ALTER TABLE mes_parameter_definitions
      ADD COLUMN IF NOT EXISTS enum_options TEXT[] DEFAULT NULL
    `);
    console.log('  + enum_options TEXT[] column ensured');

    // ─── 2. Backfill enum_options for known enum fields ───────────────────
    let enumUpdated = 0;
    for (const [fieldKey, options] of Object.entries(ENUM_BACKFILL)) {
      const r = await client.query(
        `UPDATE mes_parameter_definitions
            SET enum_options = $2::text[], updated_at = NOW()
          WHERE field_key = $1 AND (enum_options IS NULL OR cardinality(enum_options) = 0)`,
        [fieldKey, options]
      );
      if (r.rowCount > 0) {
        console.log(`  + ${fieldKey}: ${r.rowCount} row(s) backfilled`);
        enumUpdated += r.rowCount;
      }
    }
    console.log(`  + total enum backfill rows: ${enumUpdated}`);

    // ─── 3. Seed Greaseproof parameter definitions ────────────────────────
    let inserted = 0;
    for (const p of GREASEPROOF_PARAMS) {
      await client.query(
        `INSERT INTO mes_parameter_definitions
           (material_class, profile, field_key, label, unit, field_type,
            step, min_value, max_value, max_length, is_required, sort_order, enum_options)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (material_class, field_key, profile) DO UPDATE SET
           label = EXCLUDED.label, unit = EXCLUDED.unit, field_type = EXCLUDED.field_type,
           step = EXCLUDED.step, min_value = EXCLUDED.min_value, max_value = EXCLUDED.max_value,
           max_length = EXCLUDED.max_length, is_required = EXCLUDED.is_required,
           sort_order = EXCLUDED.sort_order, enum_options = EXCLUDED.enum_options,
           updated_at = NOW()`,
        [
          'substrates',
          'substrates_greaseproof',
          p.key,
          p.label,
          p.unit || null,
          p.type || 'number',
          p.step || null,
          p.min ?? null,
          p.max ?? null,
          p.maxLength || null,
          !!p.required,
          p.sort,
          p.enum || null,
        ]
      );
      inserted++;
    }
    console.log(`  + ${inserted} greaseproof parameter definitions seeded`);

    // ─── 4. Update mes_category_mapping for GREASEPROOF Oracle key ────────
    // Make sure typical Oracle category strings route to substrates table.
    // Many existing items use category like "GREASEPROOF" or "GREASE PROOF".
    const greaseproofCategories = ['GREASEPROOF', 'GREASE PROOF', 'GREASE-PROOF'];
    for (const oc of greaseproofCategories) {
      await client.query(
        `INSERT INTO mes_category_mapping
           (oracle_category, material_class, display_label, has_parameters, is_active, sort_order)
         VALUES ($1, 'substrates', 'Greaseproof', true, true, 2)
         ON CONFLICT (oracle_category) DO UPDATE SET
           material_class = 'substrates',
           display_label = COALESCE(NULLIF(mes_category_mapping.display_label, ''), 'Greaseproof'),
           has_parameters = true,
           is_active = true,
           updated_at = NOW()`,
        [oc]
      );
    }
    console.log(`  + greaseproof category mappings ensured`);

    // ─── 5. Verify ────────────────────────────────────────────────────────
    const { rows: gpCount } = await client.query(
      `SELECT COUNT(*)::int AS n FROM mes_parameter_definitions WHERE profile = 'substrates_greaseproof'`
    );
    const { rows: enumCount } = await client.query(
      `SELECT COUNT(*)::int AS n FROM mes_parameter_definitions WHERE enum_options IS NOT NULL`
    );
    console.log(`  + verification: substrates_greaseproof params=${gpCount[0].n}, rows with enum_options=${enumCount[0].n}`);

    if (gpCount[0].n < GREASEPROOF_PARAMS.length) {
      throw new Error(`Greaseproof seed mismatch: expected ${GREASEPROOF_PARAMS.length}, got ${gpCount[0].n}`);
    }

    await client.query('COMMIT');
    console.log('Migration #053 completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #053 failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
