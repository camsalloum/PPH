/**
 * Script to remove console.log statements from source files
 * Run with: node scripts/remove-console-logs.js
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
let totalRemoved = 0;
let filesChanged = 0;

function removeConsoleLogs(content) {
  // Match console.log statements including multi-line ones
  // This regex handles:
  // - Single line: console.log('text');
  // - Multi-line with template literals
  // - Nested parentheses
  
  let removed = 0;
  
  // Pattern to match console.log with balanced parentheses
  const pattern = /^\s*console\.log\s*\([^)]*(?:\([^)]*\)[^)]*)*\);\s*\r?\n?/gm;
  
  // More aggressive pattern for complex cases
  const lines = content.split('\n');
  const newLines = [];
  let skipUntilSemicolon = false;
  let parenDepth = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if this line starts a console.log
    if (trimmed.startsWith('console.log(') && !skipUntilSemicolon) {
      // Count parentheses to handle multi-line
      parenDepth = 0;
      for (const char of line) {
        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;
      }
      
      if (parenDepth === 0 && line.includes(';')) {
        // Single line console.log - skip it
        removed++;
        continue;
      } else {
        // Multi-line console.log - skip until we find the closing
        skipUntilSemicolon = true;
        removed++;
        continue;
      }
    }
    
    if (skipUntilSemicolon) {
      // Continue counting parentheses
      for (const char of line) {
        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;
      }
      
      if (parenDepth <= 0 && line.includes(';')) {
        skipUntilSemicolon = false;
      }
      continue;
    }
    
    newLines.push(line);
  }
  
  return { content: newLines.join('\n'), removed };
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = removeConsoleLogs(content);
  
  if (result.removed > 0) {
    fs.writeFileSync(filePath, result.content);
    console.log(`✓ ${path.basename(filePath)}: removed ${result.removed} console.log(s)`);
    totalRemoved += result.removed;
    filesChanged++;
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      processFile(filePath);
    }
  }
}

console.log('🧹 Removing console.log statements from src/...\n');
walkDir(srcDir);
console.log(`\n✅ Done! Removed ${totalRemoved} console.log(s) from ${filesChanged} file(s)`);
