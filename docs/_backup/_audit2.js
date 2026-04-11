const { Pool } = require('pg');
const p = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: 'Pph654883!', database: 'fp_database' });

async function run() {
  const r = await p.query("SELECT country_code_2, country_name FROM master_countries WHERE is_active = true ORDER BY country_name");
  console.log('=== Countries in DB ===');
  r.rows.forEach(x => console.log(x.country_code_2 + ' → ' + x.country_name));
  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
