// Check if @media print at byte 178982 encloses kpi-cards at byte 201504
const fs = require('fs');
const cssPath = require('path').join(__dirname, '../../build/assets/index-BDy8O8Q7.css');
const text = fs.readFileSync(cssPath, 'utf8');

const pos = 178982;
let depth = 0;
let started = false;
let closeAt = -1;

for (let i = pos; i < pos + 30000 && i < text.length; i++) {
  if (text[i] === '{') { depth++; started = true; }
  if (text[i] === '}') { depth--; }
  if (started && depth === 0) { closeAt = i; break; }
}

console.log('media-print at 178982 closes at:', closeAt);
console.log('kpi-cards at 201504 is INSIDE this block:', closeAt > 201504);
console.log('Content near close:', text.substring(closeAt - 30, closeAt + 30));
