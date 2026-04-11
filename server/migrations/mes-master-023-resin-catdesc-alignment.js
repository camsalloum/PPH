/**
 * Migration mes-master-023 — Resin category alignment
 *
 * Fixes seed/category drift by:
 * 1) Reclassifying film grades that were incorrectly tagged as Resins.
 * 2) Ensuring Resin master has rows for Film Scrap/Regrind cat descriptions
 *    present in Oracle RM data.
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

const FILM_RECLASSIFY_CODES = ['BOPP-20', 'NY-15', 'PET-12'];

const REQUIRED_RESIN_ROWS = [
  {
    item_code: 'RS-SCRAP-CLR',
    item_name: 'Film Scrap / Regrind Clear',
    item_type: 'raw_resin',
    subcategory: 'Regrind',
    category: 'Resins',
    oracle_cat_desc: 'Film Scrap / Regrind Clear',
    base_uom: 'KG',
  },
  {
    item_code: 'RS-SCRAP-PRN',
    item_name: 'Film Scrap / Regrind Printed',
    item_type: 'raw_resin',
    subcategory: 'Regrind',
    category: 'Resins',
    oracle_cat_desc: 'Film Scrap / Regrind Printed',
    base_uom: 'KG',
  },
];

async function upsertRequiredResinRows(client) {
  let inserted = 0;
  let reactivated = 0;

  for (const row of REQUIRED_RESIN_ROWS) {
    const existing = await client.query(
      `SELECT id, item_code, is_active
       FROM mes_item_master
       WHERE category = 'Resins' AND oracle_cat_desc = $1
       ORDER BY is_active DESC, id ASC
       LIMIT 1`,
      [row.oracle_cat_desc]
    );

    if (existing.rows.length > 0) {
      const current = existing.rows[0];
      if (!current.is_active) {
        await client.query(
          `UPDATE mes_item_master
           SET is_active = true, updated_at = NOW()
           WHERE id = $1`,
          [current.id]
        );
        reactivated += 1;
        console.log(`  ✅ Reactivated ${row.oracle_cat_desc} (item_code=${current.item_code})`);
      } else {
        console.log(`  ✅ Exists ${row.oracle_cat_desc} (item_code=${current.item_code})`);
      }
      continue;
    }

    await client.query(
      `INSERT INTO mes_item_master (
         item_code, item_name, item_type, subcategory,
         category, oracle_cat_desc, base_uom,
         price_control, waste_pct, is_active
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7,
         'MAP', 3.0, true
       )
       ON CONFLICT (item_code) DO UPDATE SET
         item_name = EXCLUDED.item_name,
         item_type = EXCLUDED.item_type,
         subcategory = EXCLUDED.subcategory,
         category = EXCLUDED.category,
         oracle_cat_desc = EXCLUDED.oracle_cat_desc,
         base_uom = EXCLUDED.base_uom,
         is_active = true,
         updated_at = NOW()`,
      [
        row.item_code,
        row.item_name,
        row.item_type,
        row.subcategory,
        row.category,
        row.oracle_cat_desc,
        row.base_uom,
      ]
    );

    inserted += 1;
    console.log(`  ✅ Inserted ${row.item_code} -> ${row.oracle_cat_desc}`);
  }

  return { inserted, reactivated };
}

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES migration #023 — Resin category alignment...\n');

    const reclassify = await client.query(
      `UPDATE mes_item_master
       SET category = 'Films', updated_at = NOW()
       WHERE item_code = ANY($1)
         AND COALESCE(category, '') <> 'Films'
       RETURNING item_code`,
      [FILM_RECLASSIFY_CODES]
    );

    console.log(`  ✅ Reclassified to Films: ${reclassify.rowCount}`);
    if (reclassify.rowCount > 0) {
      console.log(`     ${reclassify.rows.map((r) => r.item_code).join(', ')}`);
    }

    const upsertStats = await upsertRequiredResinRows(client);

    const resinSummary = await client.query(
      `SELECT oracle_cat_desc, COUNT(*)::int AS rows_count
       FROM mes_item_master
       WHERE is_active = true AND category = 'Resins'
       GROUP BY oracle_cat_desc
       ORDER BY oracle_cat_desc`
    );

    await client.query('COMMIT');

    console.log('\n✅ Migration mes-master-023 complete.');
    console.log(`   Reclassified: ${reclassify.rowCount}`);
    console.log(`   Inserted required rows: ${upsertStats.inserted}`);
    console.log(`   Reactivated required rows: ${upsertStats.reactivated}`);
    console.log('   Resin cat_desc summary:');
    resinSummary.rows.forEach((r) => {
      console.log(`   - ${r.oracle_cat_desc}: ${r.rows_count}`);
    });
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-023 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
