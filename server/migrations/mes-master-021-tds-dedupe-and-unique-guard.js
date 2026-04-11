/**
 * Migration mes-master-021 — TDS dedupe + uniqueness guard
 *
 * Purpose:
 * 1) Remove duplicate seeded TDS rows (same supplier_id + oracle_item_code)
 * 2) Preserve linked data where needed
 * 3) Add DB-level unique guard to prevent recurrence
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
    await client.query('BEGIN');
    console.log('Starting MES migration #021 — TDS dedupe + uniqueness guard...');

    await client.query(`
      CREATE TEMP TABLE tmp_tds_dup_map AS
      WITH ranked AS (
        SELECT
          id,
          supplier_id,
          oracle_item_code,
          MIN(id) OVER (PARTITION BY supplier_id, oracle_item_code) AS keep_id,
          ROW_NUMBER() OVER (PARTITION BY supplier_id, oracle_item_code ORDER BY id) AS rn
        FROM mes_material_tds
        WHERE COALESCE(TRIM(oracle_item_code), '') <> ''
      )
      SELECT id AS dup_id, keep_id
      FROM ranked
      WHERE rn > 1
    `);

    const dupCountRes = await client.query('SELECT COUNT(*)::INT AS c FROM tmp_tds_dup_map');
    const dupCount = dupCountRes.rows[0].c;
    console.log(`  Found ${dupCount} duplicate rows`);

    if (dupCount > 0) {
      // If keep row has no film params but one of its duplicates has, move one row to keep.
      await client.query(`
        WITH one_film_per_keep AS (
          SELECT DISTINCT ON (m.keep_id)
            f.id AS film_id,
            m.keep_id
          FROM tmp_tds_dup_map m
          JOIN mes_tds_film_parameters f ON f.tds_id = m.dup_id
          LEFT JOIN mes_tds_film_parameters k ON k.tds_id = m.keep_id
          WHERE k.id IS NULL
          ORDER BY m.keep_id, f.id
        )
        UPDATE mes_tds_film_parameters fp
        SET tds_id = o.keep_id,
            updated_at = NOW()
        FROM one_film_per_keep o
        WHERE fp.id = o.film_id
      `);

      // Re-point attachments to keep rows before deleting duplicates.
      const attMove = await client.query(`
        UPDATE mes_tds_attachments a
        SET tds_id = m.keep_id
        FROM tmp_tds_dup_map m
        WHERE a.tds_id = m.dup_id
      `);
      console.log(`  Repointed ${attMove.rowCount} attachment rows`);

      // Remove remaining film param rows attached to duplicate IDs.
      const filmDel = await client.query(`
        DELETE FROM mes_tds_film_parameters fp
        USING tmp_tds_dup_map m
        WHERE fp.tds_id = m.dup_id
      `);
      console.log(`  Removed ${filmDel.rowCount} duplicate film parameter rows`);

      // Delete duplicate TDS rows.
      const tdsDel = await client.query(`
        DELETE FROM mes_material_tds t
        USING tmp_tds_dup_map m
        WHERE t.id = m.dup_id
      `);
      console.log(`  Removed ${tdsDel.rowCount} duplicate TDS rows`);
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_mes_material_tds_supplier_oracle_code
      ON mes_material_tds (supplier_id, oracle_item_code)
      WHERE COALESCE(TRIM(oracle_item_code), '') <> ''
    `);
    console.log('  Added unique guard index on (supplier_id, oracle_item_code)');

    await client.query('COMMIT');
    console.log('Migration #021 complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #021 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(() => process.exit(1));
