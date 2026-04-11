require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  database: 'fp_database'
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  MIGRATION 310: Populate Customer Product Groups             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Before counts
    const before = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(primary_product_group) as has_primary_pg,
        COUNT(CASE WHEN array_length(product_groups, 1) > 0 THEN 1 END) as has_pgs_array
      FROM fp_customer_unified
    `);
    console.log('BEFORE:');
    console.table(before.rows);

    await client.query('BEGIN');

    // 1. Update primary_product_group
    console.log('\n1. Updating primary_product_group (most sold PG per customer)...');
    const result1 = await client.query(`
      WITH customer_pg_stats AS (
          SELECT 
              c.customer_id,
              d.productgroup as product_group,
              SUM(COALESCE(d.values, 0)) as total_value,
              ROW_NUMBER() OVER (PARTITION BY c.customer_id ORDER BY SUM(COALESCE(d.values, 0)) DESC) as rn
          FROM fp_customer_unified c
          JOIN fp_data_excel d ON UPPER(TRIM(d.customername)) = c.normalized_name
          WHERE d.productgroup IS NOT NULL AND d.values_type = 'Amount'
          GROUP BY c.customer_id, d.productgroup
      )
      UPDATE fp_customer_unified c
      SET primary_product_group = pg.product_group
      FROM customer_pg_stats pg
      WHERE c.customer_id = pg.customer_id
      AND pg.rn = 1
    `);
    console.log(`   ✅ Updated ${result1.rowCount} customers with primary_product_group`);

    // 2. Update product_groups array
    console.log('\n2. Updating product_groups array (all distinct PGs per customer)...');
    const result2 = await client.query(`
      WITH customer_all_pgs AS (
          SELECT 
              c.customer_id,
              ARRAY_AGG(DISTINCT d.productgroup ORDER BY d.productgroup) as all_pgs
          FROM fp_customer_unified c
          JOIN fp_data_excel d ON UPPER(TRIM(d.customername)) = c.normalized_name
          WHERE d.productgroup IS NOT NULL
          GROUP BY c.customer_id
      )
      UPDATE fp_customer_unified c
      SET product_groups = pg.all_pgs
      FROM customer_all_pgs pg
      WHERE c.customer_id = pg.customer_id
    `);
    console.log(`   ✅ Updated ${result2.rowCount} customers with product_groups array`);

    await client.query('COMMIT');

    // After counts
    const after = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(primary_product_group) as has_primary_pg,
        COUNT(CASE WHEN array_length(product_groups, 1) > 0 THEN 1 END) as has_pgs_array
      FROM fp_customer_unified
    `);
    console.log('\nAFTER:');
    console.table(after.rows);

    // Sample data
    console.log('\nSAMPLE DATA:');
    const sample = await client.query(`
      SELECT display_name, primary_product_group, product_groups 
      FROM fp_customer_unified 
      WHERE primary_product_group IS NOT NULL 
      LIMIT 10
    `);
    console.table(sample.rows);

    console.log('\n✅ Migration 310 complete!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
