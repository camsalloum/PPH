/**
 * Migration mes-master-052 - Adhesives TDS Field Coverage
 * Adds common adhesive TDS text fields so solvent-based and solvent-less
 * documents can be captured consistently.
 *
 * Run: node server/migrations/mes-master-052-adhesives-tds-fields.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const EXTRA_FIELDS = [
  {
    field_key: 'appearance',
    label: 'Appearance',
    unit: '-',
    field_type: 'text',
    max_length: 120,
    is_required: false,
    sort_order: 1,
  },
  {
    field_key: 'carrying_solvent',
    label: 'Carrying Solvent',
    unit: '-',
    field_type: 'text',
    max_length: 120,
    is_required: false,
    sort_order: 2,
  },
  {
    field_key: 'functionality',
    label: 'Functionality',
    unit: '-',
    field_type: 'text',
    max_length: 40,
    is_required: false,
    sort_order: 3,
  },
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const f of EXTRA_FIELDS) {
      await client.query(
        `INSERT INTO mes_parameter_definitions
          (material_class, profile, field_key, label, unit, field_type, max_length, is_required, sort_order)
         VALUES
          ('adhesives', NULL, $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (material_class, field_key, profile)
         DO UPDATE SET
           label = EXCLUDED.label,
           unit = EXCLUDED.unit,
           field_type = EXCLUDED.field_type,
           max_length = EXCLUDED.max_length,
           is_required = EXCLUDED.is_required,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`,
        [
          f.field_key,
          f.label,
          f.unit,
          f.field_type,
          f.max_length,
          f.is_required,
          f.sort_order,
        ]
      );
    }

    await client.query('COMMIT');
    console.log('Migration 052 complete - adhesives TDS fields upserted.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration 052 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(() => process.exit(1));
