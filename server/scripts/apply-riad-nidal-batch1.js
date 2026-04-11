/**
 * Apply Riad & Nidal corrections - Batch 1 (First 10 + more discovered)
 */

const fs = require('fs');

const filePath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final/FINAL_FP_Riad___Nidal_2026_20260118_0712.html';

console.log('\n🔧 APPLYING CORRECTIONS TO RIAD & NIDAL FILE\n');

// Read file
let html = fs.readFileSync(filePath, 'utf8');

// Create backup
const backupPath = filePath.replace('.html', `_backup_${Date.now()}.html`);
fs.writeFileSync(backupPath, html);
console.log(`💾 Backup: ${backupPath}\n`);

// Define corrections based on user approval
const corrections = [
  // First 10 approved
  { old: 'AL AIN FARMS FOR LIVESTOCK', new: 'Al Ain Farms For Livestock' },
  { old: 'Al Hayat Company For Soft & Mineralmakhmoor Street', new: 'Al Hayat Company For Soft & Mineral' },
  { old: 'Al Hayat Company For Soft &amp; Mineralmakhmoor Street', new: 'Al Hayat Company For Soft & Mineral' },
  { old: 'AL MANHAL WATER FACTORY', new: 'Al Manhal Water Factory' },
  { old: 'AL RAYAN PLANT FOR DAIRY', new: 'Al Rayan Plant For Dairy Company' },
  { old: 'Alfurat Company For Agriculture And', new: 'Alfurat Company For Agriculture' },
  { old: 'CARBONIC', new: 'Carbonic' },

  // Additional customers found - ALL CAPS or address issues
  { old: 'Carbonic International Fzcopo Box 261198', new: 'Carbonic International Fzco' },
  { old: 'Countryside Food Factoryindustrial Area Block 7', new: 'Countryside Food Factory' },
  { old: 'HADRAMOUT INDUSTRIAL COMPLEX', new: 'Hadramout Industrial Complex' },
  { old: 'Kabour Brothers (hermanos)damascus/Abo Rumaneh', new: 'Kabour Brothers' },
  { old: 'NAQI WATER', new: 'Naqi Water' },
  { old: 'NATIONAL FACTORY FOR FOODS [GLORIA]', new: 'National Factory For Foods (Gloria)' },
  { old: 'Nusari Industry &amp; Trade Co', new: 'Nusari Industry & Trade Co' },
  { old: 'Yemen Company For Ghee &amp; Soap', new: 'Yemen Company For Ghee & Soap' },
];

console.log('📋 Applying corrections:\n');

let count = 0;
for (const c of corrections) {
  // Escape special regex characters
  const escaped = c.old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(<td[^>]*>)${escaped}(</td>)`, 'g');

  const before = (html.match(regex) || []).length;

  if (before > 0) {
    html = html.replace(regex, `$1${c.new}$2`);
    console.log(`✅ "${c.old}"`);
    console.log(`   → "${c.new}" (${before} occurrences)`);
    count++;
  }
}

// Save
fs.writeFileSync(filePath, html);

console.log(`\n════════════════════════════════════════`);
console.log(`✅ DONE! Applied ${count} corrections`);
console.log(`════════════════════════════════════════\n`);
