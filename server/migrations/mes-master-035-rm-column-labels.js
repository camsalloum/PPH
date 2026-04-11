/**
 * Migration mes-master-035 — RM Dashboard Column Labels
 * Adds column_labels JSONB to mes_category_mapping so the RM Dashboard
 * can fetch category-specific column headers from DB instead of hardcoding.
 * Run: node server/migrations/mes-master-035-rm-column-labels.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Column labels per material_class
// Maps fp_actualrmdata columns (sizes, standards, weights) to display labels
// null = hide that column for this category
const LABELS = {
  resins:           { standards: 'Name',          sizes: 'MFI (g/10min)', weights: 'Density (g/cm³)', is_aggregated: true },
  films:            { standards: 'Thickness (µm)', sizes: 'Width (mm)',   weights: 'Density (g/cm³)', is_aggregated: false },
  adhesives:        { standards: 'Matter',         sizes: 'Type',         weights: 'Density (g/cm³)', is_aggregated: false },
  chemicals:        { standards: 'Matter',         sizes: 'Type',         weights: 'Density (g/cm³)', is_aggregated: false },
  additives:        { standards: 'Matter',         sizes: 'Type',         weights: 'Density (g/cm³)', is_aggregated: false },
  coating:          { standards: 'Matter',         sizes: 'Type',         weights: 'Density (g/cm³)', is_aggregated: false },
  packing_materials:{ standards: 'Matter',         sizes: 'Dimension',    weights: null,               is_aggregated: false },
  mounting_tapes:   { standards: 'Name',           sizes: 'Type',         weights: null,               is_aggregated: false },
  trading:          { standards: 'Description',    sizes: 'Type',         weights: null,               is_aggregated: false },
  consumables:      { standards: 'Description',    sizes: 'Type',         weights: null,               is_aggregated: false },
};

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting migration #035 — RM Column Labels...');
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE mes_category_mapping
        ADD COLUMN IF NOT EXISTS column_labels JSONB NOT NULL DEFAULT '{}'::JSONB,
        ADD COLUMN IF NOT EXISTS is_aggregated BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('  + columns added');

    for (const [matClass, labels] of Object.entries(LABELS)) {
      const { is_aggregated, ...colLabels } = labels;
      await client.query(
        `UPDATE mes_category_mapping SET column_labels = $1, is_aggregated = $2 WHERE material_class = $3`,
        [JSON.stringify(colLabels), !!is_aggregated, matClass]
      );
    }
    console.log('  + column labels seeded for ' + Object.keys(LABELS).length + ' classes');

    await client.query('COMMIT');
    console.log('Migration #035 completed.');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Migration #035 failed:', e.message);
    process.exit(1);
  } finally { client.release(); await pool.end(); }
}
run();
