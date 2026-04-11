const { Pool } = require('pg');
const pool = new Pool({ 
  user: 'postgres', 
  host: 'localhost', 
  database: 'ip_auth_database', 
  password: process.env.DB_PASSWORD || '', 
  port: 5432 
});

async function run() {
  const result = await pool.query("SELECT setting_key, setting_value FROM company_settings WHERE setting_key IN ('company_name', 'divisions')");
  result.rows.forEach(row => {
    console.log(`\n${row.setting_key}:`);
    console.log(JSON.stringify(row.setting_value, null, 2));
  });
  await pool.end();
}

run();
