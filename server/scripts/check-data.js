// Quick data verification
const { Pool } = require('pg');

const fpPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: 'fp_database',
});

async function check() {
  const r = await fpPool.query(`
    SELECT product_group, pe_percentage, bopp_percentage, 
           asp_actual, asp_round, actual_year
    FROM fp_product_group_master 
    ORDER BY product_group 
    LIMIT 5
  `);
  console.log(JSON.stringify(r.rows, null, 2));
  await fpPool.end();
}

check();
