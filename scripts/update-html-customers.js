/**
 * Script to update customer names in HTML budget files
 * Uses the mapping from generate-customer-mapping.js
 */

const fs = require('fs');
const path = require('path');

// Mappings from the Excel file (Suggested DB Name column)
// For NEW_CUSTOMER entries, we keep the original HTML name
const customerMappings = {
  // EXACT matches (no change needed, but listed for completeness)
  "A'saffa Foods Saog": "A'saffa Foods Saog",
  "Al Ahlia Converting Industries": "Al Ahlia Converting Industries",
  "Al Hadhrami International": "Al Hadhrami International",
  "Al Nahda Al Masriyya": "Al Nahda Al Masriyya",
  "Al Shaihani Paper Industries": "Al Shaihani Paper Industries",
  "Algo Food": "Algo Food",
  "Aqua Brown Food Industries": "Aqua Brown Food Industries",
  "SARL CONAAGRAL": "Sarl Conaagral",
  "Sarl Maluxezi Kaidi Lot N 50 Bordj El Kif": "Sarl Maluxezi Kaidi Lot N 50 Bordj El Kiffan",
  "Soc Africaine De Fab De Margarrue El Haouza- Oukacha": "Soc Africaine De Fab De Marg",
  "Soqia Devolpement And Services": "Soqia Devolpement And Services",
  "Taibi Bilel agro": "Taibi Bilel",
  
  // MANUAL_MATCH (confirmed mappings)
  "Spa Cevitalnouveau Quai Port De Bejaia": "Spa Cevital",
  "SOMAFACO": "Somafaco (Société Marocaine De",
  "Sarl Travepszone Industrielle Ouled Yaich": "Sarl Traveps",
  "Nesto Distribution Fzcotechnopark - Tp020401": "Nesto Distribution Fzco",
  
  // FUZZY_HIGH matches (80%+ similarity)
  "Al Barkah Al Rasekhah Company Llccode 312": "Al Barkah Al Rasekhah Company Llc",
  "EURL ELGAZOU": "Eurl El Ghazou",
  "Golden Cafe": "Golden Café",
  "VARUN BEVERAGES MOROCCO": "Varun Beverage Morocco Sa",
  
  // FUZZY_MEDIUM matches (60-79%)
  "Henrys SA": "Henrys",
  "SARL Laya Alimenta (Dozia)": "Sarl Laya Alimenta Compagny",
  
  // FUZZY_LOW matches (need review - keeping suggested for now)
  "Best Biscuits Morocco (BBM)": "Best Biscuits",
  "SARL CELIA": "Sarl Celia Algerie",
  "Sarl Open Business Companyzone Indust Rte Boufarik": "Sarl Open Business Company",
  
  // NEW_CUSTOMER (keep exact original name - not in DB)
  "AMA detergent": "AMA detergent",
  "Delice Holding": "Delice Holding",
  "RANDA": "RANDA",
  "SOCEM": "SOCEM",
  "Societe Des cafes SAHARA": "Societe Des cafes SAHARA"
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

// Main
const sofianePath = path.join(__dirname, '..', 'HTML Budget 2026 sales reps export and import', 'final 2026', 'final', 'FINAL_FP_Sofiane___Team_2026_20260118_0712.html');

if (fs.existsSync(sofianePath)) {
  updateHtmlCustomers(sofianePath);
} else {
  console.error(`❌ File not found: ${sofianePath}`);
}
