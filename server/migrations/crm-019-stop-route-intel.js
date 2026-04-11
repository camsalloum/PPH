/**
 * crm-019-stop-route-intel.js
 * Adds route intelligence + transport columns to crm_field_trip_stops:
 *   stop_country, planned_eta, est_drive_km, est_drive_sec, transport_to_next
 */
module.exports = {
  name: 'crm-019-stop-route-intel',
  async up(pool) {
    const client = await pool.connect();
    try {
      // Ensure table exists first
      const tableCheck = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_field_trip_stops' LIMIT 1`
      );
      if (tableCheck.rows.length === 0) {
        console.log('[crm-019] crm_field_trip_stops table does not exist yet — skipping');
        return;
      }

      const cols = {
        stop_country:      'VARCHAR(120)',
        planned_eta:       'VARCHAR(10)',
        est_drive_km:      'NUMERIC(8,1)',
        est_drive_sec:     'INTEGER',
        transport_to_next: 'VARCHAR(20)',
      };

      const existing = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'crm_field_trip_stops'`
      );
      const existingCols = new Set(existing.rows.map(r => r.column_name));

      for (const [col, def] of Object.entries(cols)) {
        if (!existingCols.has(col)) {
          await client.query(`ALTER TABLE crm_field_trip_stops ADD COLUMN ${col} ${def}`);
          console.log(`[crm-019] Added column ${col} to crm_field_trip_stops`);
        }
      }
    } finally {
      client.release();
    }
  },
};
