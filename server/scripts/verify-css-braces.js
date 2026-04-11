/**
 * Quick brace-depth check on all CSS source files.
 * Any file that doesn't end at depth 0 has an unclosed block.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.resolve(__dirname, '../../src');

// Find all CSS files
const cssFiles = execSync(`dir /s /b "${srcDir}\\*.css"`, { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

let issues = 0;
for (const file of cssFiles) {
  const content = fs.readFileSync(file.trim(), 'utf8');
  // Strip comments and strings
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '');
  let depth = 0;
  for (const ch of stripped) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  if (depth !== 0) {
    const rel = path.relative(srcDir, file.trim());
    console.log(`UNCLOSED: ${rel} — final brace depth: ${depth}`);
    issues++;
  }
}

if (issues === 0) {
  console.log(`All ${cssFiles.length} CSS files have balanced braces.`);
} else {
  console.log(`\n${issues} file(s) with unbalanced braces!`);
}
