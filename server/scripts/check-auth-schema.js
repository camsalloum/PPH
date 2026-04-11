const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const authPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'ip_auth_database',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432,
});

async function checkSchema() {
  try {
    const tables = await authPool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema='public' ORDER BY table_name
    `);
    
    console.log('Tables in ip_auth_database:');
    for (const table of tables.rows) {
      console.log(`\n${table.table_name}:`);
      const columns = await authPool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name=$1
        ORDER BY ordinal_position
      `, [table.table_name]);
      columns.rows.forEach(c => {
        console.log(`  - ${c.column_name} (${c.data_type})`);
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await authPool.end();
  }
}

checkSchema();
