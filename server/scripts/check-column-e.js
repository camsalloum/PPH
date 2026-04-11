/**
 * Check Excel Column E and show decisions
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function checkColumnE() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         CHECKING COLUMN E FOR YOUR DECISIONS                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    const excelPath = path.join(__dirname, '../../exports/Christopher_Budget_Review.xlsx');

    const workbook = XLSX.readFile(excelPath);
    const worksheet = workbook.Sheets['Customer Review'];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Total Customers: ${data.length}\n`);

    // Separate into YES (replace) and NO DECISION
    const yesReplacements = [];
    const noDecision = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // Excel row number (accounting for header)

      // Column E is "Is Christopher" in the original, but let me check what column E actually contains
      // Let me look at all columns to find where "yes" might be
      const columnE_isChristopher = row['Is Christopher'];
      const decisionColumn = row['>> YOUR DECISION <<'];

      // Check if there's a "yes" anywhere in the row
      let hasYes = false;
      let yesColumn = null;

      for (const [key, value] of Object.entries(row)) {
        if (value && String(value).toLowerCase().trim() === 'yes') {
          hasYes = true;
          yesColumn = key;
          break;
        }
      }

      const info = {
        rowNum: rowNum,
        htmlName: row['HTML Customer Name'],
        dbMatch: row['DB Best Match'],
        matchScore: row['Match Score %'],
        isChristopher: columnE_isChristopher,
        salesRep: row['Sales Rep'],
        sales: row['Total Sales ($)'] || 0,
        yesColumn: yesColumn,
        yesValue: hasYes
      };

      if (hasYes) {
        yesReplacements.push(info);
      } else {
        noDecision.push(info);
      }
    }

    console.log('════════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`✅ Marked as YES (will replace):  ${yesReplacements.length}`);
    console.log(`⏳ No Decision Yet:                ${noDecision.length}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    // Show YES replacements
    if (yesReplacements.length > 0) {
      console.log('✅ CUSTOMERS YOU MARKED AS "YES" (WILL BE REPLACED):\n');
      yesReplacements.forEach((c, i) => {
        const christopher = c.isChristopher === 'YES' ? '👤' : '  ';
        const salesStr = c.sales ? `$${c.sales.toLocaleString()}` : '$0';
        console.log(`${(i + 1).toString().padStart(2)}. Row ${c.rowNum} [${c.matchScore}%] ${christopher}`);
        console.log(`    ❌ OLD: "${c.htmlName}"`);
        console.log(`    ✅ NEW: "${c.dbMatch}"`);
        console.log(`    💰 Sales: ${salesStr} | Rep: ${c.salesRep || 'N/A'}`);
        console.log(`    (Found "yes" in column: ${c.yesColumn})\n`);
      });
    }

    // Show remaining for prospect decision
    if (noDecision.length > 0) {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('⏳ REMAINING CUSTOMERS - TELL ME IF THEY ARE PROSPECTS:\n');

      noDecision.forEach((c, i) => {
        const christopher = c.isChristopher === 'YES' ? '👤 CHRISTOPHER' : '';
        const salesStr = c.sales ? `$${c.sales.toLocaleString()}` : '$0';
        console.log(`${(i + 1).toString().padStart(2)}. Row ${c.rowNum} [${c.matchScore}%] ${christopher}`);
        console.log(`    HTML: "${c.htmlName}"`);
        console.log(`    DB:   "${c.dbMatch}"`);
        console.log(`    Sales: ${salesStr} | Rep: ${c.salesRep || 'N/A'}\n`);
      });

      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log('Please tell me which of these remaining customers are:');
      console.log('  • PROSPECTS (new 2026 customers with no history)');
      console.log('  • Or should also be REPLACED (approve the DB match)\n');
    }

    // Save summary for next step
    const summaryPath = path.join(__dirname, '../../exports/christopher-decisions-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      yesReplacements: yesReplacements,
      remaining: noDecision
    }, null, 2));

    console.log(`💾 Summary saved to: christopher-decisions-summary.json\n`);

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkColumnE();
