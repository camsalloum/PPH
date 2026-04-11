/**
 * Verify the built CSS has .kpi-cards at brace depth 0 (not inside @media print).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.resolve(__dirname, '../../build/assets');
const cssFiles = fs.readdirSync(buildDir).filter(f => f.endsWith('.css') && f.startsWith('index-'));

if (cssFiles.length === 0) { console.log('No index CSS found!'); process.exit(1); }

const cssFile = path.join(buildDir, cssFiles[0]);
const content = fs.readFileSync(cssFile, 'utf8');
console.log(`Checking: ${cssFiles[0]} (${content.length} bytes)`);

// Find .kpi-cards{display:grid
const needle = 'kpi-cards{display:grid';
const idx = content.indexOf(needle);
if (idx === -1) { console.log('ERROR: kpi-cards{display:grid not found!'); process.exit(1); }

// Calculate brace depth at that position
const stripped = content.replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length));
let depth = 0;
for (let i = 0; i < idx; i++) {
  if (stripped[i] === '{') depth++;
  if (stripped[i] === '}') depth--;
}

console.log(`kpi-cards{display:grid found at byte ${idx}, brace depth: ${depth}`);
if (depth === 0) {
  console.log('SUCCESS: .kpi-cards is at top level (not inside @media print)');
} else {
  console.log('FAIL: .kpi-cards is nested inside a block (likely @media print)');
  // Find what block it's inside
  let lastOpen = -1;
  let d = 0;
  for (let i = 0; i < idx; i++) {
    if (stripped[i] === '{') { d++; if (d === 1) lastOpen = i; }
    if (stripped[i] === '}') d--;
  }
  if (lastOpen > 0) {
    const context = content.substring(Math.max(0, lastOpen - 50), lastOpen + 1);
    console.log(`Last depth-0 opening brace context: ...${context}`);
  }
}

// Also check total brace balance
let totalDepth = 0;
for (const ch of stripped) {
  if (ch === '{') totalDepth++;
  if (ch === '}') totalDepth--;
}
console.log(`Total CSS brace balance: ${totalDepth}`);
