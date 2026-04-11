const {pool} = require('../server/database/config');
(async () => {
  const cols = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='mes_non_resin_material_specs' ORDER BY ordinal_position"
  );
  console.table(cols.rows);
  
  const rows = await pool.query('SELECT * FROM mes_non_resin_material_specs LIMIT 3');
  console.log(JSON.stringify(rows.rows, null, 2));
  
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
