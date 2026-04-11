const { Pool } = require('pg');
require('dotenv').config({ path: './server/.env' });

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function main() {
  const result = await pool.query(`
    SELECT pg_get_functiondef(oid) as definition
    FROM pg_proc
    WHERE proname = 'sync_raw_to_actualcommon'
  `);
  
  if (result.rows.length) {
    console.log('=== sync_raw_to_actualcommon FUNCTION ===\n');
    console.log(result.rows[0].definition);
  } else {
    console.log('Function not found');
  }
  
  // Also check the trigger
  const trigResult = await pool.query(`
    SELECT pg_get_triggerdef(oid) as definition
    FROM pg_trigger
    WHERE tgname = 'after_fp_raw_data_change'
  `);
  
  if (trigResult.rows.length) {
    console.log('\n=== TRIGGER ===\n');
    console.log(trigResult.rows[0].definition);
  }
  
  await pool.end();
}

main().catch(console.error);
