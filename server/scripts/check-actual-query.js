/**
 * Check actual query that html-budget.js uses
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
    console.log('=== CHECKING ACTUAL QUERY (same as html-budget.js) ===\n');

    // Check with EXACT query from html-budget.js
    const result = await pool.query(`
      SELECT
        TRIM(d.customer_name) as customer,
        TRIM(d.country) as country,
        COALESCE(igo.pg_combine, d.pgcombine) as productgroup,
        d.month_no as month,
        SUM(d.qty_kgs) / 1000.0 as mt_value,
        SUM(d.amount) as amount_value
      FROM public.fp_actualcommon d
      LEFT JOIN public.fp_item_group_overrides igo
        ON LOWER(TRIM(d.item_group_desc)) = LOWER(TRIM(igo.item_group_description))
      LEFT JOIN public.fp_product_group_exclusions e
        ON UPPER(TRIM(COALESCE(igo.pg_combine, d.pgcombine))) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = 'FP'
      WHERE UPPER(d.division_code) = 'FP'
        AND d.year = 2025
        AND TRIM(UPPER(d.sales_rep_name)) = 'NAREK KOROUKIAN'
        AND d.customer_name IS NOT NULL AND TRIM(d.customer_name) != ''
        AND d.country IS NOT NULL AND TRIM(d.country) != ''
        AND d.pgcombine IS NOT NULL AND TRIM(d.pgcombine) != ''
        AND e.product_group IS NULL
      GROUP BY TRIM(d.customer_name), TRIM(d.country), COALESCE(igo.pg_combine, d.pgcombine), d.month_no
    `);

    let totalMT = 0;
    let totalAmount = 0;
    result.rows.forEach(r => {
      totalMT += parseFloat(r.mt_value) || 0;
      totalAmount += parseFloat(r.amount_value) || 0;
    });

    console.log('Rows returned:', result.rowCount);
    console.log('Total MT:', totalMT.toFixed(2));
    console.log('Total Amount:', totalAmount.toFixed(0));

    // Check exclusions
    console.log('\n=== PRODUCT GROUP EXCLUSIONS ===');
    const exclusions = await pool.query(`SELECT * FROM fp_product_group_exclusions WHERE UPPER(division_code) = 'FP'`);
    console.log('Excluded product groups:', exclusions.rows.map(r => r.product_group));

    // Check what pgcombine values exist for Narek
    console.log('\n=== NAREK PGCOMBINE VALUES ===');
    const pgValues = await pool.query(`
      SELECT DISTINCT pgcombine, COUNT(*) as cnt, SUM(qty_kgs)/1000 as total_mt
      FROM fp_actualcommon
      WHERE UPPER(TRIM(sales_rep_name)) = 'NAREK KOROUKIAN' AND year = 2025
      GROUP BY pgcombine
    `);
    pgValues.rows.forEach(r => {
      console.log(`  ${r.pgcombine}: ${r.cnt} rows, ${parseFloat(r.total_mt).toFixed(2)} MT`);
    });

    // Check if exclusion is filtering out data
    console.log('\n=== CHECKING IF EXCLUSION MATCHES ===');
    for (const pg of pgValues.rows) {
      const match = exclusions.rows.find(e =>
        e.product_group.toUpperCase().trim() === pg.pgcombine.toUpperCase().trim()
      );
      if (match) {
        console.log(`  ⚠️ EXCLUDED: ${pg.pgcombine} (${parseFloat(pg.total_mt).toFixed(2)} MT)`);
      }
    }

    // DEBUG: Check the actual JOIN behavior
    console.log('\n=== DEBUG: CHECKING JOIN BEHAVIOR ===');
    const debugQuery = await pool.query(`
      SELECT
        TRIM(d.customer_name) as customer,
        TRIM(d.pgcombine) as pgcombine,
        e.product_group as excluded_pg,
        SUM(d.qty_kgs) / 1000.0 as mt_value
      FROM public.fp_actualcommon d
      LEFT JOIN public.fp_product_group_exclusions e
        ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = 'FP'
      WHERE UPPER(d.division_code) = 'FP'
        AND d.year = 2025
        AND TRIM(UPPER(d.sales_rep_name)) = 'NAREK KOROUKIAN'
      GROUP BY TRIM(d.customer_name), TRIM(d.pgcombine), e.product_group
      LIMIT 20
    `);
    console.log('Sample rows with exclusion check:');
    debugQuery.rows.forEach(r => {
      console.log(`  ${r.customer} | ${r.pgcombine} | excluded=${r.excluded_pg || 'NULL'} | ${parseFloat(r.mt_value).toFixed(2)} MT`);
    });

    // Check item_group_overrides
    console.log('\n=== ITEM GROUP OVERRIDES ===');
    const overrides = await pool.query(`SELECT * FROM fp_item_group_overrides LIMIT 10`);
    console.log('Overrides count:', overrides.rowCount);
    overrides.rows.forEach(r => {
      console.log(`  ${r.item_group_description} -> ${r.pg_combine}`);
    });

    await pool.end();
    console.log('\n=== DONE ===');
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

check();
