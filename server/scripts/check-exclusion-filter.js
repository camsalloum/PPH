/**
 * Check exclusion filter effect
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432
});

async function check() {
  try {
    // Query WITHOUT any exclusion filter
    console.log('=== QUERY WITHOUT EXCLUSION FILTER ===');
    const noExclusionQuery = await pool.query(`
      SELECT
        TRIM(d.customer_name) as customer,
        TRIM(d.country) as country,
        d.pgcombine as productgroup,
        d.month_no as month,
        SUM(d.qty_kgs) / 1000.0 as mt_value
      FROM public.fp_actualcommon d
      WHERE UPPER(d.division_code) = 'FP'
        AND d.year = 2025
        AND TRIM(UPPER(d.sales_rep_name)) = 'NAREK KOROUKIAN'
        AND d.customer_name IS NOT NULL AND TRIM(d.customer_name) != ''
        AND d.country IS NOT NULL AND TRIM(d.country) != ''
        AND d.pgcombine IS NOT NULL AND TRIM(d.pgcombine) != ''
      GROUP BY TRIM(d.customer_name), TRIM(d.country), d.pgcombine, d.month_no
    `);

    let noExclusionTotalMT = 0;
    noExclusionQuery.rows.forEach(r => {
      noExclusionTotalMT += parseFloat(r.mt_value) || 0;
    });
    console.log('Rows returned (no exclusion):', noExclusionQuery.rowCount);
    console.log('Total MT (no exclusion):', noExclusionTotalMT.toFixed(2));

    // Check what customers exist
    console.log('\n=== CUSTOMERS FOR NAREK ===');
    const customers = await pool.query(`
      SELECT DISTINCT
        TRIM(customer_name) as customer,
        TRIM(country) as country,
        COUNT(*) as rows,
        SUM(qty_kgs)/1000 as mt
      FROM fp_actualcommon
      WHERE UPPER(TRIM(sales_rep_name)) = 'NAREK KOROUKIAN' AND year = 2025
      GROUP BY TRIM(customer_name), TRIM(country)
      ORDER BY mt DESC
    `);
    console.log('Total customers:', customers.rowCount);
    customers.rows.slice(0, 15).forEach(r => {
      console.log(`  ${r.customer} (${r.country}): ${parseFloat(r.mt).toFixed(2)} MT`);
    });

    // Check empty customer_name or country
    console.log('\n=== CHECK FOR EMPTY FIELDS ===');
    const emptyCheck = await pool.query(`
      SELECT
        SUM(CASE WHEN customer_name IS NULL OR TRIM(customer_name) = '' THEN qty_kgs ELSE 0 END)/1000 as empty_customer_mt,
        SUM(CASE WHEN country IS NULL OR TRIM(country) = '' THEN qty_kgs ELSE 0 END)/1000 as empty_country_mt,
        SUM(CASE WHEN pgcombine IS NULL OR TRIM(pgcombine) = '' THEN qty_kgs ELSE 0 END)/1000 as empty_pg_mt,
        SUM(qty_kgs)/1000 as total_mt
      FROM fp_actualcommon
      WHERE UPPER(TRIM(sales_rep_name)) = 'NAREK KOROUKIAN' AND year = 2025
    `);
    console.log('Empty customer_name MT:', parseFloat(emptyCheck.rows[0].empty_customer_mt).toFixed(2));
    console.log('Empty country MT:', parseFloat(emptyCheck.rows[0].empty_country_mt).toFixed(2));
    console.log('Empty pgcombine MT:', parseFloat(emptyCheck.rows[0].empty_pg_mt).toFixed(2));
    console.log('Total MT:', parseFloat(emptyCheck.rows[0].total_mt).toFixed(2));

    // Check division_code
    console.log('\n=== CHECK DIVISION_CODE ===');
    const divCheck = await pool.query(`
      SELECT DISTINCT division_code, COUNT(*) as cnt, SUM(qty_kgs)/1000 as mt
      FROM fp_actualcommon
      WHERE UPPER(TRIM(sales_rep_name)) = 'NAREK KOROUKIAN' AND year = 2025
      GROUP BY division_code
    `);
    divCheck.rows.forEach(r => {
      console.log(`  "${r.division_code}": ${r.cnt} rows, ${parseFloat(r.mt).toFixed(2)} MT`);
    });

    await pool.end();
    console.log('\n=== DONE ===');
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

check();
