const { Pool } = require('pg');
const pool = new Pool({ 
  user: 'postgres', 
  host: 'localhost', 
  database: 'propackhub_platform', 
  password: process.env.DB_PASSWORD || '', 
  port: 5432 
});

async function run() {
  // Update company name
  await pool.query("UPDATE companies SET company_name = 'Interplast Co LTD' WHERE company_code = 'interplast'");
  
  // Update division name
  await pool.query("UPDATE company_divisions SET division_name = 'Flexible Packaging Division' WHERE division_code = 'fp'");
  
  console.log('Updated!');
  
  // Verify
  const c = await pool.query('SELECT company_name FROM companies');
  const d = await pool.query('SELECT division_name FROM company_divisions');
  console.log('Company:', c.rows[0].company_name);
  console.log('Division:', d.rows[0].division_name);
  
  await pool.end();
}

run();
