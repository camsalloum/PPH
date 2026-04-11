const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  database: 'fp_database',
  user: 'postgres',
  password: '***REDACTED***',
  port: 5432
});

async function search() {
  const searches = ['Cevital', 'Randa', 'Somafaco', 'Socem', 'Ama', 'Sahara', 'Delice', 'Traveps', 'Nesto'];
  for (const term of searches) {
    const res = await pool.query(
      `SELECT display_name FROM fp_customer_unified WHERE display_name ILIKE $1 ORDER BY display_name`,
      ['%' + term + '%']
    );
    console.log(term + ':', res.rows.map(r => r.display_name).join(', ') || 'NOT FOUND');
  }
  await pool.end();
}
search();
