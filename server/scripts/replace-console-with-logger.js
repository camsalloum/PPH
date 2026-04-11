/**
 * Script to replace console.log/error with logger calls
 * Usage: node scripts/replace-console-with-logger.js
 */

const fs = require('fs');
const path = require('path');

// Directories to process
const dirsToProcess = [
  'routes',
  'services',
  'database',
  'middleware'
];

// Files to skip (test scripts and utilities)
const skipFiles = [
  'check-', 'test-', 'verify-', 'diagnose-', 'temp-',
  'create_', 'backup-', 'update-admin'
];

function shouldProcessFile(filePath) {
  const filename = path.basename(filePath);
  
  // Skip if it's in the skip list
  if (skipFiles.some(skip => filename.startsWith(skip))) {
    return false;
  }
  
  // Only process .js files
  return filename.endsWith('.js');
}

function replaceConsoleWithLogger(content, filePath) {
  let modified = false;
  let newContent = content;
  
  // Check if logger is already imported
  const hasLoggerImport = /require\(['"].*logger['"]\)/.test(content) || 
                          /from ['"].*logger['"]/.test(content);
  
  // If no logger import, add it after the first require or at the top
  if (!hasLoggerImport) {
    const firstRequire = content.search(/^const .* = require\(/m);
    if (firstRequire !== -1) {
      const insertPos = content.indexOf('\n', firstRequire) + 1;
      newContent = content.slice(0, insertPos) + 
                   `const logger = require('../utils/logger');\n` + 
                   content.slice(insertPos);
      modified = true;
    }
  }
  
  // Replace console.log patterns
  const logReplacements = [
    // console.log('message', data) -> logger.info('message', data)
    [/console\.log\(/g, 'logger.info('],
    
    // console.error('message', error) -> logger.error('message', error)
    [/console\.error\(/g, 'logger.error('],
    
    // console.warn('message') -> logger.warn('message')
    [/console\.warn\(/g, 'logger.warn('],
    
    // console.debug('message') -> logger.debug('message')
    [/console\.debug\(/g, 'logger.debug(']
  ];
  
  logReplacements.forEach(([pattern, replacement]) => {
    if (pattern.test(newContent)) {
      newContent = newContent.replace(pattern, replacement);
      modified = true;
    }
  });
  
  return { content: newContent, modified };
}

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  let processed = 0;
  let modified = 0;
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      const result = processDirectory(filePath);
      processed += result.processed;
      modified += result.modified;
    } else if (shouldProcessFile(filePath)) {
      processed++;
      const content = fs.readFileSync(filePath, 'utf8');
      const result = replaceConsoleWithLogger(content, filePath);
      
      if (result.modified) {
        fs.writeFileSync(filePath, result.content, 'utf8');
        console.log(`✅ Modified: ${filePath}`);
        modified++;
      }
    }
  });
  
  return { processed, modified };
}

// Main execution
console.log('🔄 Starting console.log replacement with logger...\n');

let totalProcessed = 0;
let totalModified = 0;

dirsToProcess.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (fs.existsSync(dirPath)) {
    console.log(`\n📁 Processing ${dir}/...`);
    const result = processDirectory(dirPath);
    totalProcessed += result.processed;
    totalModified += result.modified;
    console.log(`   Processed: ${result.processed}, Modified: ${result.modified}`);
  }
});

console.log('\n' + '='.repeat(50));
console.log(`✅ Complete! Processed ${totalProcessed} files, modified ${totalModified} files`);
console.log('='.repeat(50));
