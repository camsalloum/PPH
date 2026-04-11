/**
 * Generate Excel Review File for Christopher's Budget
 *
 * Creates an Excel file with all HTML customers and their database matches
 * You can review and mark your decisions in Excel, then we'll apply them
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('../database/config');

// Normalize customer names
function normalizeCustomerName(name) {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\bL+L+C\b/g, '')
    .replace(/\bLTD\b/g, '')
    .replace(/\bCO\b/g, '')
    .replace(/\bFZCO\b/g, '')
    .replace(/\bFZE\b/g, '')
    .replace(/\bPJSC\b/g, '')
    .replace(/\bLIMITED\b/g, '')
    .trim();
}

// Calculate similarity
function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 100;

  const editDistance = levenshteinDistance(longer, shorter);
  return ((longer.length - editDistance) / longer.length) * 100;
}

function levenshteinDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

async function generateExcelReview() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     GENERATING EXCEL REVIEW FILE FOR CHRISTOPHER BUDGET        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Load HTML customers
    const htmlPath = path.join(__dirname, '../../HTML Budget 2026 sales reps export and import/final 2026/final/Budget Planning - FP - Christopher Dela Cruz - 2026 Draft.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    const customerRegex = /data-customer="([^"]+)"/g;
    const htmlCustomersSet = new Set();
    let match;

    while ((match = customerRegex.exec(htmlContent)) !== null) {
      htmlCustomersSet.add(match[1]);
    }

    const htmlCustomers = Array.from(htmlCustomersSet).sort();
    console.log(`📄 Found ${htmlCustomers.length} unique customers in HTML\n`);

    // Load database customers
    const allCustomersQuery = `
      SELECT
        customer_id,
        display_name,
        normalized_name,
        primary_country,
        primary_sales_rep_name,
        total_amount_all_time
      FROM fp_customer_unified
      WHERE is_active = TRUE
        AND is_merged = FALSE
      ORDER BY display_name;
    `;

    const allCustomersResult = await pool.query(allCustomersQuery);
    const allCustomers = allCustomersResult.rows;
    console.log(`📊 Found ${allCustomers.length} customers in unified database\n`);

    // Find best matches for each HTML customer
    const reviewData = [];

    for (let i = 0; i < htmlCustomers.length; i++) {
      const htmlCust = htmlCustomers[i];
      const normalized = normalizeCustomerName(htmlCust);
      let bestMatch = null;
      let bestScore = 0;
      let bestCustomer = null;
      let alt1 = null, alt2 = null, alt3 = null;
      let alt1Score = 0, alt2Score = 0, alt3Score = 0;

      for (const dbCust of allCustomers) {
        const dbNormalized = normalizeCustomerName(dbCust.display_name);
        const score = similarity(normalized, dbNormalized);

        if (score > bestScore) {
          // Shift alternatives
          alt3 = alt2;
          alt3Score = alt2Score;
          alt2 = alt1;
          alt2Score = alt1Score;
          alt1 = bestMatch;
          alt1Score = bestScore;

          bestScore = score;
          bestMatch = dbCust.display_name;
          bestCustomer = dbCust;
        } else if (score > alt1Score) {
          alt3 = alt2;
          alt3Score = alt2Score;
          alt2 = alt1;
          alt2Score = alt1Score;
          alt1 = dbCust.display_name;
          alt1Score = score;
        } else if (score > alt2Score) {
          alt3 = alt2;
          alt3Score = alt2Score;
          alt2 = dbCust.display_name;
          alt2Score = score;
        } else if (score > alt3Score) {
          alt3 = dbCust.display_name;
          alt3Score = score;
        }
      }

      const isChristopher = bestCustomer?.primary_sales_rep_name === 'Christopher Dela Cruz';
      const amount = bestCustomer?.total_amount_all_time || 0;
      const country = bestCustomer?.primary_country || '';
      const rep = bestCustomer?.primary_sales_rep_name || '';

      reviewData.push({
        'No.': i + 1,
        'HTML Customer Name': htmlCust,
        'Match Score %': Math.round(bestScore * 10) / 10,
        'DB Best Match': bestMatch,
        'Is Christopher': isChristopher ? 'YES' : 'No',
        'Sales Rep': rep,
        'Country': country,
        'Total Sales ($)': Math.round(amount),
        'Alternative 1': alt1 || '',
        'Alt1 Score %': alt1Score ? Math.round(alt1Score * 10) / 10 : '',
        'Alternative 2': alt2 || '',
        'Alt2 Score %': alt2Score ? Math.round(alt2Score * 10) / 10 : '',
        'Alternative 3': alt3 || '',
        'Alt3 Score %': alt3Score ? Math.round(alt3Score * 10) / 10 : '',
        '>> YOUR DECISION <<': '',
        'Corrected Name / Action': '',
        'Notes': ''
      });
    }

    // Create worksheet with data
    const ws = XLSX.utils.json_to_sheet(reviewData);

    // Set column widths
    ws['!cols'] = [
      { wch: 5 },   // No.
      { wch: 45 },  // HTML Customer Name
      { wch: 12 },  // Match Score
      { wch: 45 },  // DB Best Match
      { wch: 12 },  // Is Christopher
      { wch: 25 },  // Sales Rep
      { wch: 20 },  // Country
      { wch: 15 },  // Total Sales
      { wch: 40 },  // Alternative 1
      { wch: 12 },  // Alt1 Score
      { wch: 40 },  // Alternative 2
      { wch: 12 },  // Alt2 Score
      { wch: 40 },  // Alternative 3
      { wch: 12 },  // Alt3 Score
      { wch: 20 },  // YOUR DECISION
      { wch: 45 },  // Corrected Name / Action
      { wch: 30 }   // Notes
    ];

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customer Review');

    // Add instructions sheet
    const instructions = [
      ['CHRISTOPHER BUDGET 2026 - CUSTOMER REVIEW INSTRUCTIONS'],
      [''],
      ['HOW TO USE THIS FILE:'],
      ['1. Review each customer in the "Customer Review" sheet'],
      ['2. In the ">> YOUR DECISION <<" column, enter one of:'],
      ['   • APPROVE    - Use the "DB Best Match" name'],
      ['   • REJECT     - Keep the original HTML name (new prospect)'],
      ['   • ALT1       - Use Alternative 1'],
      ['   • ALT2       - Use Alternative 2'],
      ['   • ALT3       - Use Alternative 3'],
      ['   • PROSPECT   - Keep as new prospect for 2026'],
      ['   • CUSTOM     - Enter custom name in "Corrected Name / Action" column'],
      [''],
      ['3. For CUSTOM decision, fill in the "Corrected Name / Action" column'],
      ['4. Use "Notes" column for any comments'],
      ['5. Save the file when done'],
      ['6. Run the apply script to update the HTML file'],
      [''],
      ['LEGEND:'],
      ['• Match Score %: Similarity between HTML and DB name (higher is better)'],
      ['• Is Christopher: YES if this customer belongs to Christopher'],
      ['• Total Sales ($): Historical sales amount for this customer'],
      [''],
      ['TIPS:'],
      ['• Focus on customers with "Is Christopher = YES" first'],
      ['• High match scores (>80%) are usually correct'],
      ['• Check Total Sales to identify important customers'],
      ['• Medium scores (60-79%) need careful review'],
      ['• Low scores (<60%) might be new prospects'],
      [''],
      ['FILE GENERATED: ' + new Date().toISOString()],
      ['TOTAL CUSTOMERS: ' + htmlCustomers.length]
    ];

    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

    // Add missing customers sheet
    const christopherQuery = `
      SELECT
        customer_id,
        display_name,
        primary_country,
        primary_sales_rep_name,
        total_amount_all_time
      FROM fp_customer_unified
      WHERE is_active = TRUE
        AND is_merged = FALSE
        AND primary_sales_rep_name = 'Christopher Dela Cruz'
      ORDER BY total_amount_all_time DESC NULLS LAST;
    `;

    const christopherResult = await pool.query(christopherQuery);
    const christopherCustomers = christopherResult.rows;

    // Find which Christopher customers are NOT in HTML
    const htmlCustomersSet2 = new Set(htmlCustomers);
    const missingCustomers = [];

    for (const dbCust of christopherCustomers) {
      // Check if this customer matches any HTML customer
      let foundInHtml = false;
      for (const htmlCust of htmlCustomers) {
        const score = similarity(
          normalizeCustomerName(htmlCust),
          normalizeCustomerName(dbCust.display_name)
        );
        if (score > 70) {
          foundInHtml = true;
          break;
        }
      }

      if (!foundInHtml) {
        missingCustomers.push({
          'Customer Name': dbCust.display_name,
          'Country': dbCust.primary_country || '',
          'Total Sales ($)': Math.round(dbCust.total_amount_all_time || 0),
          'Action': 'ADD TO BUDGET?',
          'Notes': ''
        });
      }
    }

    if (missingCustomers.length > 0) {
      const wsMissing = XLSX.utils.json_to_sheet(missingCustomers);
      wsMissing['!cols'] = [
        { wch: 50 },  // Customer Name
        { wch: 20 },  // Country
        { wch: 20 },  // Total Sales
        { wch: 20 },  // Action
        { wch: 40 }   // Notes
      ];
      XLSX.utils.book_append_sheet(wb, wsMissing, 'Missing Customers');
    }

    // Save file
    const outputPath = path.join(__dirname, '../../exports/Christopher_Budget_Review.xlsx');
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    XLSX.writeFile(wb, outputPath);

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ EXCEL FILE GENERATED SUCCESSFULLY!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`📄 File: ${outputPath}`);
    console.log(`📊 Total Customers: ${htmlCustomers.length}`);
    console.log(`➕ Missing Customers: ${missingCustomers.length}`);
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log('NEXT STEPS:');
    console.log('1. Open the Excel file');
    console.log('2. Review each customer and fill in YOUR DECISION column');
    console.log('3. Save the file');
    console.log('4. Run: node server/scripts/apply-excel-corrections.js');
    console.log('════════════════════════════════════════════════════════════════\n');

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

generateExcelReview();
