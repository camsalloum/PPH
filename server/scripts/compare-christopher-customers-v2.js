/**
 * Compare Christopher's customers from HTML file with fp_actualcommon database
 * Uses existing database config
 */
const fs = require('fs');
const path = require('path');

// Use existing database pool
const { pool } = require('../database/config');

async function compareCustomers() {
  try {
    // Read Christopher's HTML file
    const htmlPath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final/Budget Planning - FP - Christopher Dela Cruz - 2026 Draft.html';
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Extract customers from HTML by parsing table rows
    const customerRegex = /data-customer="([^"]+)"/g;
    const htmlCustomersSet = new Set();
    let match;

    while ((match = customerRegex.exec(html)) !== null) {
      htmlCustomersSet.add(match[1]);
    }

    const htmlCustomers = Array.from(htmlCustomersSet).sort();

    console.log('=== CUSTOMERS IN CHRISTOPHER HTML FILE ===');
    console.log('Total: ' + htmlCustomers.length + ' customers\n');

    // Get customers from fp_actualcommon for Christopher
    const dbQuery = `
      SELECT DISTINCT customer_name
      FROM fp_actualcommon
      WHERE sales_rep_name = 'Christopher Dela Cruz'
        AND year = 2025
      ORDER BY customer_name;
    `;

    console.log('Querying database...');
    const result = await pool.query(dbQuery);
    const dbCustomers = result.rows.map(r => r.customer_name);

    console.log('=== CUSTOMERS IN DATABASE (fp_actualcommon) ===');
    console.log('Sales Rep: Christopher Dela Cruz');
    console.log('Year: 2025');
    console.log('Total: ' + dbCustomers.length + ' customers\n');

    // Create sets for comparison
    const htmlSet = new Set(htmlCustomers);
    const dbSet = new Set(dbCustomers);

    // Find customers only in HTML
    const onlyInHtml = htmlCustomers.filter(c => !dbSet.has(c));

    // Find customers only in DB
    const onlyInDb = dbCustomers.filter(c => !htmlSet.has(c));

    // Find common customers
    const common = htmlCustomers.filter(c => dbSet.has(c));

    console.log('=== COMPARISON RESULTS ===\n');

    console.log('✅ Common Customers (in both HTML and Database): ' + common.length);
    console.log('');

    console.log('⚠️  Customers ONLY in HTML (not in database): ' + onlyInHtml.length);
    if (onlyInHtml.length > 0) {
      onlyInHtml.forEach((c, i) => console.log('   ' + (i + 1) + '. "' + c + '"'));
      console.log('');
    }

    console.log('🔍 Customers ONLY in Database (not in HTML): ' + onlyInDb.length);
    if (onlyInDb.length > 0) {
      onlyInDb.forEach((c, i) => console.log('   ' + (i + 1) + '. "' + c + '"'));
      console.log('');
    }

    // Get sample data for customers only in DB
    if (onlyInDb.length > 0) {
      console.log('\n=== SAMPLE DATA FOR CUSTOMERS ONLY IN DATABASE ===\n');
      const sampleQuery = `
        SELECT
          customer_name,
          country,
          product_group,
          SUM(amount) as total_amount,
          SUM(morm) as total_volume,
          COUNT(*) as transaction_count
        FROM fp_actualcommon
        WHERE sales_rep_name = 'Christopher Dela Cruz'
          AND year = 2025
          AND customer_name = ANY($1::text[])
        GROUP BY customer_name, country, product_group
        ORDER BY total_amount DESC
        LIMIT 20;
      `;

      const sampleResult = await pool.query(sampleQuery, [onlyInDb.slice(0, 20)]);

      console.log('Customer | Country | Product Group | Amount | Volume | Transactions');
      console.log('─'.repeat(120));
      sampleResult.rows.forEach(row => {
        const customer = (row.customer_name || '').substring(0, 30).padEnd(30);
        const country = (row.country || '').substring(0, 20).padEnd(20);
        const pg = (row.product_group || '').substring(0, 25).padEnd(25);
        const amount = '$' + parseFloat(row.total_amount || 0).toFixed(2).padStart(10);
        const volume = parseFloat(row.total_volume || 0).toFixed(2).padStart(8);
        const count = String(row.transaction_count).padStart(5);
        console.log(`${customer} | ${country} | ${pg} | ${amount} | ${volume} | ${count}`);
      });
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log('HTML Customers:        ' + htmlCustomers.length);
    console.log('Database Customers:    ' + dbCustomers.length);
    console.log('Common:                ' + common.length);
    console.log('Only in HTML:          ' + onlyInHtml.length);
    console.log('Only in Database:      ' + onlyInDb.length);
    console.log('Match Rate:            ' + ((common.length / Math.max(htmlCustomers.length, dbCustomers.length)) * 100).toFixed(1) + '%');

    process.exit(0);

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

compareCustomers();
