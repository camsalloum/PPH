require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../database/config');

async function check() {
  const r = await pool.query("SELECT to_regclass('fp_customer_contacts') as t");
  console.log('fp_customer_contacts exists:', r.rows[0].t !== null);
  
  // Also check if there's a contacts table with a different name
  const r2 = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' AND table_name LIKE '%contact%'
  `);
  console.log('Contact-related tables:', r2.rows.map(r => r.table_name));
  
  await pool.end();
  process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });
