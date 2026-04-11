// Temp schema check script
const { pool } = require('../database/config');

(async () => {
  try {
    const r1 = await pool.query(
      "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='crm_field_trips'::regclass AND contype='c' ORDER BY conname"
    );
    console.log('=== crm_field_trips CHECK constraints ===');
    r1.rows.forEach(r => console.log(r.conname, ':', r.def));

    const r2 = await pool.query(
      "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='crm_field_trip_stops'::regclass AND contype='c' ORDER BY conname"
    );
    console.log('\n=== crm_field_trip_stops CHECK constraints ===');
    r2.rows.forEach(r => console.log(r.conname, ':', r.def));

    // Check if 'draft' is in the status constraint
    const statusConstraint = r1.rows.find(r => r.conname.includes('status') && !r.conname.includes('advance'));
    if (statusConstraint && !statusConstraint.def.includes("'draft'")) {
      console.log('\n⚠️  WARNING: draft status NOT in CHECK constraint!');
    } else {
      console.log('\n✅ draft status IS in CHECK constraint');
    }

    // Check stop_type constraint vs code
    const stopTypeConstraint = r2.rows.find(r => r.conname.includes('stop_type'));
    if (stopTypeConstraint) {
      const hasLocation = stopTypeConstraint.def.includes("'location'");
      const hasCustom = stopTypeConstraint.def.includes("'custom'");
      console.log(`stop_type constraint includes 'location': ${hasLocation}`);
      console.log(`stop_type constraint includes 'custom': ${hasCustom}`);
      if (!hasLocation || !hasCustom) {
        console.log("⚠️  WARNING: Code uses 'location' and 'custom' stop types but constraint may not allow them!");
      }
    }

    // Check designation_level column
    const dLevel = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='designation_level'"
    );
    console.log(`\ndesignation_level on users table: ${dLevel.rows.length > 0 ? 'EXISTS' : 'MISSING'}`);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    process.exit(0);
  }
})();
