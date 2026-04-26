const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres', host: 'localhost', database: 'fp_database', password: 'Pph654883!', port: 5432,
});
async function run() {
  try {
    const res = await pool.query(`
      SELECT c.relname AS table_name, t.tgname AS trigger_name, pg_get_triggerdef(t.oid) AS trigger_def
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'mes_non_resin_material_specs'
    `);
    console.log('--- Trigger Definitions ---');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) { console.error(err); } finally { await pool.end(); }
}
run();
