const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.AUTH_DB_NAME || 'ip_auth_database'
});

pool.query("SELECT setting_value FROM company_settings WHERE setting_key = 'divisions'")
  .then(r => {
    console.log('Your divisions:');
    console.log(JSON.stringify(r.rows[0]?.setting_value, null, 2));
  })
  .catch(e => console.error(e.message))
  .finally(() => pool.end());
