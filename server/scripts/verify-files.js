const fs = require('fs');
const XLSX = require('xlsx');

console.log('\n=== VERIFYING EXCEL FILES AND HTML FILES ===\n');

const files = [
  'Riad_Nidal_Customer_Review.xlsx',
  'Sofiane_Team_Customer_Review.xlsx',
  'Sojy_Hisham_DirectSales_Customer_Review.xlsx'
];

const htmlFiles = [
  'FINAL_FP_Riad___Nidal_2026_20260118_0712.html',
  'FINAL_FP_Sofiane___Team_2026_20260118_0712.html',
  'FINAL_FP_Sojy___Hisham___Direct_Sales_2026_20260118_0712.html'
];

// Check Excel files
console.log('📊 EXCEL FILES:\n');
files.forEach((file, i) => {
  const path = `D:/PPH 26.01/exports/${file}`;
  if (fs.existsSync(path)) {
    const wb = XLSX.readFile(path);
    const ws = wb.Sheets['Customer Review'];
    const data = XLSX.utils.sheet_to_json(ws);
    console.log(`${i + 1}. ${file}`);
    console.log(`   ✅ Exists: ${data.length} customers`);
    if (data.length > 0) {
      console.log(`   First customer: "${data[0]['HTML Customer Name']}"`);
      console.log(`   Match: "${data[0]['DB Best Match']}" (${data[0]['Match Score %']}%)`);
    }
  } else {
    console.log(`${i + 1}. ${file} - ❌ NOT FOUND`);
  }
  console.log('');
});

// Check HTML files
console.log('\n📄 HTML FILES:\n');
htmlFiles.forEach((file, i) => {
  const path = `D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final/${file}`;
  if (fs.existsSync(path)) {
    const html = fs.readFileSync(path, 'utf8');

    // Try to find customer names in <td> tags
    const tdMatches = html.match(/<td rowspan="2">([^<]+)<\/td>/g);
    const uniqueCustomers = new Set();

    if (tdMatches) {
      tdMatches.forEach(match => {
        const name = match.match(/<td rowspan="2">([^<]+)<\/td>/)[1];
        uniqueCustomers.add(name);
      });
    }

    console.log(`${i + 1}. ${file}`);
    console.log(`   ✅ Exists: ${uniqueCustomers.size} unique customers`);
    if (uniqueCustomers.size > 0) {
      const first3 = Array.from(uniqueCustomers).slice(0, 3);
      first3.forEach((c, idx) => {
        console.log(`   ${idx + 1}. "${c}"`);
      });
    }
  } else {
    console.log(`${i + 1}. ${file} - ❌ NOT FOUND`);
  }
  console.log('');
});

console.log('=== VERIFICATION COMPLETE ===\n');
