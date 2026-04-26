const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres', host: 'localhost', database: 'fp_database', password: 'Pph654883!', port: 5432,
});
async function run() {
  try {
    const res = await pool.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE 'mes_spec%' OR table_name LIKE 'mes_non_resin%';");
    console.log('Search results:');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) { console.error(err); } finally { await pool.end(); }
}
run();
