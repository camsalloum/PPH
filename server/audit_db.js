const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres', host: 'localhost', database: 'fp_database', password: 'Pph654883!', port: 5432,
});
async function run() {
  try {
    const tables = ['mes_non_resin_material_specs','mes_spec_substrates','mes_spec_adhesives','mes_spec_chemicals','mes_spec_additives','mes_spec_coating','mes_spec_packing_materials','mes_spec_mounting_tapes'];
    const sqlTriggers = `SELECT c.relname AS table_name, t.tgname AS trigger_name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ANY($1) ORDER BY c.relname, t.tgname;`;
    const resT = await pool.query(sqlTriggers, [tables]);
    console.log('--- All Triggers ---');
    console.log(JSON.stringify(resT.rows, null, 2));

    const sqlRules = `SELECT tablename, rulename FROM pg_rules WHERE schemaname='public' AND tablename = ANY($1);`;
    const resR = await pool.query(sqlRules, [tables]);
    console.log('--- All Rules ---');
    console.log(JSON.stringify(resR.rows, null, 2));
  } catch (err) { console.error(err); } finally { await pool.end(); }
}
run();
