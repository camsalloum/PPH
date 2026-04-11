/**
 * Migration mes-master-012 — Seed category values on existing mes_item_master rows
 *
 * Assigns fp_actualrmdata-matching category names to the 26 seed items.
 * Categories used:
 *   Resins          — base polymer films (PET, BOPP, PE, PA, PP, ALU)
 *   Adhesives       — PU & water-based adhesives
 *   Chemicals       — inks + solvents
 *   Coating HSL/Wax — varnishes / coatings
 *   Packing Materials — cores, stretch film, zipper tape
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

const CATEGORY_MAP = [
  // Resins — polymer base films
  { code: 'PET-12',    category: 'Resins' },
  { code: 'BOPP-20',   category: 'Resins' },
  { code: 'LLDPE-50',  category: 'Resins' },
  { code: 'LDPE-25',   category: 'Resins' },
  { code: 'NY-15',     category: 'Resins' },
  { code: 'ALU-7',     category: 'Films'  },   // aluminium foil = Films
  { code: 'CPP-25',    category: 'Resins' },
  { code: 'mLLDPE-30', category: 'Resins' },
  { code: 'HDPE-20',   category: 'Resins' },

  // Adhesives
  { code: 'ADH-SF', category: 'Adhesives' },
  { code: 'ADH-SB', category: 'Adhesives' },
  { code: 'ADH-WB', category: 'Adhesives' },

  // Chemicals — inks
  { code: 'INK-PU-W', category: 'Chemicals' },
  { code: 'INK-PU-C', category: 'Chemicals' },
  { code: 'INK-PU-M', category: 'Chemicals' },
  { code: 'INK-PU-Y', category: 'Chemicals' },
  { code: 'INK-PU-K', category: 'Chemicals' },
  { code: 'INK-WB',   category: 'Chemicals' },

  // Chemicals — solvents
  { code: 'SOLV-EA',  category: 'Chemicals' },
  { code: 'SOLV-MEK', category: 'Chemicals' },
  { code: 'SOLV-IPA', category: 'Chemicals' },

  // Packing Materials
  { code: 'PKG-CORE3', category: 'Packing Materials' },
  { code: 'PKG-STRCH', category: 'Packing Materials' },
  { code: 'ZIP-STD',   category: 'Packing Materials' },

  // Coating HSL/Wax — varnishes
  { code: 'VARN-GL', category: 'Coating HSL/Wax' },
  { code: 'VARN-MT', category: 'Coating HSL/Wax' },
];

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES migration #012 — Seed item categories...\n');

    let updated = 0;
    for (const { code, category } of CATEGORY_MAP) {
      const res = await client.query(
        `UPDATE mes_item_master SET category = $1 WHERE item_code = $2`,
        [category, code]
      );
      if (res.rowCount > 0) {
        console.log(`  ✅ ${code.padEnd(12)} → ${category}`);
        updated++;
      } else {
        console.log(`  ⚠️  ${code.padEnd(12)} — not found (skipped)`);
      }
    }

    await client.query('COMMIT');
    console.log(`\n✅ Migration mes-master-012 complete. ${updated} items updated.\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-012 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
