require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../database/config');

async function check() {
  const r = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'crm_activities'
    ORDER BY ordinal_position
  `);
  console.log('crm_activities columns:');
  r.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} nullable=${c.is_nullable} default=${c.column_default}`));
  await pool.end();
  process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });
