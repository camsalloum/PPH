const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres', host: 'localhost', database: 'fp_database', password: 'Pph654883!', port: 5432,
});
async function run() {
  try {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LIMIT 20;");
    console.log('Tables in public schema:');
    console.log(res.rows.map(r => r.table_name).join(', '));
    
    const res2 = await pool.query("SELECT datname FROM pg_database WHERE datistemplate = false;");
    console.log('Databases available:');
    console.log(res2.rows.map(r => r.datname).join(', '));
  } catch (err) { console.error(err); } finally { await pool.end(); }
}
run();
