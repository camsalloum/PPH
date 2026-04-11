/**
 * Script to update customer names in Sofiane HTML budget file
 * Uses mappings from the UPDATED Excel file
 */

const fs = require('fs');
const path = require('path');

// Corrected mappings from the user's updated Excel file
const customerMappings = {
  // NEW customers - use PROPER case
  "AMA detergent": "Ama Detergent",
  "Delice Holding": "Delice Holding",
  "RANDA": "Randa",
  "SOCEM": "Socem",
  "Societe Des cafes SAHARA": "Societe Des Cafes Sahara",
  
  // FUZZY_LOW - user corrected
  "Best Biscuits Morocco (BBM)": "Best Biscuits Morocco (Bbm)",
  "SARL CELIA": "Sarl Celia Algerie",
  "Sarl Open Business Companyzone Indust Rte Boufarik": "Sarl Open Business Company",
  
  // FUZZY_MEDIUM
  "Henrys SA": "Henrys",
  "SARL Laya Alimenta (Dozia)": "Sarl Laya Alimenta Compagny",
  
  // FUZZY_HIGH
  "Al Barkah Al Rasekhah Company Llccode 312": "Al Barkah Al Rasekhah Company Llc",
  "EURL ELGAZOU": "Eurl El Ghazou",
  "Golden Cafe": "Golden Café",
  "VARUN BEVERAGES MOROCCO": "Varun Beverage Morocco",  // User removed "Sa"
  
  // MANUAL_MATCH
  "Nesto Distribution Fzcotechnopark - Tp020401": "Nesto Distribution Fzco",
  "Sarl Travepszone Industrielle Ouled Yaich": "Sarl Traveps",
  "SOMAFACO": "Somafaco",  // User shortened from "Somafaco (Société Marocaine De"
  "Spa Cevitalnouveau Quai Port De Bejaia": "Spa Cevital",
  
  // EXACT - but need case fixes
  "SARL CONAAGRAL": "Sarl Conaagral",
  "Sarl Maluxezi Kaidi Lot N 50 Bordj El Kif": "Sarl Maluxezi",  // User shortened
  "Soc Africaine De Fab De Margarrue El Haouza- Oukacha": "Soc Africaine De Fab De Margar",  // User corrected
  "Taibi Bilel agro": "Taibi Bilel Agro",  // case fix
};

function updateHtmlCustomers(htmlFilePath) {
  console.log(`\n📄 Reading: ${htmlFilePath}`);
  
  let htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');
  let changesCount = 0;
  
  // For each mapping, replace in HTML
  for (const [original, replacement] of Object.entries(customerMappings)) {
    if (original !== replacement) {
      // Escape special regex characters
      const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedOriginal, 'g');
      
      const matches = htmlContent.match(regex);
      if (matches) {
        htmlContent = htmlContent.replace(regex, replacement);
        console.log(`   ✓ "${original}" → "${replacement}" (${matches.length} occurrences)`);
        changesCount += matches.length;
      }
    }
  }
  
  // Save the updated file
  fs.writeFileSync(htmlFilePath, htmlContent, 'utf-8');
  console.log(`\n✅ Updated ${changesCount} customer name occurrences`);
  console.log(`   File saved: ${htmlFilePath}`);
  
  return changesCount;
}

// Main - First restore original, then apply correct mappings
const sofianePath = path.join(__dirname, '..', 'HTML Budget 2026 sales reps export and import', 'final 2026', 'final', 'FINAL_FP_Sofiane___Team_2026_20260118_0712.html');

if (fs.existsSync(sofianePath)) {
  // First, revert the previous wrong changes
  console.log('\n🔄 Reverting previous incorrect changes...');
  let html = fs.readFileSync(sofianePath, 'utf-8');
  
  // Revert the old wrong mappings
  const revertMappings = {
    "Somafaco (Société Marocaine De": "SOMAFACO",
    "Varun Beverage Morocco Sa": "VARUN BEVERAGES MOROCCO",
    "Sarl Maluxezi Kaidi Lot N 50 Bordj El Kiffan": "Sarl Maluxezi Kaidi Lot N 50 Bordj El Kif",
    "Soc Africaine De Fab De Marg": "Soc Africaine De Fab De Margarrue El Haouza- Oukacha",
    "Taibi Bilel": "Taibi Bilel agro",
    "Best Biscuits": "Best Biscuits Morocco (BBM)",
  };
  
  for (const [wrong, original] of Object.entries(revertMappings)) {
    const escapedWrong = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedWrong, 'g');
    const matches = html.match(regex);
    if (matches) {
      html = html.replace(regex, original);
      console.log(`   ↩ "${wrong}" → "${original}" (${matches.length} reverted)`);
    }
  }
  
  fs.writeFileSync(sofianePath, html, 'utf-8');
  
  // Now apply correct mappings
  console.log('\n✨ Applying correct mappings from Excel...');
  updateHtmlCustomers(sofianePath);
} else {
  console.error(`❌ File not found: ${sofianePath}`);
}
