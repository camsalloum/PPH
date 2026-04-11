// Migration: add stop_city column to crm_field_trip_stops
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: 'Pph654883!',
});

async function run() {
  try {
    await pool.query(`
      ALTER TABLE crm_field_trip_stops
      ADD COLUMN IF NOT EXISTS stop_city VARCHAR(120) DEFAULT NULL;
    `);
    console.log('✅ stop_city column added to crm_field_trip_stops');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_crm_field_trip_stops_stop_city
      ON crm_field_trip_stops (LOWER(stop_city));
    `);
    console.log('✅ index created for stop_city');

    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
