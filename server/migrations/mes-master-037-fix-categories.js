/**
 * Migration mes-master-037 — Fix Custom Categories
 * Removes allocation_pct (wrong concept), re-seeds Resins with correct catlinedesc values.
 * Run: node server/migrations/mes-master-037-fix-categories.js
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
    console.log('Starting migration #037 — Fix Custom Categories...');
    await client.query('BEGIN');

    // Remove allocation_pct — not needed, just selection
    await client.query('ALTER TABLE mes_item_category_groups DROP COLUMN IF EXISTS allocation_pct');
    console.log('  + allocation_pct removed');

    // Clear and re-seed Resins with correct catlinedesc values from fp_actualrmdata
    const { rows: cat } = await client.query("SELECT id FROM mes_item_categories WHERE name = 'Resins' LIMIT 1");
    if (cat.length) {
      const catId = cat[0].id;
      await client.query('DELETE FROM mes_item_category_groups WHERE category_id = $1', [catId]);

      // Get all unique catlinedesc values for Resins from Oracle data
      const { rows: groups } = await client.query(`
        SELECT DISTINCT TRIM(catlinedesc) AS catlinedesc
        FROM fp_actualrmdata
        WHERE UPPER(TRIM(category)) = 'RESINS'
          AND COALESCE(TRIM(catlinedesc), '') <> ''
        ORDER BY catlinedesc
      `);

      for (const g of groups) {
        await client.query(
          'INSERT INTO mes_item_category_groups (category_id, catlinedesc) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [catId, g.catlinedesc]
        );
      }
      console.log(`  + Resins re-seeded with ${groups.length} catlinedesc groups: ${groups.map(g => g.catlinedesc).join(', ')}`);
    }

    await client.query('COMMIT');
    console.log('Migration #037 completed.');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Migration #037 failed:', e.message);
    process.exit(1);
  } finally { client.release(); await pool.end(); }
}
run();
