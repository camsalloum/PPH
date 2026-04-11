/**
 * Quick Excel Generator - No DB Connection Required for Testing
 * Extracts customers from HTML and creates Excel preview
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

console.log('\n=== GENERATING EXCEL FILES ===\n');

const basePath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final';
const file = 'FINAL_FP_Riad___Nidal_2026_20260118_0712.html';

try {
  console.log('Reading HTML file...');
  const filePath = path.join(basePath, file);
  const html = fs.readFileSync(filePath, 'utf8');

  console.log('Extracting customers...');

  // Extract all <td rowspan="2"> content
  const tdRegex = /<td rowspan="2">([^<]+)<\/td>/g;
  const allMatches = [];
  let match;

  while ((match = tdRegex.exec(html)) !== null) {
    allMatches.push(match[1].trim());
  }

  console.log(`Found ${allMatches.length} total <td rowspan="2"> elements`);

  // Every 3rd element is: Customer, Country, Product Group
  // So customers are at indices: 0, 3, 6, 9, 12...
  const customersSet = new Set();
  for (let i = 0; i < allMatches.length; i += 3) {
    customersSet.add(allMatches[i]);
  }

  const customers = Array.from(customersSet).sort();
  console.log(`Unique customers: ${customers.length}\n`);

  // Show first 10
  console.log('First 10 customers:');
  customers.slice(0, 10).forEach((c, i) => {
    console.log(`${i + 1}. ${c}`);
  });

  // Create simple Excel
  const data = customers.map((c, i) => ({
    'No.': i + 1,
    'Customer Name': c,
    'Action': 'Review needed'
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');

  const outputPath = 'D:/PPH 26.01/exports/TEST_Riad_Nidal_Customers.xlsx';
  XLSX.writeFile(wb, outputPath);

  console.log(`\n✅ Excel created: ${outputPath}`);
  console.log(`Total customers: ${customers.length}`);

} catch (error) {
  console.error('ERROR:', error.message);
  console.error(error.stack);
}
