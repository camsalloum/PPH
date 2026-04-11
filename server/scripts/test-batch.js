console.log('Script starting...');
console.log('Current directory:', process.cwd());
console.log('Node version:', process.version);

const fs = require('fs');
const path = require('path');

const filePath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final/FINAL_FP_Riad___Nidal_2026_20260118_0712.html';
console.log('\nChecking file:', filePath);
console.log('Exists:', fs.existsSync(filePath));

if (fs.existsSync(filePath)) {
  const content = fs.readFileSync(filePath, 'utf8');
  console.log('File size:', content.length, 'characters');

  const customerRegex = /data-customer="([^"]+)"/g;
  const customers = new Set();
  let match;

  while ((match = customerRegex.exec(content)) !== null) {
    customers.add(match[1]);
  }

  console.log('Unique customers found:', customers.size);
  console.log('\nFirst 5 customers:');
  Array.from(customers).slice(0, 5).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c}`);
  });
}

console.log('\nScript complete!');
