/**
 * Verify fix with admin_division_code
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
    // Query WITH admin_division_code (the fix)
    console.log('=== QUERY WITH admin_division_code (FIXED) ===');
    const fixedQuery = await pool.query(`
      SELECT
        TRIM(d.customer_name) as customer,
        TRIM(d.country) as country,
        d.pgcombine as productgroup,
        d.month_no as month,
        SUM(d.qty_kgs) / 1000.0 as mt_value
      FROM public.fp_actualcommon d
      WHERE UPPER(d.admin_division_code) = 'FP'
        AND d.year = 2025
        AND TRIM(UPPER(d.sales_rep_name)) = 'NAREK KOROUKIAN'
        AND d.customer_name IS NOT NULL AND TRIM(d.customer_name) != ''
        AND d.country IS NOT NULL AND TRIM(d.country) != ''
        AND d.pgcombine IS NOT NULL AND TRIM(d.pgcombine) != ''
      GROUP BY TRIM(d.customer_name), TRIM(d.country), d.pgcombine, d.month_no
    `);

    let fixedTotalMT = 0;
    fixedQuery.rows.forEach(r => {
      fixedTotalMT += parseFloat(r.mt_value) || 0;
    });
    console.log('Rows returned (admin_division_code):', fixedQuery.rowCount);
    console.log('Total MT (admin_division_code):', fixedTotalMT.toFixed(2));

    // Check admin_division_code values
    console.log('\n=== CHECK admin_division_code VALUES ===');
    const adminDivCheck = await pool.query(`
      SELECT DISTINCT admin_division_code, COUNT(*) as cnt, SUM(qty_kgs)/1000 as mt
      FROM fp_actualcommon
      WHERE UPPER(TRIM(sales_rep_name)) = 'NAREK KOROUKIAN' AND year = 2025
      GROUP BY admin_division_code
    `);
    adminDivCheck.rows.forEach(r => {
      console.log(`  "${r.admin_division_code}": ${r.cnt} rows, ${parseFloat(r.mt).toFixed(2)} MT`);
    });

    // Compare with division_code
    console.log('\n=== COMPARE division_code vs admin_division_code ===');
    const comparisonQuery = await pool.query(`
      SELECT division_code, admin_division_code, COUNT(*) as cnt, SUM(qty_kgs)/1000 as mt
      FROM fp_actualcommon
      WHERE UPPER(TRIM(sales_rep_name)) = 'NAREK KOROUKIAN' AND year = 2025
      GROUP BY division_code, admin_division_code
    `);
    comparisonQuery.rows.forEach(r => {
      console.log(`  division_code="${r.division_code}", admin_division_code="${r.admin_division_code}": ${r.cnt} rows, ${parseFloat(r.mt).toFixed(2)} MT`);
    });

    await pool.end();
    console.log('\n=== DONE ===');
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

check();
