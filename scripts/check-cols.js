const {pool} = require('../server/database/config');
(async () => {
  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='fp_actualrmdata' ORDER BY ordinal_position"
  );
  console.log('fp_actualrmdata columns:', cols.rows.map(x => x.column_name).join(', '));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
