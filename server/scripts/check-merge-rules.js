const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  database: 'fp_database',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT
});

pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'fp_division_customer_merge_rules'`)
  .then(r => {
    console.log('Columns:', r.rows.map(x => x.column_name));
    return pool.query('SELECT * FROM fp_division_customer_merge_rules LIMIT 2');
  })
  .then(r => {
    console.log('\nSample data:');
    console.log(JSON.stringify(r.rows, null, 2));
  })
  .catch(e => console.error(e.message))
  .finally(() => pool.end());
