// Migration: add custom_label column to crm_field_trip_stops
// Also adds stop_type 'custom' support by ensuring the column has no CHECK constraint blocker.
const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, database: 'fp_database', user: 'postgres', password: 'Pph654883!' });

async function run() {
  try {
    await pool.query(`
      ALTER TABLE crm_field_trip_stops
        ADD COLUMN IF NOT EXISTS custom_label VARCHAR(50) DEFAULT NULL;
    `);
    console.log('✅  custom_label column added to crm_field_trip_stops');

    // Also ensure stop_type accepts 'custom' if there is a CHECK constraint
    // (safe no-op if no constraint exists)
    const checkResult = await pool.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'crm_field_trip_stops'::regclass
        AND contype = 'c'
        AND conname ILIKE '%stop_type%'
    `);
    if (checkResult.rows.length > 0) {
      for (const row of checkResult.rows) {
        await pool.query(`ALTER TABLE crm_field_trip_stops DROP CONSTRAINT IF EXISTS "${row.conname}"`);
        console.log(`✅  Dropped CHECK constraint: ${row.conname}`);
      }
      await pool.query(`
        ALTER TABLE crm_field_trip_stops
          ADD CONSTRAINT crm_fts_stop_type_check
          CHECK (stop_type IN ('customer','prospect','location','custom'))
      `);
      console.log('✅  Replaced stop_type CHECK constraint (now includes custom)');
    }

    console.log('Migration complete.');
  } catch (e) {
    console.error('Migration error:', e.message);
  } finally {
    await pool.end();
  }
}
run();
