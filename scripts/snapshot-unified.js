require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  database: 'fp_database'
});

async function snapshot() {
  const timestamp = new Date().toISOString();
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`📊 UNIFIED DATA SNAPSHOT - ${timestamp}`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  // Raw data count
  const raw = await pool.query(`SELECT COUNT(*) as count FROM fp_data_excel`);
  console.log(`fp_data_excel:           ${raw.rows[0].count} rows`);

  // Unified tables
  const cust = await pool.query(`SELECT COUNT(*) as count FROM fp_customer_unified`);
  console.log(`fp_customer_unified:     ${cust.rows[0].count} customers`);

  const reps = await pool.query(`SELECT COUNT(*) as count FROM fp_sales_rep_unified`);
  console.log(`fp_sales_rep_unified:    ${reps.rows[0].count} sales reps`);

  const pgs = await pool.query(`SELECT COUNT(*) as count FROM fp_product_group_unified`);
  console.log(`fp_product_group_unified: ${pgs.rows[0].count} product groups`);

  // View
  const view = await pool.query(`SELECT COUNT(*) as count FROM vw_unified_sales_complete`);
  console.log(`vw_unified_sales_complete: ${view.rows[0].count} rows`);

  // Materialized views
  const mv1 = await pool.query(`SELECT COUNT(*) as count FROM mv_sales_by_customer`);
  const mv2 = await pool.query(`SELECT COUNT(*) as count FROM mv_sales_by_rep_group`);
  const mv3 = await pool.query(`SELECT COUNT(*) as count FROM mv_sales_by_product_group`);
  const mv4 = await pool.query(`SELECT COUNT(*) as count FROM mv_sales_by_country`);
  console.log(`\nMaterialized Views:`);
  console.log(`  mv_sales_by_customer:      ${mv1.rows[0].count}`);
  console.log(`  mv_sales_by_rep_group:     ${mv2.rows[0].count}`);
  console.log(`  mv_sales_by_product_group: ${mv3.rows[0].count}`);
  console.log(`  mv_sales_by_country:       ${mv4.rows[0].count}`);

  // Sample of latest updates
  const latest = await pool.query(`
    SELECT display_name, updated_at 
    FROM fp_customer_unified 
    ORDER BY updated_at DESC 
    LIMIT 3
  `);
  console.log(`\nLatest customer updates:`);
  latest.rows.forEach(r => console.log(`  ${r.display_name.substring(0,30)} - ${r.updated_at}`));

  await pool.end();
}

snapshot();
