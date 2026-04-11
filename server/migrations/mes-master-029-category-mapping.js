/**
 * Migration mes-master-029 — Category Mapping Table
 *
 * Creates mes_category_mapping: links Oracle category values to internal
 * material_class keys. Replaces the hardcoded CASE/LIKE SQL in tds.js.
 *
 * Run: node server/migrations/mes-master-029-category-mapping.js
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

// Seed data: exact Oracle category values → internal material_class
// has_parameters: false = inventory-only (Trading, Consumables, etc.)
const CATEGORY_SEEDS = [
  // Resins
  { oracle_category: 'POLYETHYLENE',    material_class: 'resins',           display_label: 'Resins',           has_parameters: true,  sort_order: 1 },
  { oracle_category: 'POLYPROPYLENE',   material_class: 'resins',           display_label: 'Resins',           has_parameters: true,  sort_order: 1 },
  // Films / Substrates
  { oracle_category: 'FILMS',           material_class: 'films',            display_label: 'Films',            has_parameters: true,  sort_order: 2 },
  // Adhesives
  { oracle_category: 'ADHESIVES',       material_class: 'adhesives',        display_label: 'Adhesives',        has_parameters: true,  sort_order: 3 },
  // Chemicals
  { oracle_category: 'CHEMICALS',       material_class: 'chemicals',        display_label: 'Chemicals',        has_parameters: true,  sort_order: 4 },
  // Additives
  { oracle_category: 'ADDITIVES',       material_class: 'additives',        display_label: 'Additives',        has_parameters: true,  sort_order: 5 },
  // Coating
  { oracle_category: 'COATING',         material_class: 'coating',          display_label: 'Coating',          has_parameters: true,  sort_order: 6 },
  // Packing Materials
  { oracle_category: 'PACKING MATERIALS', material_class: 'packing_materials', display_label: 'Packing Materials', has_parameters: true, sort_order: 7 },
  // Mounting Tapes
  { oracle_category: 'MOUNTING TAPES',  material_class: 'mounting_tapes',   display_label: 'Mounting Tapes',   has_parameters: true,  sort_order: 8 },
  { oracle_category: 'TAPES',           material_class: 'mounting_tapes',   display_label: 'Mounting Tapes',   has_parameters: true,  sort_order: 8 },
  // Inventory-only (no parameter tables)
  { oracle_category: 'TRADING',         material_class: 'trading',          display_label: 'Trading',          has_parameters: false, sort_order: 9 },
  { oracle_category: 'CONSUMABLES',     material_class: 'consumables',      display_label: 'Consumables',      has_parameters: false, sort_order: 10 },
];

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting MES migration #029 — Category Mapping Table...');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_category_mapping (
        id              SERIAL PRIMARY KEY,
        oracle_category VARCHAR(100) NOT NULL UNIQUE,
        material_class  VARCHAR(40)  NOT NULL,
        display_label   VARCHAR(100) NOT NULL,
        has_parameters  BOOLEAN      NOT NULL DEFAULT true,
        is_active       BOOLEAN      NOT NULL DEFAULT true,
        sort_order      INT          NOT NULL DEFAULT 99,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  + mes_category_mapping table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cat_mapping_class
      ON mes_category_mapping(material_class)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cat_mapping_active
      ON mes_category_mapping(is_active)
    `);
    console.log('  + indexes created');

    // Seed known Oracle categories
    for (const row of CATEGORY_SEEDS) {
      await client.query(`
        INSERT INTO mes_category_mapping
          (oracle_category, material_class, display_label, has_parameters, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (oracle_category) DO UPDATE SET
          material_class = EXCLUDED.material_class,
          display_label  = EXCLUDED.display_label,
          has_parameters = EXCLUDED.has_parameters,
          sort_order     = EXCLUDED.sort_order,
          updated_at     = NOW()
      `, [row.oracle_category, row.material_class, row.display_label, row.has_parameters, row.sort_order]);
    }
    console.log(`  + ${CATEGORY_SEEDS.length} category mappings seeded`);

    await client.query('COMMIT');
    console.log('Migration #029 completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #029 failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
