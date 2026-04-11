/**
 * Apply Excel Corrections to Christopher's Budget HTML
 *
 * Reads the reviewed Excel file and applies your decisions
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function applyExcelCorrections() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║      APPLYING EXCEL CORRECTIONS TO CHRISTOPHER BUDGET          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Read Excel file
    const excelPath = path.join(__dirname, '../../exports/Christopher_Budget_Review.xlsx');

    if (!fs.existsSync(excelPath)) {
      console.error('❌ Excel file not found!');
      console.error(`   Expected: ${excelPath}`);
      console.error('\n   Please run generate-christopher-review.js first\n');
      process.exit(1);
    }

    console.log(`📄 Reading Excel file: ${excelPath}\n`);

    const workbook = XLSX.readFile(excelPath);
    const worksheet = workbook.Sheets['Customer Review'];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Found ${data.length} customer reviews\n`);

    // Read HTML file
    const htmlPath = path.join(__dirname, '../../HTML Budget 2026 sales reps export and import/final 2026/final/Budget Planning - FP - Christopher Dela Cruz - 2026 Draft.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Process each row
    const corrections = [];
    const prospects = [];
    const rejections = [];
    const errors = [];

    for (const row of data) {
      const decision = (row['>> YOUR DECISION <<'] || '').toUpperCase().trim();
      const htmlName = row['HTML Customer Name'];
      const dbMatch = row['DB Best Match'];
      const alt1 = row['Alternative 1'];
      const alt2 = row['Alternative 2'];
      const alt3 = row['Alternative 3'];
      const customName = row['Corrected Name / Action'];

      if (!decision) {
        // Skip rows without decision
        continue;
      }

      let correctedName = null;
      let action = null;

      switch (decision) {
        case 'APPROVE':
          correctedName = dbMatch;
          action = 'APPROVE';
          corrections.push({ html: htmlName, corrected: correctedName });
          break;

        case 'ALT1':
          if (alt1) {
            correctedName = alt1;
            action = 'ALT1';
            corrections.push({ html: htmlName, corrected: correctedName });
          } else {
            errors.push({ html: htmlName, error: 'ALT1 selected but no alternative 1 available' });
          }
          break;

        case 'ALT2':
          if (alt2) {
            correctedName = alt2;
            action = 'ALT2';
            corrections.push({ html: htmlName, corrected: correctedName });
          } else {
            errors.push({ html: htmlName, error: 'ALT2 selected but no alternative 2 available' });
          }
          break;

        case 'ALT3':
          if (alt3) {
            correctedName = alt3;
            action = 'ALT3';
            corrections.push({ html: htmlName, corrected: correctedName });
          } else {
            errors.push({ html: htmlName, error: 'ALT3 selected but no alternative 3 available' });
          }
          break;

        case 'CUSTOM':
          if (customName && customName.trim()) {
            correctedName = customName.trim();
            action = 'CUSTOM';
            corrections.push({ html: htmlName, corrected: correctedName });
          } else {
            errors.push({ html: htmlName, error: 'CUSTOM selected but no custom name provided' });
          }
          break;

        case 'PROSPECT':
          prospects.push({ html: htmlName });
          action = 'PROSPECT';
          break;

        case 'REJECT':
          rejections.push({ html: htmlName });
          action = 'REJECT';
          break;

        default:
          errors.push({ html: htmlName, error: `Unknown decision: ${decision}` });
      }
    }

    // Display summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📊 REVIEW SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Total Reviewed:       ${data.filter(r => r['>> YOUR DECISION <<']).length}`);
    console.log(`✅ Corrections:       ${corrections.length}`);
    console.log(`🆕 Prospects:         ${prospects.length}`);
    console.log(`❌ Rejections:        ${rejections.length}`);
    console.log(`⚠️  Errors:            ${errors.length}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    if (errors.length > 0) {
      console.log('⚠️  ERRORS FOUND:\n');
      errors.forEach((e, i) => {
        console.log(`${i + 1}. "${e.html}": ${e.error}`);
      });
      console.log('\n');
    }

    if (corrections.length === 0) {
      console.log('ℹ️  No corrections to apply.\n');
      process.exit(0);
    }

    // Apply corrections to HTML
    console.log('🔧 APPLYING CORRECTIONS:\n');

    let correctionCount = 0;
    let backupCreated = false;

    for (const correction of corrections) {
      const htmlName = correction.html;
      const correctedName = correction.corrected;

      if (htmlName === correctedName) {
        console.log(`⏭️  Skipping "${htmlName}" (no change)`);
        continue;
      }

      // Create backup on first correction
      if (!backupCreated) {
        const backupPath = htmlPath.replace('.html', `_backup_${Date.now()}.html`);
        fs.writeFileSync(backupPath, htmlContent);
        console.log(`💾 Backup created: ${path.basename(backupPath)}\n`);
        backupCreated = true;
      }

      // Replace all occurrences
      const regex = new RegExp(
        `data-customer="${htmlName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
        'g'
      );
      const replacement = `data-customer="${correctedName.replace(/\$/g, '$$$$')}"`;

      const beforeCount = (htmlContent.match(regex) || []).length;
      htmlContent = htmlContent.replace(regex, replacement);

      if (beforeCount > 0) {
        console.log(`✓ "${htmlName}"`);
        console.log(`  → "${correctedName}" (${beforeCount} occurrences)`);
        correctionCount++;
      } else {
        console.log(`⚠️  "${htmlName}" not found in HTML`);
      }
    }

    if (correctionCount > 0) {
      // Save corrected HTML
      fs.writeFileSync(htmlPath, htmlContent);

      console.log('\n════════════════════════════════════════════════════════════════');
      console.log('✅ CORRECTIONS APPLIED SUCCESSFULLY!');
      console.log('════════════════════════════════════════════════════════════════');
      console.log(`📄 File: ${htmlPath}`);
      console.log(`📝 Applied: ${correctionCount} corrections`);
      console.log('════════════════════════════════════════════════════════════════\n');

      // Show prospects
      if (prospects.length > 0) {
        console.log('🆕 PROSPECTS (kept as-is, new 2026 customers):\n');
        prospects.forEach((p, i) => {
          console.log(`   ${i + 1}. "${p.html}"`);
        });
        console.log('');
      }

      // Show rejections
      if (rejections.length > 0) {
        console.log('❌ REJECTIONS (kept as-is):\n');
        rejections.forEach((r, i) => {
          console.log(`   ${i + 1}. "${r.html}"`);
        });
        console.log('');
      }

      console.log('NEXT STEPS:');
      console.log('1. Open the HTML file to verify changes');
      console.log('2. Review the "Missing Customers" sheet in Excel');
      console.log('3. Add missing customers to budget if needed');
      console.log('4. Run comparison script to verify: node server/scripts/compare-christopher-budget.js\n');

    } else {
      console.log('\nℹ️  No corrections were applied (all names were identical).\n');
    }

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

applyExcelCorrections();
