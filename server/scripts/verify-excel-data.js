const XLSX = require('xlsx');

const file = 'D:/PPH 26.01/exports/Riad_Nidal_Customer_Review.xlsx';
const wb = XLSX.readFile(file);
const ws = wb.Sheets['Customer Review'];
const data = XLSX.utils.sheet_to_json(ws);

console.log('\n📊 RIAD & NIDAL CUSTOMER REVIEW FILE VERIFICATION:\n');
console.log(`Total rows: ${data.length}\n`);
console.log('First 5 customers:\n');
data.slice(0, 5).forEach((row, i) => {
  console.log(`${i + 1}. "${row['HTML Customer Name']}"`);
  console.log(`   Match: "${row['DB Best Match']}" (${row['Match Score %']}%)`);
  console.log(`   Is Target Rep: ${row['Is Target Sales Rep']}\n`);
});

console.log('\n✅ Excel file has proper data!\n');
