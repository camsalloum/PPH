const { pool } = require('../database/config');

async function main() {
  try {
    const r = await pool.query(
      "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='crm_trip_adjustments_adjustment_type_check'"
    );
    console.log('Constraint:', JSON.stringify(r.rows, null, 2));
    
    // Also check review-stop error - check if crm_travel_reports has all required columns
    const cols = await pool.query(
      "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='crm_travel_reports' ORDER BY ordinal_position"
    );
    console.log('\ncrm_travel_reports columns:', JSON.stringify(cols.rows, null, 2));
    
    // Check visit_date type
    const vd = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='crm_field_trip_stops' AND column_name IN ('visit_date','visit_time')"
    );
    console.log('\nvisit_date/time types:', JSON.stringify(vd.rows, null, 2));
  } catch (e) {
    console.error(e.message);
  } finally {
    pool.end();
  }
}
main();
