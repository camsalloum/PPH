/**
 * Preview Excel Decisions - Show what will be changed before applying
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function previewExcelDecisions() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        PREVIEW: CHANGES TO BE APPLIED TO HTML FILE            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Read Excel file
    const excelPath = path.join(__dirname, '../../exports/Christopher_Budget_Review.xlsx');

    console.log(`📄 Reading: ${excelPath}\n`);

    const workbook = XLSX.readFile(excelPath);
    const worksheet = workbook.Sheets['Customer Review'];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Process each row
    const corrections = [];
    const prospects = [];
    const rejections = [];
    const customs = [];
    const alternatives = [];
    const noDecision = [];
    const errors = [];

    for (const row of data) {
      const decision = (row['>> YOUR DECISION <<'] || '').toUpperCase().trim();
      const htmlName = row['HTML Customer Name'];
      const dbMatch = row['DB Best Match'];
      const alt1 = row['Alternative 1'];
      const alt2 = row['Alternative 2'];
      const alt3 = row['Alternative 3'];
      const customName = row['Corrected Name / Action'];
      const matchScore = row['Match Score %'];
      const isChristopher = row['Is Christopher'] === 'YES';
      const sales = row['Total Sales ($)'] || 0;

      if (!decision) {
        noDecision.push({
          html: htmlName,
          score: matchScore,
          dbMatch: dbMatch,
          isChristopher: isChristopher,
          sales: sales
        });
        continue;
      }

      const info = {
        html: htmlName,
        score: matchScore,
        isChristopher: isChristopher,
        sales: sales
      };

      switch (decision) {
        case 'APPROVE':
          if (htmlName !== dbMatch) {
            corrections.push({ ...info, corrected: dbMatch, type: 'APPROVE' });
          }
          break;

        case 'ALT1':
          if (alt1) {
            alternatives.push({ ...info, corrected: alt1, altNum: 1 });
          } else {
            errors.push({ ...info, error: 'ALT1 selected but no alternative 1' });
          }
          break;

        case 'ALT2':
          if (alt2) {
            alternatives.push({ ...info, corrected: alt2, altNum: 2 });
          } else {
            errors.push({ ...info, error: 'ALT2 selected but no alternative 2' });
          }
          break;

        case 'ALT3':
          if (alt3) {
            alternatives.push({ ...info, corrected: alt3, altNum: 3 });
          } else {
            errors.push({ ...info, error: 'ALT3 selected but no alternative 3' });
          }
          break;

        case 'CUSTOM':
          if (customName && customName.trim()) {
            customs.push({ ...info, corrected: customName.trim() });
          } else {
            errors.push({ ...info, error: 'CUSTOM selected but no custom name provided' });
          }
          break;

        case 'PROSPECT':
          prospects.push(info);
          break;

        case 'REJECT':
          rejections.push(info);
          break;

        default:
          errors.push({ ...info, error: `Unknown decision: ${decision}` });
      }
    }

    // Display summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📊 DECISION SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Total Customers:      ${data.length}`);
    console.log(`✅ Will Change:       ${corrections.length + alternatives.length + customs.length}`);
    console.log(`   - APPROVE:         ${corrections.length}`);
    console.log(`   - ALT1/2/3:        ${alternatives.length}`);
    console.log(`   - CUSTOM:          ${customs.length}`);
    console.log(`🆕 Prospects:         ${prospects.length}`);
    console.log(`❌ Rejections:        ${rejections.length}`);
    console.log(`⏭️  No Decision:       ${noDecision.length}`);
    console.log(`⚠️  Errors:            ${errors.length}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    // Show what will change
    if (corrections.length > 0 || alternatives.length > 0 || customs.length > 0) {
      console.log('🔧 CHANGES THAT WILL BE APPLIED TO HTML:\n');
      console.log('════════════════════════════════════════════════════════════════\n');

      let changeNum = 1;

      // Show APPROVE changes
      if (corrections.length > 0) {
        console.log('✅ APPROVED CORRECTIONS:\n');
        corrections.forEach((c) => {
          const christopher = c.isChristopher ? '👤 CHRISTOPHER' : '';
          const salesStr = c.sales ? `$${c.sales.toLocaleString()}` : '$0';
          console.log(`${changeNum.toString().padStart(2)}. [${c.score}% match] ${christopher}`);
          console.log(`    ❌ OLD: "${c.html}"`);
          console.log(`    ✅ NEW: "${c.corrected}"`);
          console.log(`    💰 Sales: ${salesStr}\n`);
          changeNum++;
        });
      }

      // Show ALTERNATIVE changes
      if (alternatives.length > 0) {
        console.log('🔀 ALTERNATIVE MATCHES:\n');
        alternatives.forEach((a) => {
          const christopher = a.isChristopher ? '👤 CHRISTOPHER' : '';
          const salesStr = a.sales ? `$${a.sales.toLocaleString()}` : '$0';
          console.log(`${changeNum.toString().padStart(2)}. [Alt ${a.altNum}] ${christopher}`);
          console.log(`    ❌ OLD: "${a.html}"`);
          console.log(`    ✅ NEW: "${a.corrected}"`);
          console.log(`    💰 Sales: ${salesStr}\n`);
          changeNum++;
        });
      }

      // Show CUSTOM changes
      if (customs.length > 0) {
        console.log('✏️  CUSTOM NAMES:\n');
        customs.forEach((c) => {
          const christopher = c.isChristopher ? '👤 CHRISTOPHER' : '';
          const salesStr = c.sales ? `$${c.sales.toLocaleString()}` : '$0';
          console.log(`${changeNum.toString().padStart(2)}. [Custom] ${christopher}`);
          console.log(`    ❌ OLD: "${c.html}"`);
          console.log(`    ✅ NEW: "${c.corrected}"`);
          console.log(`    💰 Sales: ${salesStr}\n`);
          changeNum++;
        });
      }

      console.log(`Total HTML Changes: ${corrections.length + alternatives.length + customs.length}\n`);
    } else {
      console.log('ℹ️  NO CHANGES TO APPLY (No corrections marked)\n');
    }

    // Show prospects
    if (prospects.length > 0) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('🆕 PROSPECTS (Will keep as-is - New 2026 customers):\n');
      prospects.forEach((p, i) => {
        const christopher = p.isChristopher ? '👤' : '  ';
        console.log(`   ${(i + 1).toString().padStart(2)}. ${christopher} "${p.html}"`);
      });
      console.log('\n');
    }

    // Show rejections
    if (rejections.length > 0) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('❌ REJECTIONS (Will keep as-is):\n');
      rejections.forEach((r, i) => {
        const christopher = r.isChristopher ? '👤' : '  ';
        console.log(`   ${(i + 1).toString().padStart(2)}. ${christopher} "${r.html}"`);
      });
      console.log('\n');
    }

    // Show no decision
    if (noDecision.length > 0) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('⏭️  NO DECISION (Will be skipped):\n');
      noDecision.forEach((n, i) => {
        const christopher = n.isChristopher ? '👤' : '  ';
        const salesStr = n.sales ? `$${n.sales.toLocaleString()}` : '$0';
        console.log(`   ${(i + 1).toString().padStart(2)}. ${christopher} [${n.score}%] "${n.html}"`);
        console.log(`       Suggested: "${n.dbMatch}" | Sales: ${salesStr}`);
      });
      console.log('\n');
    }

    // Show errors
    if (errors.length > 0) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('⚠️  ERRORS:\n');
      errors.forEach((e, i) => {
        console.log(`   ${i + 1}. "${e.html}"`);
        console.log(`      Error: ${e.error}\n`);
      });
    }

    // Final confirmation message
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 NEXT STEPS');
    console.log('════════════════════════════════════════════════════════════════');

    const totalChanges = corrections.length + alternatives.length + customs.length;

    if (totalChanges > 0) {
      console.log(`\n✅ Ready to apply ${totalChanges} changes to HTML file\n`);
      console.log('To CONFIRM and apply these changes, run:');
      console.log('   node server/scripts/apply-excel-corrections.js\n');
      console.log('To CANCEL, do nothing or review Excel file again\n');
    } else {
      console.log('\nℹ️  No changes to apply');
      console.log('   Review the Excel file and add decisions to YOUR DECISION column\n');
    }

    if (noDecision.length > 0) {
      console.log(`⚠️  ${noDecision.length} customers still need decisions\n`);
    }

    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} errors found - please fix in Excel file\n`);
    }

    console.log('════════════════════════════════════════════════════════════════\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

previewExcelDecisions();
