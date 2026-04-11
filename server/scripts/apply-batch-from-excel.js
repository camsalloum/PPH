/**
 * Apply Batch Corrections from Excel Review Files
 * Reads the 3 Excel files and applies approved decisions
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function applyBatchFromExcel() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     APPLYING CORRECTIONS FROM 3 EXCEL REVIEW FILES            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    const basePath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final';
    const exportsPath = path.join(__dirname, '../../exports');

    const files = [
      {
        htmlName: 'FINAL_FP_Riad___Nidal_2026_20260118_0712.html',
        excelName: 'Riad_Nidal_Customer_Review.xlsx'
      },
      {
        htmlName: 'FINAL_FP_Sofiane___Team_2026_20260118_0712.html',
        excelName: 'Sofiane_Team_Customer_Review.xlsx'
      },
      {
        htmlName: 'FINAL_FP_Sojy___Hisham___Direct_Sales_2026_20260118_0712.html',
        excelName: 'Sojy_Hisham_DirectSales_Customer_Review.xlsx'
      }
    ];

    let totalCorrections = 0;
    let totalProspects = 0;
    let totalFiles = 0;

    for (const file of files) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log(`📄 ${file.htmlName}`);
      console.log('════════════════════════════════════════════════════════════════\n');

      const excelPath = path.join(exportsPath, file.excelName);
      const htmlPath = path.join(basePath, file.htmlName);

      if (!fs.existsSync(excelPath)) {
        console.log(`⚠️  Excel file not found: ${file.excelName}\n`);
        continue;
      }

      if (!fs.existsSync(htmlPath)) {
        console.log(`⚠️  HTML file not found: ${file.htmlName}\n`);
        continue;
      }

      // Read Excel
      const workbook = XLSX.readFile(excelPath);
      const worksheet = workbook.Sheets['Customer Review'];
      const data = XLSX.utils.sheet_to_json(worksheet);

      // Read HTML
      let html = fs.readFileSync(htmlPath, 'utf8');

      // Create backup
      const backupPath = htmlPath.replace('.html', `_backup_${Date.now()}.html`);
      fs.writeFileSync(backupPath, html);
      console.log(`💾 Backup: ${path.basename(backupPath)}\n`);

      // Process decisions
      const corrections = [];
      const prospects = [];

      for (const row of data) {
        const decision = (row['>> YOUR DECISION <<'] || '').toUpperCase().trim();
        const htmlName = row['HTML Customer Name'];
        const dbMatch = row['DB Best Match'];
        const alt1 = row['Alternative 1'];
        const alt2 = row['Alternative 2'];
        const alt3 = row['Alternative 3'];

        if (!decision) continue;

        let correctedName = null;

        switch (decision) {
          case 'YES':
            correctedName = dbMatch;
            break;
          case 'ALT1':
            correctedName = alt1;
            break;
          case 'ALT2':
            correctedName = alt2;
            break;
          case 'ALT3':
            correctedName = alt3;
            break;
          case 'NO':
            prospects.push(htmlName);
            continue;
          default:
            continue;
        }

        if (correctedName && htmlName !== correctedName) {
          corrections.push({ old: htmlName, new: correctedName });
        }
      }

      console.log(`✅ Decisions found:`);
      console.log(`   Corrections: ${corrections.length}`);
      console.log(`   Prospects: ${prospects.length}\n`);

      if (corrections.length === 0) {
        console.log(`ℹ️  No corrections to apply\n`);
        continue;
      }

      console.log(`🔧 Applying ${corrections.length} corrections:\n`);

      let applied = 0;

      for (const correction of corrections) {
        const oldName = correction.old;
        const newName = correction.new;

        const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tdPattern = new RegExp(`(<td[^>]*>)${escapedOld}(</td>)`, 'g');
        const dataPattern = new RegExp(`data-customer="${escapedOld}"`, 'g');

        const beforeTd = (html.match(tdPattern) || []).length;
        const beforeData = (html.match(dataPattern) || []).length;

        if (beforeTd === 0 && beforeData === 0) {
          console.log(`   ⏭️  "${oldName}" not found`);
          continue;
        }

        html = html.replace(tdPattern, `$1${newName}$2`);
        html = html.replace(dataPattern, `data-customer="${newName}"`);

        console.log(`   ✓ "${oldName}" → "${newName}"`);
        applied++;
      }

      // Save
      fs.writeFileSync(htmlPath, html);

      console.log(`\n✅ Applied ${applied} corrections`);
      console.log(`🆕 Kept ${prospects.length} prospects\n`);

      totalCorrections += applied;
      totalProspects += prospects.length;
      totalFiles++;
    }

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ BATCH PROCESSING COMPLETE!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`📄 Files Processed: ${totalFiles}`);
    console.log(`🔧 Total Corrections: ${totalCorrections}`);
    console.log(`🆕 Total Prospects: ${totalProspects}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

applyBatchFromExcel();
