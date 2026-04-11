require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
(async () => {
  const s = await pool.query('SELECT id, name FROM mes_suppliers ORDER BY id');
  console.log('SUPPLIERS:', JSON.stringify(s.rows));
  const c = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='mes_material_tds' ORDER BY ordinal_position`);
  console.log('COLUMNS:', c.rows.map(r => r.column_name).join(', '));
  await pool.end();
})();
