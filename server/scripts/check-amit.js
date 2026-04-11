const fs = require('fs');
const path = require('path');

const htmlPath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final/Budget Planning - FP - Christopher Dela Cruz - 2026 Draft.html';

console.log('Checking file:', htmlPath);
console.log('Exists:', fs.existsSync(htmlPath));

if (fs.existsSync(htmlPath)) {
  const content = fs.readFileSync(htmlPath, 'utf8');
  console.log('File size:', content.length, 'characters');

  // Check for A M I T
  const amitMatches = content.match(/A M I T[^<]{0,100}/g);
  console.log('\nA M I T occurrences found:', amitMatches ? amitMatches.length : 0);
  if (amitMatches) {
    console.log('\nFirst few matches:');
    amitMatches.slice(0, 3).forEach((m, i) => {
      console.log(`${i + 1}. ${m}`);
    });
  }
}
