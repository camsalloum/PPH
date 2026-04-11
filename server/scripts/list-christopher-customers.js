/**
 * List unique customers from Christopher's HTML file (no database)
 */
const fs = require('fs');
const path = require('path');

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

  console.log('=== UNIQUE CUSTOMERS IN CHRISTOPHER HTML FILE ===');
  console.log('');
  htmlCustomers.forEach((c, i) => {
    console.log((i + 1) + '. "' + c + '"');
  });
  console.log('');
  console.log('Total: ' + htmlCustomers.length + ' customers');

} catch (err) {
  console.error('Error:', err.message);
}
