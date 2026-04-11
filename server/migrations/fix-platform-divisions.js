const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'propackhub_platform',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT) || 5432
});

async function fix() {
  console.log('=== FIXING PLATFORM DATABASE ===\n');
  
  // Remove HC division (it was incorrectly added)
  const deleteResult = await pool.query(
    "DELETE FROM company_divisions WHERE division_code = 'hc'"
  );
  console.log('Deleted HC division:', deleteResult.rowCount, 'row(s)');
  
  // Show remaining divisions
  const divisions = await pool.query('SELECT * FROM company_divisions');
  console.log('\nRemaining divisions:');
  divisions.rows.forEach(d => console.log('  -', d.division_code + ':', d.division_name));
  
  // Show company info
  const companies = await pool.query('SELECT company_code, company_name, database_name FROM companies');
  console.log('\nCompanies:');
  companies.rows.forEach(c => console.log('  -', c.company_code + ':', c.company_name, '(' + c.database_name + ')'));
  
  console.log('\n✅ Fixed! Only FP division remains (the one with actual data)');
  
  await pool.end();
}

fix().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
