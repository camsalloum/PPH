require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  database: 'fp_database'
});

async function fullAudit() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  COMPLETE UNIFIED DATA AUDIT - CHECKING ALL FIELDS                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  try {
    // ========== 1. fp_customer_unified ==========
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('1. fp_customer_unified - FIELD COMPLETENESS');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    
    const custAudit = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(customer_code) as has_customer_code,
        COUNT(display_name) as has_display_name,
        COUNT(normalized_name) as has_normalized_name,
        COUNT(primary_sales_rep_name) as has_primary_sales_rep_name,
        COUNT(primary_sales_rep_id) as has_primary_sales_rep_id,
        COUNT(sales_rep_group_id) as has_sales_rep_group_id,
        COUNT(sales_rep_group_name) as has_sales_rep_group_name,
        COUNT(primary_country) as has_primary_country,
        COUNT(CASE WHEN array_length(countries, 1) > 0 THEN 1 END) as has_countries_array,
        COUNT(primary_product_group) as has_primary_product_group,
        COUNT(CASE WHEN array_length(product_groups, 1) > 0 THEN 1 END) as has_product_groups_array,
        COUNT(total_amount_all_time) as has_total_amount,
        COUNT(total_kgs_all_time) as has_total_kgs,
        COUNT(total_morm_all_time) as has_total_morm,
        COUNT(first_transaction_date) as has_first_txn,
        COUNT(last_transaction_date) as has_last_txn,
        COUNT(CASE WHEN array_length(transaction_years, 1) > 0 THEN 1 END) as has_txn_years,
        COUNT(division) as has_division,
        COUNT(company_currency) as has_company_currency
      FROM fp_customer_unified
    `);
    
    const c = custAudit.rows[0];
    const total = parseInt(c.total);
    console.log(`Total Customers: ${total}\n`);
    console.log('Field                      | Count | % Complete | Status');
    console.log('---------------------------|-------|------------|--------');
    
    const custFields = [
      ['customer_code', c.has_customer_code],
      ['display_name', c.has_display_name],
      ['normalized_name', c.has_normalized_name],
      ['primary_sales_rep_name', c.has_primary_sales_rep_name],
      ['primary_sales_rep_id', c.has_primary_sales_rep_id],
      ['sales_rep_group_id', c.has_sales_rep_group_id],
      ['sales_rep_group_name', c.has_sales_rep_group_name],
      ['primary_country', c.has_primary_country],
      ['countries[]', c.has_countries_array],
      ['primary_product_group', c.has_primary_product_group],
      ['product_groups[]', c.has_product_groups_array],
      ['total_amount_all_time', c.has_total_amount],
      ['total_kgs_all_time', c.has_total_kgs],
      ['total_morm_all_time', c.has_total_morm],
      ['first_transaction_date', c.has_first_txn],
      ['last_transaction_date', c.has_last_txn],
      ['transaction_years[]', c.has_txn_years],
      ['division', c.has_division],
      ['company_currency', c.has_company_currency],
    ];
    
    const custIssues = [];
    custFields.forEach(([name, count]) => {
      const cnt = parseInt(count);
      const pct = ((cnt / total) * 100).toFixed(1);
      const status = cnt === total ? '✅' : cnt === 0 ? '❌ EMPTY' : '⚠️ PARTIAL';
      console.log(`${name.padEnd(26)} | ${String(cnt).padStart(5)} | ${pct.padStart(9)}% | ${status}`);
      if (cnt < total) custIssues.push({ field: name, count: cnt, missing: total - cnt });
    });

    // ========== 2. fp_sales_rep_unified ==========
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('2. fp_sales_rep_unified - FIELD COMPLETENESS');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    
    const repAudit = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(sales_rep_code) as has_code,
        COUNT(display_name) as has_display_name,
        COUNT(normalized_name) as has_normalized_name,
        COUNT(group_id) as has_group_id,
        COUNT(group_name) as has_group_name,
        COUNT(total_amount_all_time) as has_total_amount,
        COUNT(total_kgs_all_time) as has_total_kgs,
        COUNT(total_morm_all_time) as has_total_morm,
        COUNT(customer_count) as has_customer_count,
        COUNT(country_count) as has_country_count,
        COUNT(first_transaction_date) as has_first_txn,
        COUNT(last_transaction_date) as has_last_txn,
        COUNT(division) as has_division,
        COUNT(company_currency) as has_company_currency
      FROM fp_sales_rep_unified
    `);
    
    const r = repAudit.rows[0];
    const repTotal = parseInt(r.total);
    console.log(`Total Sales Reps: ${repTotal}\n`);
    console.log('Field                      | Count | % Complete | Status');
    console.log('---------------------------|-------|------------|--------');
    
    const repFields = [
      ['sales_rep_code', r.has_code],
      ['display_name', r.has_display_name],
      ['normalized_name', r.has_normalized_name],
      ['group_id', r.has_group_id],
      ['group_name', r.has_group_name],
      ['total_amount_all_time', r.has_total_amount],
      ['total_kgs_all_time', r.has_total_kgs],
      ['total_morm_all_time', r.has_total_morm],
      ['customer_count', r.has_customer_count],
      ['country_count', r.has_country_count],
      ['first_transaction_date', r.has_first_txn],
      ['last_transaction_date', r.has_last_txn],
      ['division', r.has_division],
      ['company_currency', r.has_company_currency],
    ];
    
    const repIssues = [];
    repFields.forEach(([name, count]) => {
      const cnt = parseInt(count);
      const pct = ((cnt / repTotal) * 100).toFixed(1);
      const status = cnt === repTotal ? '✅' : cnt === 0 ? '❌ EMPTY' : '⚠️ PARTIAL';
      console.log(`${name.padEnd(26)} | ${String(cnt).padStart(5)} | ${pct.padStart(9)}% | ${status}`);
      if (cnt < repTotal) repIssues.push({ field: name, count: cnt, missing: repTotal - cnt });
    });

    // ========== 3. fp_product_group_unified ==========
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('3. fp_product_group_unified - FIELD COMPLETENESS');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    
    const pgAudit = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(pg_code) as has_code,
        COUNT(display_name) as has_display_name,
        COUNT(normalized_name) as has_normalized_name,
        COUNT(material) as has_material,
        COUNT(process) as has_process,
        COUNT(pg_combined) as has_pg_combined,
        COUNT(pg_combine_name) as has_pg_combine_name,
        COUNT(CASE WHEN raw_pg_mapping IS NOT NULL AND jsonb_array_length(raw_pg_mapping) > 0 THEN 1 END) as has_raw_mapping,
        COUNT(total_amount_all_time) as has_total_amount,
        COUNT(total_kgs_all_time) as has_total_kgs,
        COUNT(total_morm_all_time) as has_total_morm,
        COUNT(division) as has_division,
        COUNT(company_currency) as has_company_currency
      FROM fp_product_group_unified
    `);
    
    const p = pgAudit.rows[0];
    const pgTotal = parseInt(p.total);
    console.log(`Total Product Groups: ${pgTotal}\n`);
    console.log('Field                      | Count | % Complete | Status');
    console.log('---------------------------|-------|------------|--------');
    
    const pgFields = [
      ['pg_code', p.has_code],
      ['display_name', p.has_display_name],
      ['normalized_name', p.has_normalized_name],
      ['material', p.has_material],
      ['process', p.has_process],
      ['pg_combined', p.has_pg_combined],
      ['pg_combine_name', p.has_pg_combine_name],
      ['raw_pg_mapping[]', p.has_raw_mapping],
      ['total_amount_all_time', p.has_total_amount],
      ['total_kgs_all_time', p.has_total_kgs],
      ['total_morm_all_time', p.has_total_morm],
      ['division', p.has_division],
      ['company_currency', p.has_company_currency],
    ];
    
    const pgIssues = [];
    pgFields.forEach(([name, count]) => {
      const cnt = parseInt(count);
      const pct = ((cnt / pgTotal) * 100).toFixed(1);
      const status = cnt === pgTotal ? '✅' : cnt === 0 ? '❌ EMPTY' : '⚠️ PARTIAL';
      console.log(`${name.padEnd(26)} | ${String(cnt).padStart(5)} | ${pct.padStart(9)}% | ${status}`);
      if (cnt < pgTotal) pgIssues.push({ field: name, count: cnt, missing: pgTotal - cnt });
    });

    // ========== 4. vw_unified_sales_complete ==========
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('4. vw_unified_sales_complete - JOIN EFFECTIVENESS');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    
    const viewAudit = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(customer_id) as has_customer_id,
        COUNT(customer_name) as has_customer_name,
        COUNT(sales_rep_id) as has_sales_rep_id,
        COUNT(sales_rep_name) as has_sales_rep_name,
        COUNT(sales_rep_group_id) as has_sales_rep_group_id,
        COUNT(sales_rep_group_name) as has_sales_rep_group_name,
        COUNT(product_group_id) as has_product_group_id,
        COUNT(raw_product_group) as has_raw_product_group,
        COUNT(pg_combine) as has_pg_combine,
        COUNT(country) as has_country,
        COUNT(country_id) as has_country_id,
        COUNT(country_region) as has_country_region,
        COUNT(country_market_type) as has_country_market_type,
        COUNT(exchange_rate_to_aed) as has_exchange_rate
      FROM vw_unified_sales_complete
    `);
    
    const v = viewAudit.rows[0];
    const viewTotal = parseInt(v.total);
    console.log(`Total Rows: ${viewTotal}\n`);
    console.log('Field                      | Count | % Complete | Status');
    console.log('---------------------------|-------|------------|--------');
    
    const viewFields = [
      ['customer_id', v.has_customer_id],
      ['customer_name', v.has_customer_name],
      ['sales_rep_id', v.has_sales_rep_id],
      ['sales_rep_name', v.has_sales_rep_name],
      ['sales_rep_group_id', v.has_sales_rep_group_id],
      ['sales_rep_group_name', v.has_sales_rep_group_name],
      ['product_group_id', v.has_product_group_id],
      ['raw_product_group', v.has_raw_product_group],
      ['pg_combine', v.has_pg_combine],
      ['country', v.has_country],
      ['country_id', v.has_country_id],
      ['country_region', v.has_country_region],
      ['country_market_type', v.has_country_market_type],
      ['exchange_rate_to_aed', v.has_exchange_rate],
    ];
    
    const viewIssues = [];
    viewFields.forEach(([name, count]) => {
      const cnt = parseInt(count);
      const pct = ((cnt / viewTotal) * 100).toFixed(1);
      const status = cnt === viewTotal ? '✅' : cnt === 0 ? '❌ EMPTY' : '⚠️ PARTIAL';
      console.log(`${name.padEnd(26)} | ${String(cnt).padStart(5)} | ${pct.padStart(9)}% | ${status}`);
      if (cnt < viewTotal) viewIssues.push({ field: name, count: cnt, missing: viewTotal - cnt });
    });

    // ========== SUMMARY ==========
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('ISSUES REQUIRING ATTENTION');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    
    const allIssues = [
      ...custIssues.map(i => ({ table: 'fp_customer_unified', ...i })),
      ...repIssues.map(i => ({ table: 'fp_sales_rep_unified', ...i })),
      ...pgIssues.map(i => ({ table: 'fp_product_group_unified', ...i })),
      ...viewIssues.map(i => ({ table: 'vw_unified_sales_complete', ...i })),
    ];
    
    if (allIssues.length === 0) {
      console.log('\n✅ ALL FIELDS ARE 100% COMPLETE!\n');
    } else {
      console.log('\n');
      allIssues.forEach(issue => {
        const pct = ((issue.count / (issue.count + issue.missing)) * 100).toFixed(1);
        console.log(`❌ ${issue.table}.${issue.field}: ${issue.missing} missing (${pct}% complete)`);
      });
      console.log('\n');
    }

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

fullAudit();
