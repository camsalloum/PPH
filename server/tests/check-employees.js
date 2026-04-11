require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { authPool } = require('../database/config');

async function check() {
  const colRes = await authPool.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name='employees' ORDER BY ordinal_position
  `);
  console.log('employees columns:', colRes.rows.map(r => r.column_name));
  await authPool.end();
  process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });
