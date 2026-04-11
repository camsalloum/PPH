// Find where the brace depth goes from 0 to 1 and never comes back before kpi-cards
const fs = require('fs');
const text = fs.readFileSync(require('path').join(__dirname, '../../build/assets/index-BDy8O8Q7.css'), 'utf8');

const KPI_POS = text.indexOf('.kpi-cards{display:grid');
let depth = 0;
let lastZeroPos = 0;

for (let i = 0; i < KPI_POS; i++) {
  if (text[i] === '{') depth++;
  if (text[i] === '}') depth--;
  if (depth === 0) lastZeroPos = i;
}

console.log('Last position where depth was 0:', lastZeroPos);
console.log('kpi-cards at:', KPI_POS);
console.log('Gap:', KPI_POS - lastZeroPos, 'bytes');
console.log('');
console.log('Content at lastZeroPos (the unclosed block starts right after):');
console.log(text.substring(lastZeroPos, lastZeroPos + 300));
