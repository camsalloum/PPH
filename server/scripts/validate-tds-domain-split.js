/*
 * Validate Resin Core / Film Parameters split status.
 *
 * Usage:
 *   node server/scripts/validate-tds-domain-split.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const FILM_FIELDS = [
  'haze', 'gloss', 'dart_drop',
  'tear_md', 'tear_td',
  'tensile_yield_md', 'tensile_yield_td',
  'tensile_break_md', 'tensile_break_td',
  'elongation_md', 'elongation_td',
  'secant_modulus', 'secant_modulus_td',
  'puncture_force', 'puncture_energy',
  'seal_init_temp', 'seal_peak_strength',
  'hot_tack_temp', 'hot_tack_strength',
  'cof_static', 'cof_kinetic', 'cof_config',
];

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function filmNotNullSql(alias) {
  return FILM_FIELDS.map((f) => `${alias}.${f} IS NOT NULL`).join(' OR ');
}

async function main() {
  try {
    console.log('TDS Domain Split Validator');
    console.log('==========================');

    const tableCheck = await pool.query("SELECT to_regclass('public.mes_tds_film_parameters') AS table_name");
    const tableName = tableCheck.rows[0]?.table_name;
    if (!tableName) {
      console.error('FAIL: mes_tds_film_parameters table is missing. Run migration 019 first.');
      process.exit(1);
    }

    const totalRes = await pool.query('SELECT COUNT(*)::int AS c FROM mes_material_tds');
    const filmRes = await pool.query('SELECT COUNT(*)::int AS c FROM mes_tds_film_parameters');

    const legacyFilmRes = await pool.query(`
      SELECT COUNT(*)::int AS c
      FROM mes_material_tds t
      WHERE ${filmNotNullSql('t')}
    `);

    const missingBackfillRes = await pool.query(`
      SELECT COUNT(*)::int AS c
      FROM mes_material_tds t
      WHERE (${filmNotNullSql('t')})
        AND NOT EXISTS (
          SELECT 1 FROM mes_tds_film_parameters f WHERE f.tds_id = t.id
        )
    `);

    const lockCoverageRes = await pool.query(`
      SELECT COUNT(*)::int AS c
      FROM mes_tds_film_parameters f
      WHERE COALESCE(array_length(f.user_locked_fields, 1), 0) > 0
    `);

    const legacyOnlySampleRes = await pool.query(`
      SELECT t.id, t.oracle_item_code, t.brand_grade
      FROM mes_material_tds t
      WHERE (${filmNotNullSql('t')})
        AND NOT EXISTS (
          SELECT 1 FROM mes_tds_film_parameters f WHERE f.tds_id = t.id
        )
      ORDER BY t.id
      LIMIT 10
    `);

    const totals = {
      totalTds: totalRes.rows[0].c,
      filmRows: filmRes.rows[0].c,
      legacyRowsWithFilmValues: legacyFilmRes.rows[0].c,
      rowsMissingFilmBackfill: missingBackfillRes.rows[0].c,
      filmRowsWithLocks: lockCoverageRes.rows[0].c,
    };

    console.log(`Total TDS rows: ${totals.totalTds}`);
    console.log(`Film parameter rows: ${totals.filmRows}`);
    console.log(`Legacy rows with film values: ${totals.legacyRowsWithFilmValues}`);
    console.log(`Rows missing film backfill: ${totals.rowsMissingFilmBackfill}`);
    console.log(`Film rows with lock coverage: ${totals.filmRowsWithLocks}`);

    if (legacyOnlySampleRes.rows.length) {
      console.log('\nSample rows missing film backfill (max 10):');
      legacyOnlySampleRes.rows.forEach((r) => {
        console.log(`- id=${r.id} item=${r.oracle_item_code || 'N/A'} grade=${r.brand_grade || 'N/A'}`);
      });
    }

    if (totals.rowsMissingFilmBackfill > 0) {
      console.warn('\nWARN: Found rows that still hold film values only in legacy table.');
      process.exitCode = 2;
    } else {
      console.log('\nPASS: Film parameter split is structurally consistent.');
    }
  } catch (err) {
    console.error('Validator failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
