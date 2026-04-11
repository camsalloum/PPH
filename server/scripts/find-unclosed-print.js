// Find the unclosed @media print block
const fs = require('fs');
const cssPath = require('path').join(__dirname, '../../build/assets/index-BDy8O8Q7.css');
const text = fs.readFileSync(cssPath, 'utf8');

// Find @media print at 178982 and trace the brace depth
const pos = 178982;
let depth = 0;
let maxDepth = 0;

// Show context around the start
console.log('=== @media print block starting at 178982 ===');
console.log('First 200 chars:', text.substring(pos, pos + 200));
console.log('');

// Track depth through the block
for (let i = pos; i < Math.min(pos + 50000, text.length); i++) {
  if (text[i] === '{') { 
    depth++; 
    if (depth > maxDepth) maxDepth = depth;
  }
  if (text[i] === '}') { depth--; }
  if (depth === 0 && i > pos + 10) {
    console.log('Block closes at byte:', i);
    console.log('Context:', text.substring(i - 20, i + 50));
    break;
  }
}

if (depth !== 0) {
  console.log('UNCLOSED! Depth still:', depth, 'after 50000 bytes');
  console.log('Max depth reached:', maxDepth);
  
  // Search further
  for (let i = pos + 50000; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) {
      console.log('Finally closes at byte:', i, '(', i - pos, 'bytes later)');
      console.log('Context:', text.substring(i - 20, i + 50));
      break;
    }
  }
  if (depth !== 0) {
    console.log('NEVER CLOSES! Remaining depth:', depth);
  }
}
