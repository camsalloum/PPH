const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'fp_database',
  password: 'Pph654883!',
  port: 5432,
});

const queries = [
  {
    name: 'Triggers/Functions',
    sql: 'SELECT c.relname AS table_name, t.tgname AS trigger_name, pg_get_triggerdef(t.oid) AS trigger_def FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal AND n.nspname = \'public\' AND c.relname IN (\'mes_non_resin_material_specs\',\'mes_spec_substrates\',\'mes_spec_adhesives\',\'mes_spec_chemicals\',\'mes_spec_additives\',\'mes_spec_coating\',\'mes_spec_packing_materials\',\'mes_spec_mounting_tapes\') ORDER BY c.relname, t.tgname;'
  },
  {
    name: 'Rules',
    sql: 'SELECT tablename, rulename, definition FROM pg_rules WHERE schemaname=\'public\' AND tablename IN (\'mes_non_resin_material_specs\',\'mes_spec_substrates\');'
  }
];

async function run() {
  try {
    for (const q of queries) {
      console.log('--- Result for ' + q.name + ' ---');
      const res = await pool.query(q.sql);
      console.log(JSON.stringify(res.rows, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
