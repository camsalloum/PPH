require('dotenv').config();
const { pool } = require('./database/config');

async function listTables() {
  const result = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema='public' 
    ORDER BY table_name
  `);
  
  console.log('=== ALL TABLES IN DATABASE ===\n');
  result.rows.forEach(r => console.log(r.table_name));
  console.log(`\nTotal: ${result.rows.length} tables`);
  
  process.exit(0);
}
listTables();
