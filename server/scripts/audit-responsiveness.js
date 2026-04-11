/**
 * CSS Responsiveness Audit Script
 * Checks all CSS files for common responsiveness issues.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.resolve(__dirname, '../../src');
const cssFiles = execSync(`dir /s /b "${srcDir}\\*.css"`, { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).map(f => f.trim());

const results = [];

for (const file of cssFiles) {
  const rel = path.relative(srcDir, file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const issues = [];
  
  // 1. Check for media queries
  const mediaQueries = content.match(/@media\s*\([^)]+\)/g) || [];
  const has768 = mediaQueries.some(m => m.includes('768'));
  const has1024 = mediaQueries.some(m => m.includes('1024'));
  const has480 = mediaQueries.some(m => m.includes('480'));
  const hasMobile = has768 || has480;
  const hasTablet = has1024;
  
  // 2. Check for fixed pixel widths (potential overflow)
  const fixedWidths = [];
  lines.forEach((line, i) => {
    // Match width: NNNpx where NNN > 400 (likely to overflow on mobile)
    const wMatch = line.match(/(?:^|[^-])width\s*:\s*(\d+)px/);
    if (wMatch && parseInt(wMatch[1]) > 400 && !line.includes('max-width') && !line.includes('min-width')) {
      fixedWidths.push({ line: i + 1, value: wMatch[1] + 'px', text: line.trim() });
    }
    // Match min-width > 500px outside media queries
    const minW = line.match(/min-width\s*:\s*(\d+)px/);
    if (minW && parseInt(minW[1]) > 500 && !line.includes('@media')) {
      fixedWidths.push({ line: i + 1, value: 'min-width:' + minW[1] + 'px', text: line.trim() });
    }
  });
  
  // 3. Check for overflow-x handling on tables
  const hasTables = content.includes('table') || content.includes('Table');
  const hasOverflowX = content.includes('overflow-x') || content.includes('overflow: auto') || content.includes('overflow: scroll');
  
  // 4. Check for font sizes > 24px without responsive scaling
  const largeFonts = [];
  lines.forEach((line, i) => {
    const fMatch = line.match(/font-size\s*:\s*(\d+)px/);
    if (fMatch && parseInt(fMatch[1]) > 24) {
      largeFonts.push({ line: i + 1, value: fMatch[1] + 'px' });
    }
  });
  
  // 5. Check for flex-wrap: nowrap (potential overflow)
  const noWrap = content.includes('flex-wrap: nowrap') || content.includes('flex-wrap:nowrap');
  
  // 6. Check for position: fixed/absolute without responsive handling
  const hasFixed = content.includes('position: fixed') || content.includes('position:fixed');
  
  // 7. File size (complexity indicator)
  const lineCount = lines.length;
  
  // Build issues
  if (lineCount > 50 && !hasMobile) {
    issues.push({ severity: 'HIGH', issue: 'No mobile breakpoint (768px or 480px)' });
  }
  if (lineCount > 100 && !hasTablet && !hasMobile) {
    issues.push({ severity: 'MEDIUM', issue: 'No responsive breakpoints at all' });
  }
  if (fixedWidths.length > 0) {
    issues.push({ severity: 'MEDIUM', issue: `${fixedWidths.length} fixed widths >400px: ${fixedWidths.slice(0, 3).map(f => f.value).join(', ')}` });
  }
  if (hasTables && !hasOverflowX) {
    issues.push({ severity: 'HIGH', issue: 'Table content without overflow-x scroll' });
  }
  if (largeFonts.length > 0 && !hasMobile) {
    issues.push({ severity: 'LOW', issue: `${largeFonts.length} large fonts (>24px) without mobile scaling` });
  }
  if (noWrap && !hasMobile) {
    issues.push({ severity: 'MEDIUM', issue: 'flex-wrap: nowrap without mobile breakpoint' });
  }
  
  if (issues.length > 0) {
    results.push({
      file: rel,
      lines: lineCount,
      mediaQueries: mediaQueries.length,
      issues
    });
  }
}

// Sort by severity
const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
results.sort((a, b) => {
  const aMax = Math.min(...a.issues.map(i => severityOrder[i.severity]));
  const bMax = Math.min(...b.issues.map(i => severityOrder[i.severity]));
  return aMax - bMax;
});

console.log(`\n=== CSS RESPONSIVENESS AUDIT ===`);
console.log(`Total CSS files: ${cssFiles.length}`);
console.log(`Files with issues: ${results.length}\n`);

for (const r of results) {
  const highCount = r.issues.filter(i => i.severity === 'HIGH').length;
  const medCount = r.issues.filter(i => i.severity === 'MEDIUM').length;
  const lowCount = r.issues.filter(i => i.severity === 'LOW').length;
  const tag = highCount > 0 ? '🔴' : medCount > 0 ? '🟡' : '🟢';
  console.log(`${tag} ${r.file} (${r.lines} lines, ${r.mediaQueries} media queries)`);
  for (const issue of r.issues) {
    const icon = issue.severity === 'HIGH' ? '  ❌' : issue.severity === 'MEDIUM' ? '  ⚠️' : '  ℹ️';
    console.log(`${icon} [${issue.severity}] ${issue.issue}`);
  }
  console.log('');
}

// Summary
const highFiles = results.filter(r => r.issues.some(i => i.severity === 'HIGH'));
const medFiles = results.filter(r => r.issues.some(i => i.severity === 'MEDIUM') && !r.issues.some(i => i.severity === 'HIGH'));
console.log(`\n=== SUMMARY ===`);
console.log(`🔴 HIGH priority: ${highFiles.length} files`);
console.log(`🟡 MEDIUM priority: ${medFiles.length} files`);
console.log(`Total files needing attention: ${results.length} / ${cssFiles.length}`);
