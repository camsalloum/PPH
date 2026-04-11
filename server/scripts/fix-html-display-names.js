/**
 * PROPER HTML Correction - Fix BOTH display names AND data attributes
 */

const fs = require('fs');
const path = require('path');

function properHtmlCorrection() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║    FIXING HTML - BOTH DISPLAY NAMES AND DATA ATTRIBUTES        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Read the corrected HTML
    const htmlPath = path.join(__dirname, '../../HTML Budget 2026 sales reps export and import/final 2026/final/Budget Planning - FP - Christopher Dela Cruz - 2026 Draft.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Read the corrections from the backup to know what was changed
    const summaryPath = path.join(__dirname, '../../exports/christopher-decisions-summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

    // Manual corrections
    const manualCorrections = [
      {
        html: 'AJMAL PERFUMES',
        corrected: 'Ajmal Perfumes Center (L.L.C.)'
      }
    ];

    // All corrections
    const allCorrections = [
      ...summary.yesReplacements.map(r => ({
        old: r.htmlName,
        new: r.dbMatch
      })),
      ...manualCorrections.map(m => ({
        old: m.html,
        new: m.corrected
      }))
    ];

    console.log(`📊 Total Corrections: ${allCorrections.length}\n`);

    // Create backup
    const backupPath = htmlPath.replace('.html', `_backup_proper_${Date.now()}.html`);
    fs.writeFileSync(backupPath, html);
    console.log(`💾 Backup: ${path.basename(backupPath)}\n`);

    console.log('🔧 FIXING BOTH DISPLAY AND DATA:\n');

    let fixCount = 0;
    const fixes = [];

    for (const correction of allCorrections) {
      const oldName = correction.old;
      const newName = correction.new;

      if (oldName === newName) continue;

      // Escape regex special characters
      const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Pattern 1: Fix <td> display cells (the visible customer name)
      // Match: <td rowspan="2">OLD NAME</td>
      const tdPattern = new RegExp(
        `(<td[^>]*>)${escapedOld}(</td>)`,
        'g'
      );

      // Pattern 2: Fix data-customer attributes (already done by previous script)
      const dataPattern = new RegExp(
        `data-customer="${escapedOld}"`,
        'g'
      );

      const beforeTdCount = (html.match(tdPattern) || []).length;
      const beforeDataCount = (html.match(dataPattern) || []).length;

      if (beforeTdCount === 0 && beforeDataCount === 0) {
        console.log(`⏭️  Skipping "${oldName}" (not found)`);
        continue;
      }

      // Apply both fixes
      html = html.replace(tdPattern, `$1${newName}$2`);
      html = html.replace(dataPattern, `data-customer="${newName}"`);

      const afterTdCount = (html.match(new RegExp(`(<td[^>]*>)${newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(</td>)`, 'g')) || []).length;
      const afterDataCount = (html.match(new RegExp(`data-customer="${newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || []).length;

      console.log(`${(fixCount + 1).toString().padStart(2)}. ✓ "${oldName}"`);
      console.log(`     → "${newName}"`);
      console.log(`     Display cells: ${beforeTdCount} → ${afterTdCount}`);
      console.log(`     Data attrs: ${beforeDataCount} → ${afterDataCount}\n`);

      fixes.push({
        old: oldName,
        new: newName,
        tdFixed: beforeTdCount,
        dataFixed: beforeDataCount
      });

      fixCount++;
    }

    // Save corrected HTML
    fs.writeFileSync(htmlPath, html);

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ PROPER FIX APPLIED!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`📄 File: ${path.basename(htmlPath)}`);
    console.log(`✓ Fixed: ${fixCount} customers`);
    console.log(`✓ Display cells AND data attributes both corrected`);
    console.log('════════════════════════════════════════════════════════════════\n');

    // Verify a specific customer
    console.log('🔍 VERIFICATION - Checking A M I T customer:\n');
    const amitCheck = html.match(/<td[^>]*>A M I T[^<]*<\/td>/g);
    if (amitCheck) {
      console.log('Found in HTML:');
      amitCheck.forEach(match => console.log('  ' + match));
    } else {
      console.log('✅ Old "A M I T...dubai Industrial City" NOT found (good!)');
    }

    const amitNewCheck = html.match(/<td[^>]*>A M I T Beverages Factory L\.L\.[^<]*<\/td>/g);
    if (amitNewCheck) {
      console.log('\n✅ New "A M I T Beverages Factory L.L." found:');
      amitNewCheck.forEach(match => console.log('  ' + match));
    }

    console.log('\n════════════════════════════════════════════════════════════════\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

properHtmlCorrection();
