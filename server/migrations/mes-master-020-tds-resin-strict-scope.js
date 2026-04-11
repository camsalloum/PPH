/**
 * Migration mes-master-020 — TDS strict resin scope columns
 *
 * Adds strict resin technical fields to mes_material_tds and backfills
 * from legacy resin columns where possible.
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
    console.log('Starting MES migration #020 — TDS strict resin scope...');

    await client.query(`
      ALTER TABLE mes_material_tds
        ADD COLUMN IF NOT EXISTS mfr_190_2_16                    DECIMAL(8,3),
        ADD COLUMN IF NOT EXISTS mfr_190_2_16_test_method        VARCHAR(100),
        ADD COLUMN IF NOT EXISTS mfr_190_5_0                     DECIMAL(8,3),
        ADD COLUMN IF NOT EXISTS mfr_190_5_0_test_method         VARCHAR(100),
        ADD COLUMN IF NOT EXISTS hlmi_190_21_6                   DECIMAL(8,3),
        ADD COLUMN IF NOT EXISTS hlmi_190_21_6_test_method       VARCHAR(100),
        ADD COLUMN IF NOT EXISTS mfr_230_2_16_pp                 DECIMAL(8,3),
        ADD COLUMN IF NOT EXISTS mfr_230_2_16_pp_test_method     VARCHAR(100),

        ADD COLUMN IF NOT EXISTS crystalline_melting_point       DECIMAL(6,1),
        ADD COLUMN IF NOT EXISTS crystalline_melting_point_test_method VARCHAR(100),
        ADD COLUMN IF NOT EXISTS vicat_softening_point           DECIMAL(6,1),
        ADD COLUMN IF NOT EXISTS vicat_softening_point_test_method VARCHAR(100),
        ADD COLUMN IF NOT EXISTS heat_deflection_temp            DECIMAL(6,1),
        ADD COLUMN IF NOT EXISTS heat_deflection_temp_test_method VARCHAR(100),

        ADD COLUMN IF NOT EXISTS tensile_strength_break          DECIMAL(8,2),
        ADD COLUMN IF NOT EXISTS tensile_strength_break_test_method VARCHAR(100),
        ADD COLUMN IF NOT EXISTS elongation_break                DECIMAL(8,2),
        ADD COLUMN IF NOT EXISTS elongation_break_test_method    VARCHAR(100),

        ADD COLUMN IF NOT EXISTS brittleness_temp                DECIMAL(6,1),
        ADD COLUMN IF NOT EXISTS brittleness_temp_test_method    VARCHAR(100),
        ADD COLUMN IF NOT EXISTS bulk_density                    DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS bulk_density_test_method        VARCHAR(100),
        ADD COLUMN IF NOT EXISTS flexural_modulus                DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS flexural_modulus_test_method    VARCHAR(100)
    `);
    console.log('  Added strict resin columns');

    await client.query(`
      UPDATE mes_material_tds
      SET
        mfr_190_2_16 = COALESCE(mfr_190_2_16, mfi),
        mfr_190_2_16_test_method = COALESCE(mfr_190_2_16_test_method, mfi_test_method),
        hlmi_190_21_6 = COALESCE(hlmi_190_21_6, hlmi),
        crystalline_melting_point = COALESCE(crystalline_melting_point, melting_point),
        vicat_softening_point = COALESCE(vicat_softening_point, vicat_softening),
        tensile_strength_break = COALESCE(tensile_strength_break, tensile_break_md, tensile_break_td),
        elongation_break = COALESCE(elongation_break, elongation_md, elongation_td),
        flexural_modulus = COALESCE(flexural_modulus, secant_modulus),
        melt_flow_ratio = COALESCE(
          melt_flow_ratio,
          CASE
            WHEN COALESCE(mfr_190_2_16, mfi) > 0
             AND COALESCE(hlmi_190_21_6, hlmi) IS NOT NULL
            THEN ROUND((COALESCE(hlmi_190_21_6, hlmi) / COALESCE(mfr_190_2_16, mfi))::numeric, 2)
            ELSE melt_flow_ratio
          END
        ),
        updated_at = NOW()
      WHERE
        mfr_190_2_16 IS NULL
        OR hlmi_190_21_6 IS NULL
        OR crystalline_melting_point IS NULL
        OR vicat_softening_point IS NULL
        OR tensile_strength_break IS NULL
        OR elongation_break IS NULL
        OR flexural_modulus IS NULL
    `);
    console.log('  Backfilled strict resin fields from legacy columns');

    await client.query('COMMIT');
    console.log('Migration #020 complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #020 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
