/**
 * Generate Excel Review Files for 3 Remaining Budget Files
 * Creates Excel files with customer lists, match scores, and decision columns
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

// Extract customers from HTML
function extractCustomersFromHtml(htmlContent) {
  const customersSet = new Set();

  // Try method 1: data-customer attributes (Christopher's format)
  const dataCustomerRegex = /data-customer="([^"]+)"/g;
  let match;
  while ((match = dataCustomerRegex.exec(htmlContent)) !== null) {
    customersSet.add(match[1]);
  }

  // If no customers found, try method 2: <td rowspan="2"> table cells (other files)
  if (customersSet.size === 0) {
    const tdRegex = /<td rowspan="2">([^<]+)<\/td>/g;
    while ((match = tdRegex.exec(htmlContent)) !== null) {
      const customerName = match[1].trim();
      // Only add first occurrence (customer name column, not country/product)
      if (customerName && customerName.length > 3) {
        customersSet.add(customerName);
      }
    }
  }

  return Array.from(customersSet).sort();
}

async function generateExcelReviewFiles() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║      GENERATING EXCEL REVIEW FILES FOR 3 BUDGET FILES         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Define files
    const basePath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final';
    const files = [
      {
        name: 'FINAL_FP_Riad___Nidal_2026_20260118_0712.html',
        excelName: 'Riad_Nidal_Customer_Review.xlsx',
        salesReps: ['Riad Al Zier', 'Nidal Hanan']
      },
      {
        name: 'FINAL_FP_Sofiane___Team_2026_20260118_0712.html',
        excelName: 'Sofiane_Team_Customer_Review.xlsx',
        salesReps: ['Sofiane Salah']
      },
      {
        name: 'FINAL_FP_Sojy___Hisham___Direct_Sales_2026_20260118_0712.html',
        excelName: 'Sojy_Hisham_DirectSales_Customer_Review.xlsx',
        salesReps: ['Sojy Jose Ukken', 'Mohammed Hisham', 'Direct Sales']
      }
    ];

    // Load unified database
    console.log('📊 Loading unified customer database...\n');
    const dbQuery = `
      SELECT
        customer_id,
        display_name,
        normalized_name,
        primary_sales_rep_name,
        total_amount_all_time
      FROM fp_customer_unified
      WHERE is_active = TRUE
        AND is_merged = FALSE
      ORDER BY display_name;
    `;

    const dbResult = await pool.query(dbQuery);
    const allDbCustomers = dbResult.rows;
    console.log(`   Found ${allDbCustomers.length} customers in database\n`);

    // Process each file
    for (const file of files) {
      console.log(`📄 Processing: ${file.name}`);

      const filePath = path.join(basePath, file.name);

      if (!fs.existsSync(filePath)) {
        console.log(`   ⚠️  File not found, skipping...\n`);
        continue;
      }

      const htmlContent = fs.readFileSync(filePath, 'utf8');
      const htmlCustomers = extractCustomersFromHtml(htmlContent);

      console.log(`   Found ${htmlCustomers.length} unique customers\n`);

      // Analyze each customer
      const reviewData = [];

      for (let i = 0; i < htmlCustomers.length; i++) {
        const htmlCust = htmlCustomers[i];
        const normalized = normalizeCustomerName(htmlCust);
        let bestMatch = null;
        let bestScore = 0;
        let bestCustomer = null;
        let alt1 = null, alt2 = null, alt3 = null;
        let alt1Score = 0, alt2Score = 0, alt3Score = 0;

        for (const dbCust of allDbCustomers) {
          const dbNormalized = normalizeCustomerName(dbCust.display_name);
          const score = similarity(normalized, dbNormalized);

          if (score > bestScore) {
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

        const isTargetSalesRep = bestCustomer && file.salesReps.includes(bestCustomer.primary_sales_rep_name);
        const amount = bestCustomer?.total_amount_all_time || 0;
        const rep = bestCustomer?.primary_sales_rep_name || '';

        reviewData.push({
          'No.': i + 1,
          'HTML Customer Name': htmlCust,
          'Match Score %': Math.round(bestScore * 10) / 10,
          'DB Best Match': bestMatch,
          'Is Target Sales Rep': isTargetSalesRep ? 'YES' : 'No',
          'Sales Rep': rep,
          'Total Sales ($)': Math.round(amount),
          'Alternative 1': alt1 || '',
          'Alt1 Score %': alt1Score ? Math.round(alt1Score * 10) / 10 : '',
          'Alternative 2': alt2 || '',
          'Alt2 Score %': alt2Score ? Math.round(alt2Score * 10) / 10 : '',
          'Alternative 3': alt3 || '',
          'Alt3 Score %': alt3Score ? Math.round(alt3Score * 10) / 10 : '',
          '>> YOUR DECISION <<': '',
          'Notes': ''
        });
      }

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(reviewData);
      ws['!cols'] = [
        { wch: 5 },   // No.
        { wch: 45 },  // HTML Customer Name
        { wch: 12 },  // Match Score
        { wch: 45 },  // DB Best Match
        { wch: 18 },  // Is Target Sales Rep
        { wch: 25 },  // Sales Rep
        { wch: 15 },  // Total Sales
        { wch: 40 },  // Alternative 1
        { wch: 12 },  // Alt1 Score
        { wch: 40 },  // Alternative 2
        { wch: 12 },  // Alt2 Score
        { wch: 40 },  // Alternative 3
        { wch: 12 },  // Alt3 Score
        { wch: 20 },  // YOUR DECISION
        { wch: 30 }   // Notes
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Customer Review');

      // Add instructions
      const instructions = [
        [`${file.name.split('_')[2]} - CUSTOMER REVIEW INSTRUCTIONS`],
        [''],
        ['HOW TO FILL:'],
        ['1. Review each customer in "Customer Review" sheet'],
        ['2. In ">> YOUR DECISION <<" column, enter:'],
        ['   • YES      - Approve correction (use DB Best Match)'],
        ['   • NO       - Reject (keep as prospect)'],
        ['   • ALT1/2/3 - Use alternative match'],
        [''],
        ['TIPS:'],
        ['• Focus on "Is Target Sales Rep = YES" first'],
        ['• High scores (>80%) are usually correct'],
        ['• Low scores (<60%) might be new prospects'],
        [''],
        ['FILE INFO:'],
        ['Sales Reps: ' + file.salesReps.join(', ')],
        ['Total Customers: ' + htmlCustomers.length],
        ['Generated: ' + new Date().toISOString()]
      ];

      const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
      wsInstructions['!cols'] = [{ wch: 80 }];
      XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

      // Save Excel file
      const excelPath = path.join(__dirname, '../../exports', file.excelName);
      XLSX.writeFile(wb, excelPath);

      console.log(`   ✅ Created: ${file.excelName}`);
      console.log(`   📊 Customers: ${htmlCustomers.length}\n`);
    }

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ ALL EXCEL FILES GENERATED!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📁 Location: D:\\PPH 26.01\\exports\\');
    console.log('');
    console.log('Files created:');
    files.forEach(f => console.log(`   📄 ${f.excelName}`));
    console.log('');
    console.log('NEXT STEPS:');
    console.log('1. Open each Excel file');
    console.log('2. Fill ">> YOUR DECISION <<" column with YES/NO/ALT1/ALT2/ALT3');
    console.log('3. Save the files');
    console.log('4. Run: node server/scripts/apply-batch-from-excel.js');
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

generateExcelReviewFiles();
