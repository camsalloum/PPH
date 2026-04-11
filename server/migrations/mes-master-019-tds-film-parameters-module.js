/*
 * Migration mes-master-019 — TDS Film Parameters Module
 *
 * Adds dedicated table for film-converted performance metrics so Resin Core stays clean.
 * Also backfills existing film metrics from mes_material_tds.
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

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting MES migration #019 — TDS Film Parameters Module...');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_tds_film_parameters (
        id                  SERIAL PRIMARY KEY,
        tds_id               INTEGER NOT NULL UNIQUE REFERENCES mes_material_tds(id) ON DELETE CASCADE,
        process_type         VARCHAR(50),

        haze                 DECIMAL(6,2),
        gloss                DECIMAL(6,2),
        dart_drop            INTEGER,
        tear_md              DECIMAL(8,1),
        tear_td              DECIMAL(8,1),
        tensile_yield_md     DECIMAL(8,2),
        tensile_yield_td     DECIMAL(8,2),
        tensile_break_md     DECIMAL(8,2),
        tensile_break_td     DECIMAL(8,2),
        elongation_md        INTEGER,
        elongation_td        INTEGER,
        secant_modulus       DECIMAL(8,1),
        secant_modulus_td    DECIMAL(8,1),
        puncture_force       DECIMAL(8,2),
        puncture_energy      DECIMAL(8,3),
        seal_init_temp       INTEGER,
        seal_peak_strength   DECIMAL(6,2),
        hot_tack_temp        INTEGER,
        hot_tack_strength    DECIMAL(6,2),
        cof_static           DECIMAL(5,3),
        cof_kinetic          DECIMAL(5,3),
        cof_config           VARCHAR(50),

        user_locked_fields   TEXT[] DEFAULT '{}'::TEXT[],
        created_by           INTEGER,
        updated_by           INTEGER,
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('  + mes_tds_film_parameters table created');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_film_params_tds ON mes_tds_film_parameters(tds_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_film_params_process ON mes_tds_film_parameters(process_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_film_params_locked_fields ON mes_tds_film_parameters USING GIN (user_locked_fields)`);
    console.log('  + indexes created');

    const arrayLiteral = `'{${FILM_FIELDS.join(',')}}'`;

    await client.query(`
      INSERT INTO mes_tds_film_parameters (
        tds_id, process_type,
        haze, gloss, dart_drop,
        tear_md, tear_td,
        tensile_yield_md, tensile_yield_td,
        tensile_break_md, tensile_break_td,
        elongation_md, elongation_td,
        secant_modulus, secant_modulus_td,
        puncture_force, puncture_energy,
        seal_init_temp, seal_peak_strength,
        hot_tack_temp, hot_tack_strength,
        cof_static, cof_kinetic, cof_config,
        user_locked_fields,
        created_by, updated_by
      )
      SELECT
        t.id,
        CASE
          WHEN t.production_process ILIKE '%blown%' THEN 'blown_film'
          WHEN t.production_process ILIKE '%cast%' THEN 'cast_film'
          WHEN t.production_process ILIKE '%injection%' THEN 'injection_molded'
          ELSE NULL
        END AS process_type,
        t.haze, t.gloss, t.dart_drop,
        t.tear_md, t.tear_td,
        t.tensile_yield_md, t.tensile_yield_td,
        t.tensile_break_md, t.tensile_break_td,
        t.elongation_md, t.elongation_td,
        t.secant_modulus, t.secant_modulus_td,
        t.puncture_force, t.puncture_energy,
        t.seal_init_temp, t.seal_peak_strength,
        t.hot_tack_temp, t.hot_tack_strength,
        t.cof_static, t.cof_kinetic, t.cof_config,
        COALESCE(
          ARRAY(
            SELECT f
            FROM unnest(COALESCE(t.user_locked_fields, '{}'::TEXT[])) AS f
            WHERE f = ANY(${arrayLiteral}::TEXT[])
          ),
          '{}'::TEXT[]
        ) AS user_locked_fields,
        t.created_by,
        t.created_by
      FROM mes_material_tds t
      WHERE (
        t.haze IS NOT NULL OR t.gloss IS NOT NULL OR t.dart_drop IS NOT NULL OR
        t.tear_md IS NOT NULL OR t.tear_td IS NOT NULL OR
        t.tensile_yield_md IS NOT NULL OR t.tensile_yield_td IS NOT NULL OR
        t.tensile_break_md IS NOT NULL OR t.tensile_break_td IS NOT NULL OR
        t.elongation_md IS NOT NULL OR t.elongation_td IS NOT NULL OR
        t.secant_modulus IS NOT NULL OR t.secant_modulus_td IS NOT NULL OR
        t.puncture_force IS NOT NULL OR t.puncture_energy IS NOT NULL OR
        t.seal_init_temp IS NOT NULL OR t.seal_peak_strength IS NOT NULL OR
        t.hot_tack_temp IS NOT NULL OR t.hot_tack_strength IS NOT NULL OR
        t.cof_static IS NOT NULL OR t.cof_kinetic IS NOT NULL OR t.cof_config IS NOT NULL
      )
      ON CONFLICT (tds_id) DO UPDATE
      SET
        process_type = COALESCE(EXCLUDED.process_type, mes_tds_film_parameters.process_type),
        haze = COALESCE(EXCLUDED.haze, mes_tds_film_parameters.haze),
        gloss = COALESCE(EXCLUDED.gloss, mes_tds_film_parameters.gloss),
        dart_drop = COALESCE(EXCLUDED.dart_drop, mes_tds_film_parameters.dart_drop),
        tear_md = COALESCE(EXCLUDED.tear_md, mes_tds_film_parameters.tear_md),
        tear_td = COALESCE(EXCLUDED.tear_td, mes_tds_film_parameters.tear_td),
        tensile_yield_md = COALESCE(EXCLUDED.tensile_yield_md, mes_tds_film_parameters.tensile_yield_md),
        tensile_yield_td = COALESCE(EXCLUDED.tensile_yield_td, mes_tds_film_parameters.tensile_yield_td),
        tensile_break_md = COALESCE(EXCLUDED.tensile_break_md, mes_tds_film_parameters.tensile_break_md),
        tensile_break_td = COALESCE(EXCLUDED.tensile_break_td, mes_tds_film_parameters.tensile_break_td),
        elongation_md = COALESCE(EXCLUDED.elongation_md, mes_tds_film_parameters.elongation_md),
        elongation_td = COALESCE(EXCLUDED.elongation_td, mes_tds_film_parameters.elongation_td),
        secant_modulus = COALESCE(EXCLUDED.secant_modulus, mes_tds_film_parameters.secant_modulus),
        secant_modulus_td = COALESCE(EXCLUDED.secant_modulus_td, mes_tds_film_parameters.secant_modulus_td),
        puncture_force = COALESCE(EXCLUDED.puncture_force, mes_tds_film_parameters.puncture_force),
        puncture_energy = COALESCE(EXCLUDED.puncture_energy, mes_tds_film_parameters.puncture_energy),
        seal_init_temp = COALESCE(EXCLUDED.seal_init_temp, mes_tds_film_parameters.seal_init_temp),
        seal_peak_strength = COALESCE(EXCLUDED.seal_peak_strength, mes_tds_film_parameters.seal_peak_strength),
        hot_tack_temp = COALESCE(EXCLUDED.hot_tack_temp, mes_tds_film_parameters.hot_tack_temp),
        hot_tack_strength = COALESCE(EXCLUDED.hot_tack_strength, mes_tds_film_parameters.hot_tack_strength),
        cof_static = COALESCE(EXCLUDED.cof_static, mes_tds_film_parameters.cof_static),
        cof_kinetic = COALESCE(EXCLUDED.cof_kinetic, mes_tds_film_parameters.cof_kinetic),
        cof_config = COALESCE(EXCLUDED.cof_config, mes_tds_film_parameters.cof_config),
        user_locked_fields = (
          SELECT ARRAY(
            SELECT DISTINCT unnest(COALESCE(mes_tds_film_parameters.user_locked_fields, '{}'::TEXT[]) || COALESCE(EXCLUDED.user_locked_fields, '{}'::TEXT[]))
          )
        ),
        updated_at = NOW();
    `);
    console.log('  + backfill from mes_material_tds complete');

    await client.query('COMMIT');
    console.log('Migration #019 completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #019 failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
