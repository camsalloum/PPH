/**
 * Compare Christopher's customers from HTML file with fp_actualcommon database
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

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
      SELECT DISTINCT customer
      FROM fp_actualcommon
      WHERE salesrepname = 'Christopher Dela Cruz'
        AND EXTRACT(YEAR FROM dt) = 2025
      ORDER BY customer;
    `;

    const result = await pool.query(dbQuery);
    const dbCustomers = result.rows.map(r => r.customer);

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
    if (common.length > 0 && common.length <= 20) {
      common.forEach((c, i) => console.log('   ' + (i + 1) + '. "' + c + '"'));
      console.log('');
    }

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
          customer,
          country,
          productgroup,
          SUM(amount) as total_amount,
          SUM(morm) as total_volume,
          COUNT(*) as transaction_count
        FROM fp_actualcommon
        WHERE salesrepname = 'Christopher Dela Cruz'
          AND EXTRACT(YEAR FROM dt) = 2025
          AND customer = ANY($1)
        GROUP BY customer, country, productgroup
        ORDER BY total_amount DESC
        LIMIT 20;
      `;

      const sampleResult = await pool.query(sampleQuery, [onlyInDb.slice(0, 20)]);

      console.log('Customer | Country | Product Group | Amount | Volume | Transactions');
      console.log('─'.repeat(100));
      sampleResult.rows.forEach(row => {
        console.log(
          `${row.customer.padEnd(30)} | ${(row.country || '').padEnd(20)} | ${(row.productgroup || '').padEnd(25)} | $${parseFloat(row.total_amount || 0).toFixed(2).padStart(10)} | ${parseFloat(row.total_volume || 0).toFixed(2).padStart(8)} | ${row.transaction_count}`
        );
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

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

compareCustomers();
