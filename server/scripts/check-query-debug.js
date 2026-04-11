/**
 * Deep debug the query issue
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
    // Check if fp_item_group_overrides table exists and has data
    console.log('=== ITEM GROUP OVERRIDES TABLE ===');
    try {
      const overrides = await pool.query(`SELECT COUNT(*) as cnt FROM fp_item_group_overrides`);
      console.log('Overrides count:', overrides.rows[0].cnt);
    } catch (e) {
      console.log('Table fp_item_group_overrides does not exist or error:', e.message);
    }

    // Test query WITHOUT item_group_overrides JOIN
    console.log('\n=== QUERY WITHOUT ITEM_GROUP_OVERRIDES JOIN ===');
    const simpleQuery = await pool.query(`
      SELECT
        TRIM(d.customer_name) as customer,
        TRIM(d.country) as country,
        d.pgcombine as productgroup,
        d.month_no as month,
        SUM(d.qty_kgs) / 1000.0 as mt_value,
        SUM(d.amount) as amount_value
      FROM public.fp_actualcommon d
      LEFT JOIN public.fp_product_group_exclusions e
        ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = 'FP'
      WHERE UPPER(d.division_code) = 'FP'
        AND d.year = 2025
        AND TRIM(UPPER(d.sales_rep_name)) = 'NAREK KOROUKIAN'
        AND d.customer_name IS NOT NULL AND TRIM(d.customer_name) != ''
        AND d.country IS NOT NULL AND TRIM(d.country) != ''
        AND d.pgcombine IS NOT NULL AND TRIM(d.pgcombine) != ''
        AND e.product_group IS NULL
      GROUP BY TRIM(d.customer_name), TRIM(d.country), d.pgcombine, d.month_no
    `);

    let simpleTotalMT = 0;
    simpleQuery.rows.forEach(r => {
      simpleTotalMT += parseFloat(r.mt_value) || 0;
    });
    console.log('Rows returned (without override join):', simpleQuery.rowCount);
    console.log('Total MT (without override join):', simpleTotalMT.toFixed(2));

    // Check what's happening with the COALESCE
    console.log('\n=== CHECK ITEM_GROUP_DESC VALUES ===');
    const itemGroupDesc = await pool.query(`
      SELECT DISTINCT item_group_desc, COUNT(*) as cnt
      FROM fp_actualcommon
      WHERE UPPER(TRIM(sales_rep_name)) = 'NAREK KOROUKIAN' AND year = 2025
      GROUP BY item_group_desc
      ORDER BY cnt DESC
      LIMIT 15
    `);
    itemGroupDesc.rows.forEach(r => {
      console.log(`  "${r.item_group_desc}": ${r.cnt} rows`);
    });

    // Check if override mapping changes pgcombine
    console.log('\n=== CHECK OVERRIDE MAPPING EFFECT ===');
    try {
      const overrideEffect = await pool.query(`
        SELECT
          d.item_group_desc,
          d.pgcombine as original_pg,
          igo.pg_combine as override_pg,
          COUNT(*) as cnt
        FROM fp_actualcommon d
        LEFT JOIN fp_item_group_overrides igo
          ON LOWER(TRIM(d.item_group_desc)) = LOWER(TRIM(igo.item_group_description))
        WHERE UPPER(TRIM(d.sales_rep_name)) = 'NAREK KOROUKIAN' AND d.year = 2025
        GROUP BY d.item_group_desc, d.pgcombine, igo.pg_combine
        LIMIT 20
      `);
      overrideEffect.rows.forEach(r => {
        const changed = r.override_pg && r.override_pg !== r.original_pg ? ' ⚠️ CHANGED!' : '';
        console.log(`  "${r.item_group_desc}" | ${r.original_pg} -> ${r.override_pg || 'NULL'}${changed} (${r.cnt} rows)`);
      });
    } catch (e) {
      console.log('Error checking override effect:', e.message);
    }

    await pool.end();
    console.log('\n=== DONE ===');
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    await pool.end();
  }
}

check();
