/**
 * Apply Final Corrections to Christopher's Budget HTML
 * Based on Column E "YES" decisions + manual adjustments
 */

const fs = require('fs');
const path = require('path');

function applyFinalCorrections() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║       APPLYING FINAL CORRECTIONS TO CHRISTOPHER BUDGET         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Read the JSON summary file
    const summaryPath = path.join(__dirname, '../../exports/christopher-decisions-summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

    // Read HTML file
    const htmlPath = path.join(__dirname, '../../HTML Budget 2026 sales reps export and import/final 2026/final/Budget Planning - FP - Christopher Dela Cruz - 2026 Draft.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    console.log(`📄 HTML File: ${path.basename(htmlPath)}`);
    console.log(`📊 Total Replacements from YES: ${summary.yesReplacements.length}`);

    // Additional manual corrections
    const manualCorrections = [
      {
        html: 'AJMAL PERFUMES',
        corrected: 'Ajmal Perfumes Center (L.L.C.)',
        reason: 'Manual match - Ajmal Perfumes Center'
      }
    ];

    // Combine all corrections
    const allCorrections = [
      ...summary.yesReplacements.map(r => ({
        html: r.htmlName,
        corrected: r.dbMatch,
        sales: r.sales
      })),
      ...manualCorrections
    ];

    console.log(`✅ Total Corrections to Apply: ${allCorrections.length}\n`);

    // Create backup
    const backupPath = htmlPath.replace('.html', `_backup_${Date.now()}.html`);
    fs.writeFileSync(backupPath, htmlContent);
    console.log(`💾 Backup created: ${path.basename(backupPath)}\n`);

    // Apply corrections
    console.log('🔧 APPLYING CORRECTIONS:\n');
    console.log('════════════════════════════════════════════════════════════════\n');

    let correctionCount = 0;
    const applied = [];
    const skipped = [];

    for (const correction of allCorrections) {
      const htmlName = correction.html;
      const correctedName = correction.corrected;

      if (htmlName === correctedName) {
        skipped.push({ name: htmlName, reason: 'No change needed (same name)' });
        continue;
      }

      // Escape special regex characters
      const escapedHtmlName = htmlName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`data-customer="${escapedHtmlName}"`, 'g');

      const beforeCount = (htmlContent.match(regex) || []).length;

      if (beforeCount === 0) {
        skipped.push({ name: htmlName, reason: 'Not found in HTML' });
        continue;
      }

      // Replace
      htmlContent = htmlContent.replace(regex, `data-customer="${correctedName}"`);

      const salesStr = correction.sales ? `$${correction.sales.toLocaleString()}` : '';
      console.log(`${(correctionCount + 1).toString().padStart(2)}. ✓ "${htmlName}"`);
      console.log(`     → "${correctedName}"`);
      if (salesStr) console.log(`     💰 ${salesStr}`);
      console.log(`     (${beforeCount} occurrences)\n`);

      applied.push({
        html: htmlName,
        corrected: correctedName,
        occurrences: beforeCount
      });
      correctionCount++;
    }

    // Save corrected HTML
    fs.writeFileSync(htmlPath, htmlContent);

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ CORRECTIONS APPLIED SUCCESSFULLY!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`📄 File: ${htmlPath}`);
    console.log(`📝 Applied: ${correctionCount} corrections`);
    console.log(`⏭️  Skipped: ${skipped.length} (no change or not found)`);
    console.log('════════════════════════════════════════════════════════════════\n');

    // Show skipped
    if (skipped.length > 0) {
      console.log('⏭️  SKIPPED ITEMS:\n');
      skipped.forEach((s, i) => {
        console.log(`   ${i + 1}. "${s.name}" - ${s.reason}`);
      });
      console.log('');
    }

    // Show prospects (remaining customers)
    const prospects = summary.remaining.filter(r => {
      // Exclude AJMAL PERFUMES since we're correcting it
      return r.htmlName !== 'AJMAL PERFUMES';
    });

    if (prospects.length > 0) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('🆕 PROSPECTS (Kept as-is - New 2026 customers):');
      console.log('════════════════════════════════════════════════════════════════\n');
      prospects.forEach((p, i) => {
        console.log(`   ${(i + 1).toString().padStart(2)}. "${p.htmlName}"`);
      });
      console.log(`\n   Total: ${prospects.length} prospects\n`);
    }

    // Summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📊 FINAL SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Total Customers in HTML:     65`);
    console.log(`✅ Corrected:                ${correctionCount}`);
    console.log(`🆕 Prospects (unchanged):    ${prospects.length}`);
    console.log(`⏭️  Skipped (no change):      ${skipped.length}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    console.log('NEXT STEPS:');
    console.log('1. ✅ HTML file has been updated');
    console.log('2. 📄 Review the corrected HTML file');
    console.log('3. 🔍 Run comparison to verify:');
    console.log('   node server/scripts/compare-christopher-budget.js');
    console.log('4. ➕ Add missing customers from database (54 customers)');
    console.log('5. 📧 Share with Christopher for final review\n');

    // Save detailed log
    const logPath = path.join(__dirname, '../../exports/christopher-corrections-log.json');
    fs.writeFileSync(logPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalCorrections: correctionCount,
      applied: applied,
      skipped: skipped,
      prospects: prospects.map(p => p.htmlName),
      backupFile: path.basename(backupPath)
    }, null, 2));

    console.log(`💾 Detailed log saved to: christopher-corrections-log.json\n`);

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

applyFinalCorrections();
