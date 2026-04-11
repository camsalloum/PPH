const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  database: 'fp_database',
  user: 'postgres',
  password: '***REDACTED***',
  port: 5432
});

async function getCustomers() {
  try {
    // First check the column names
    const colResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'fp_customer_unified'
    `);
    console.log('Columns:', colResult.rows.map(r => r.column_name));
    
    // Get all customers
    const result = await pool.query('SELECT * FROM fp_customer_unified LIMIT 5');
    console.log('Sample data:', JSON.stringify(result.rows, null, 2));
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

getCustomers();
