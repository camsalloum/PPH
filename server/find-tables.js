const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function findTables() {
  const result = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND (table_name LIKE '%rep%' OR table_name LIKE '%config%' OR table_name LIKE '%sales%')
    ORDER BY table_name
  `);
  console.log('Related tables:');
  result.rows.forEach(row => console.log('  -', row.table_name));
  process.exit(0);
}

findTables().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
