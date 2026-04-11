const { Pool } = require('pg');
const p = new Pool({ host: 'localhost', port: 5432, database: 'fp_database', user: 'postgres', password: 'Pph654883!' });

async function run() {
  try {
    // crm_field_trips columns
    const r1 = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='crm_field_trips' ORDER BY ordinal_position");
    console.log('\n=== crm_field_trips (' + r1.rows.length + ' cols) ===');
    r1.rows.forEach(c => console.log('  ' + c.column_name + ' | ' + c.data_type));

    // crm_field_trip_stops columns
    const r2 = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='crm_field_trip_stops' ORDER BY ordinal_position");
    console.log('\n=== crm_field_trip_stops (' + r2.rows.length + ' cols) ===');
    r2.rows.forEach(c => console.log('  ' + c.column_name + ' | ' + c.data_type));

    // crm_field_trip_legs columns
    const r3 = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='crm_field_trip_legs' ORDER BY ordinal_position");
    console.log('\n=== crm_field_trip_legs (' + r3.rows.length + ' cols) ===');
    r3.rows.forEach(c => console.log('  ' + c.column_name + ' | ' + c.data_type));

    // drafts
    const r4 = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='crm_field_trip_drafts' ORDER BY ordinal_position");
    console.log('\n=== crm_field_trip_drafts (' + r4.rows.length + ' cols) ===');
    r4.rows.forEach(c => console.log('  ' + c.column_name + ' | ' + c.data_type));

    // travel reports
    const r5 = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='crm_travel_reports' ORDER BY ordinal_position");
    console.log('\n=== crm_travel_reports (' + r5.rows.length + ' cols) ===');
    r5.rows.forEach(c => console.log('  ' + c.column_name + ' | ' + c.data_type));

    // row count
    const rc = await p.query("SELECT COUNT(*) FROM crm_field_trips");
    console.log('\n=== Trip row count:', rc.rows[0].count, '===');

  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await p.end();
  }
}
run();
