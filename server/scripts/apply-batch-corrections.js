/**
 * Apply Batch Corrections to Multiple Budget Files
 * Reads batch-corrections-review.json and applies approved corrections
 */

const fs = require('fs');
const path = require('path');

function applyBatchCorrections() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         APPLYING BATCH CORRECTIONS TO 3 BUDGET FILES          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Load the review file
    const reviewPath = path.join(__dirname, '../../exports/batch-corrections-review.json');

    if (!fs.existsSync(reviewPath)) {
      console.error('❌ Review file not found!');
      console.error('   Run: node server/scripts/batch-process-budgets.js first\n');
      process.exit(1);
    }

    const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));

    console.log(`📄 Processing ${review.files.length} files...\n`);

    let totalFilesProcessed = 0;
    let totalCorrectionsApplied = 0;

    // Process each file
    for (const fileData of review.files) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log(`📄 ${fileData.file}`);
      console.log('════════════════════════════════════════════════════════════════\n');

      if (!fs.existsSync(fileData.filePath)) {
        console.log(`⚠️  File not found, skipping...\n`);
        continue;
      }

      // Read HTML
      let html = fs.readFileSync(fileData.filePath, 'utf8');

      // Create backup
      const backupPath = fileData.filePath.replace('.html', `_backup_${Date.now()}.html`);
      fs.writeFileSync(backupPath, html);
      console.log(`💾 Backup: ${path.basename(backupPath)}\n`);

      if (fileData.corrections.length === 0) {
        console.log(`✅ No corrections needed (all customers match or are prospects)\n`);
        continue;
      }

      console.log(`🔧 Applying ${fileData.corrections.length} corrections:\n`);

      let fileCorrectionsApplied = 0;

      for (const correction of fileData.corrections) {
        const oldName = correction.html;
        const newName = correction.db;

        if (oldName === newName) continue;

        // Escape special regex characters
        const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Pattern 1: Fix <td> display cells
        const tdPattern = new RegExp(`(<td[^>]*>)${escapedOld}(</td>)`, 'g');

        // Pattern 2: Fix data-customer attributes
        const dataPattern = new RegExp(`data-customer="${escapedOld}"`, 'g');

        const beforeTd = (html.match(tdPattern) || []).length;
        const beforeData = (html.match(dataPattern) || []).length;

        if (beforeTd === 0 && beforeData === 0) {
          console.log(`   ⏭️  Skipped: "${oldName}" (not found)`);
          continue;
        }

        // Apply corrections
        html = html.replace(tdPattern, `$1${newName}$2`);
        html = html.replace(dataPattern, `data-customer="${newName}"`);

        console.log(`   ✓ "${oldName}"`);
        console.log(`     → "${newName}"`);
        console.log(`     (${beforeTd} display + ${beforeData} data attrs)\n`);

        fileCorrectionsApplied++;
      }

      // Save corrected HTML
      fs.writeFileSync(fileData.filePath, html);

      console.log(`✅ Applied ${fileCorrectionsApplied} corrections to ${fileData.file}`);
      console.log(`🆕 Kept ${fileData.prospects.length} prospects as-is\n`);

      totalFilesProcessed++;
      totalCorrectionsApplied += fileCorrectionsApplied;
    }

    // Final summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ BATCH CORRECTIONS COMPLETED!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`📄 Files Processed:        ${totalFilesProcessed}`);
    console.log(`🔧 Total Corrections:      ${totalCorrectionsApplied}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    console.log('NEXT STEPS:');
    console.log('1. ✅ Review the updated HTML files');
    console.log('2. 🔍 Verify corrections by opening files in browser');
    console.log('3. ✅ All files are now standardized with database names\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

applyBatchCorrections();
