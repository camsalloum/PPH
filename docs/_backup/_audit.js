const { Pool } = require('pg');
const p = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: 'Pph654883!', database: 'fp_database' });

async function run() {
  const r1 = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='crm_field_trips' ORDER BY ordinal_position");
  console.log('=== crm_field_trips columns ===');
  r1.rows.forEach(x => console.log(x.column_name + ' | ' + x.data_type));

  const r2 = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='crm_field_trip_stops' ORDER BY ordinal_position");
  console.log('\n=== crm_field_trip_stops columns ===');
  r2.rows.forEach(x => console.log(x.column_name + ' | ' + x.data_type));

  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
