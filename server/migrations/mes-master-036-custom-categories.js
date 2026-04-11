/**
 * Migration mes-master-036 — Custom Item Categories
 * Creates mes_item_categories + mes_item_category_groups tables.
 * Seeds "Resins" category with all current resin Item Groups at 100%.
 * Run: node server/migrations/mes-master-036-custom-categories.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting migration #036 — Custom Item Categories...');
    await client.query('BEGIN');

    // 1. Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_item_categories (
        id              SERIAL PRIMARY KEY,
        name            VARCHAR(100) NOT NULL,
        description     TEXT,
        material_class  VARCHAR(40),
        is_active       BOOLEAN NOT NULL DEFAULT true,
        sort_order      INT NOT NULL DEFAULT 99,
        created_by      INTEGER,
        updated_by      INTEGER,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  + mes_item_categories created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_item_category_groups (
        id              SERIAL PRIMARY KEY,
        category_id     INTEGER NOT NULL REFERENCES mes_item_categories(id) ON DELETE CASCADE,
        catlinedesc     TEXT NOT NULL,
        allocation_pct  DECIMAL(5,2) NOT NULL DEFAULT 100.00,
        is_active       BOOLEAN NOT NULL DEFAULT true,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_allocation_pct CHECK (allocation_pct > 0 AND allocation_pct <= 100),
        CONSTRAINT uq_category_group UNIQUE (category_id, catlinedesc)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_cat_groups_category ON mes_item_category_groups(category_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_cat_groups_catline ON mes_item_category_groups(catlinedesc)');
    console.log('  + mes_item_category_groups created');

    // 2. Seed "Resins" category
    const { rows: catRows } = await client.query(`
      INSERT INTO mes_item_categories (name, material_class, sort_order, description)
      VALUES ('Resins', 'resins', 1, 'All polyethylene and polypropylene resin grades')
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const resinCatId = catRows[0]?.id;

    if (resinCatId) {
      // Get all unique resin catlinedesc values from fp_actualrmdata
      const { rows: groups } = await client.query(`
        SELECT DISTINCT TRIM(catlinedesc) AS catlinedesc
        FROM fp_actualrmdata
        WHERE UPPER(TRIM(category)) IN ('POLYETHYLENE', 'POLYPROPYLENE', 'RESINS')
          AND COALESCE(TRIM(catlinedesc), '') <> ''
        ORDER BY catlinedesc
      `);

      for (const g of groups) {
        await client.query(`
          INSERT INTO mes_item_category_groups (category_id, catlinedesc, allocation_pct)
          VALUES ($1, $2, 100.00)
          ON CONFLICT (category_id, catlinedesc) DO NOTHING
        `, [resinCatId, g.catlinedesc]);
      }
      console.log(`  + Seeded "Resins" category with ${groups.length} Item Groups at 100%`);
    }

    await client.query('COMMIT');
    console.log('Migration #036 completed.');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Migration #036 failed:', e.message);
    process.exit(1);
  } finally { client.release(); await pool.end(); }
}
run();
