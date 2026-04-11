// Find ALL @media blocks and check which one contains byte 201504 (kpi-cards)
const fs = require('fs');
const text = fs.readFileSync(require('path').join(__dirname, '../../build/assets/index-BDy8O8Q7.css'), 'utf8');

const KPI_POS = text.indexOf('.kpi-cards{display:grid');
console.log('kpi-cards position:', KPI_POS);

// Find all @media blocks
const mediaRegex = /@media[^{]*\{/g;
let match;
while ((match = mediaRegex.exec(text)) !== null) {
  const start = match.index;
  // Find closing brace
  let depth = 0;
  let closeAt = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) { closeAt = i; break; }
  }
  
  // Check if kpi-cards is inside this block
  if (start < KPI_POS && closeAt > KPI_POS) {
    console.log(`\n*** FOUND: kpi-cards is INSIDE @media block ***`);
    console.log(`  Block: ${text.substring(start, start + 80)}`);
    console.log(`  Starts: ${start}, Closes: ${closeAt}`);
    console.log(`  Block size: ${closeAt - start} bytes`);
    
    // Find the source CSS - look backwards for a recognizable pattern
    const before = text.substring(Math.max(0, start - 200), start);
    console.log(`  Content before: ...${before.substring(before.length - 100)}`);
  }
}

// Also check: what's the depth at position 201504?
let depthAtKpi = 0;
for (let i = 0; i < KPI_POS; i++) {
  if (text[i] === '{') depthAtKpi++;
  if (text[i] === '}') depthAtKpi--;
}
console.log('\nBrace depth at kpi-cards position:', depthAtKpi);
console.log('(0 = top level, 1+ = inside a block)');
