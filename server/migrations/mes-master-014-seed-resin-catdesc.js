/**
 * Migration mes-master-014 — Seed oracle_cat_desc for Resins items
 *
 * Maps each resin item_code to its corresponding fp_actualrmdata catlinedesc value.
 * Items that don't have a matching catlinedesc are left as NULL.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const CATDESC_MAP = [
  { code: 'HDPE-20',   oracle_cat_desc: 'HDPE' },
  { code: 'LDPE-25',   oracle_cat_desc: 'LDPE' },
  { code: 'LLDPE-50',  oracle_cat_desc: 'LLDPE' },
  { code: 'mLLDPE-30', oracle_cat_desc: 'mLLDPE' },
  { code: 'CPP-25',    oracle_cat_desc: 'Random PP' },
  // PET-12, BOPP-20, NY-15 — no matching catlinedesc in fp_actualrmdata Resins yet
];

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES migration #014 — Seed oracle_cat_desc for Resins...\n');

    let updated = 0;
    for (const { code, oracle_cat_desc } of CATDESC_MAP) {
      const res = await client.query(
        `UPDATE mes_item_master SET oracle_cat_desc = $1 WHERE item_code = $2`,
        [oracle_cat_desc, code]
      );
      if (res.rowCount > 0) {
        console.log(`  ✅ ${code.padEnd(12)} → ${oracle_cat_desc}`);
        updated++;
      } else {
        console.log(`  ⚠️  ${code.padEnd(12)} — not found`);
      }
    }

    await client.query('COMMIT');
    console.log(`\n✅ Migration mes-master-014 complete. ${updated} items updated.\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-014 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
