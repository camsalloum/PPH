/**
 * Analyze Narek customers - simplified
 */
const fs = require('fs');
const path = require('path');

try {
  // Read HTML file
  const htmlPath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/FINAL_FP_Narek_Koroukian_2026_20260112_1807.html';
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Extract budget data JSON
  const match = html.match(/const budgetData = (\[[\s\S]*?\]);/);
  if (!match) {
    console.log('Could not find budgetData in HTML');
    process.exit(1);
  }

  const budgetData = JSON.parse(match[1]);

  // Get unique customers from HTML file
  const htmlCustomers = [...new Set(budgetData.map(r => r.customer))].sort();
  console.log('=== UNIQUE CUSTOMERS IN NAREK HTML FILE ===');
  console.log('');
  htmlCustomers.forEach((c, i) => {
    console.log((i + 1) + '. "' + c + '"');
  });
  console.log('');
  console.log('Total: ' + htmlCustomers.length + ' customers');

} catch (err) {
  console.error('Error:', err.message);
}
