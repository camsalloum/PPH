/**
 * MES Migration 057 - Alu foil composition_limits JSONB soft cutover
 *
 * Adds a first-class composition_limits JSONB column to the canonical substrates
 * spec table, backfills from the legacy per-element JSON keys, and switches the
 * alu foil parameter schema to a single JSON field.
 *
 * Idempotent: safe to re-run.
 */
const { pool } = require('../database/config');

const LEGACY_COMPOSITION_KEYS = [
  'silicon_min_pct', 'silicon_max_pct',
  'iron_min_pct', 'iron_max_pct',
  'copper_max_pct',
  'manganese_max_pct',
  'magnesium_max_pct',
  'zinc_max_pct',
  'titanium_max_pct',
  'chromium_max_pct',
  'nickel_max_pct',
  'lead_max_pct',
  'aluminium_min_pct',
  'others_each_max_pct',
  'others_total_max_pct',
];

const COMPOSITION_MAP = [
  ['Si', 'silicon_min_pct', 'silicon_max_pct'],
  ['Fe', 'iron_min_pct', 'iron_max_pct'],
  ['Cu', null, 'copper_max_pct'],
  ['Mn', null, 'manganese_max_pct'],
  ['Mg', null, 'magnesium_max_pct'],
  ['Zn', null, 'zinc_max_pct'],
  ['Ti', null, 'titanium_max_pct'],
  ['Cr', null, 'chromium_max_pct'],
  ['Ni', null, 'nickel_max_pct'],
  ['Pb', null, 'lead_max_pct'],
  ['Al', 'aluminium_min_pct', null],
  ['OthersEach', null, 'others_each_max_pct'],
  ['OthersTotal', null, 'others_total_max_pct'],
];

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildCompositionLimits(params = {}) {
  const existing = params.composition_limits;
  if (existing && typeof existing === 'object' && !Array.isArray(existing) && Object.keys(existing).length) {
    return existing;
  }

  const out = {};
  for (const [symbol, minKey, maxKey] of COMPOSITION_MAP) {
    const min = minKey ? numberOrNull(params[minKey]) : null;
    const max = maxKey ? numberOrNull(params[maxKey]) : null;
    if (min !== null || max !== null) {
      out[symbol] = {
        ...(min !== null ? { min } : {}),
        ...(max !== null ? { max } : {}),
      };
    }
  }
  return out;
}

function stripLegacyCompositionKeys(params = {}, compositionLimits = {}) {
  const next = { ...params };
  for (const key of LEGACY_COMPOSITION_KEYS) delete next[key];
  if (compositionLimits && Object.keys(compositionLimits).length) {
    next.composition_limits = compositionLimits;
  }
  return next;
}

async function resolveSubstratesSpecTable(client) {
  const { rows } = await client.query(`
    SELECT
      to_regclass('public.mes_spec_substrates') AS substrates,
      to_regclass('public.mes_spec_films') AS films
  `);
  if (rows[0]?.substrates) return 'mes_spec_substrates';
  if (rows[0]?.films) return 'mes_spec_films';
  throw new Error('Neither mes_spec_substrates nor mes_spec_films exists');
}

async function backfillSpecTable(client, specTable) {
  const { rows } = await client.query(`
    SELECT material_key, parameters_json, composition_limits
    FROM ${specTable}
    WHERE parameters_json ?| $1::text[]
       OR composition_limits IS NOT NULL
  `, [[...LEGACY_COMPOSITION_KEYS, 'composition_limits']]);

  let updated = 0;
  for (const row of rows) {
    const params = row.parameters_json || {};
    const compositionLimits = buildCompositionLimits({ ...params, composition_limits: row.composition_limits || params.composition_limits });
    const nextParams = stripLegacyCompositionKeys(params, compositionLimits);

    await client.query(
      `UPDATE ${specTable}
          SET composition_limits = $2::jsonb,
              parameters_json = $3::jsonb,
              updated_at = NOW()
        WHERE material_key = $1`,
      [row.material_key, JSON.stringify(compositionLimits), JSON.stringify(nextParams)]
    );
    updated += 1;
  }
  return updated;
}

async function backfillLegacyTable(client) {
  const { rows } = await client.query(`
    SELECT material_class, material_key, parameters_json
    FROM mes_non_resin_material_specs
    WHERE material_class = 'substrates'
      AND (parameters_json ?| $1::text[])
  `, [[...LEGACY_COMPOSITION_KEYS, 'composition_limits']]);

  let updated = 0;
  for (const row of rows) {
    const params = row.parameters_json || {};
    const compositionLimits = buildCompositionLimits(params);
    const nextParams = stripLegacyCompositionKeys(params, compositionLimits);
    await client.query(
      `UPDATE mes_non_resin_material_specs
          SET parameters_json = $3::jsonb,
              updated_at = NOW()
        WHERE material_class = $1 AND material_key = $2`,
      [row.material_class, row.material_key, JSON.stringify(nextParams)]
    );
    updated += 1;
  }
  return updated;
}

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('MES migration 057 - alu composition_limits JSONB');
    await client.query('BEGIN');

    const specTable = await resolveSubstratesSpecTable(client);
    await client.query(`ALTER TABLE ${specTable} ADD COLUMN IF NOT EXISTS composition_limits JSONB`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_${specTable}_composition_limits ON ${specTable} USING GIN(composition_limits)`);

    const specUpdated = await backfillSpecTable(client, specTable);
    const legacyUpdated = await backfillLegacyTable(client);

    await client.query(`
      DELETE FROM mes_parameter_definitions
      WHERE material_class = 'substrates'
        AND profile = 'substrates_alu_foil'
        AND field_key = ANY($1::text[])
    `, [LEGACY_COMPOSITION_KEYS]);

    await client.query(`
      INSERT INTO mes_parameter_definitions
        (material_class, profile, field_key, label, unit, field_type, is_required,
         sort_order, is_core, display_width, display_group, help_text)
      VALUES
        ('substrates', 'substrates_alu_foil', 'composition_limits', 'Composition Limits', '%', 'json', false,
         40, true, 24, 'Chemical Composition', 'Per-element min/max composition limits as percentages')
      ON CONFLICT (material_class, field_key, profile) DO UPDATE SET
        label = EXCLUDED.label,
        unit = EXCLUDED.unit,
        field_type = EXCLUDED.field_type,
        is_required = EXCLUDED.is_required,
        sort_order = EXCLUDED.sort_order,
        is_core = EXCLUDED.is_core,
        display_width = EXCLUDED.display_width,
        display_group = EXCLUDED.display_group,
        help_text = EXCLUDED.help_text,
        updated_at = NOW()
    `);

    await client.query('COMMIT');
    console.log(`migration 057 applied (${specTable} rows updated: ${specUpdated}, legacy rows updated: ${legacyUpdated})`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('migration 057 failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate().then(() => pool.end()).catch(() => { pool.end(); process.exit(1); });
}

module.exports = { migrate };