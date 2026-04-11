/**
 * Script to update customer names in Sofiane HTML budget file
 * Based on approved mappings from Excel (comparing with fp_actualcommon)
 */

const fs = require('fs');
const path = require('path');

// Approved mappings (all approved, Varun corrected to remove "Sa")
const approvedMappings = {
  // MANUAL_MATCH
  "Spa Cevitalnouveau Quai Port De Bejaia": "Spa Cevital",
  "SOMAFACO": "Somafaco (Société Marocaine De",
  "Sarl Travepszone Industrielle Ouled Yaich": "Sarl Traveps",
  "Nesto Distribution Fzcotechnopark - Tp020401": "Nesto Distribution Fzco",
  "Sarl Maluxezi Kaidi Lot N 50 Bordj El Kif": "Sarl Maluxe",
  
  // FUZZY_HIGH (corrected Varun)
  "Al Barkah Al Rasekhah Company Llccode 312": "Al Barkah Al Rasekhah Company Llc",
  "EURL ELGAZOU": "Eurl El Ghazou",
  "VARUN BEVERAGES MOROCCO": "Varun Beverage Morocco",  // User corrected - no "Sa"
  
  // FUZZY_MEDIUM
  "SARL Laya Alimenta (Dozia)": "Sarl Laya Alimenta Compagny",
  
  // FUZZY_LOW
  "Best Biscuits Morocco (BBM)": "Best Biscuits Morocco (BBM)",  // keep as is (wrong match)
  "SARL CELIA": "Sarl Celia Algerie",
  "Sarl Open Business Companyzone Indust Rte Boufarik": "Sarl Open Business Company",
  "Soc Africaine De Fab De Margarrue El Haouza- Oukacha": "Soc Africaine De Fab De Margar",
  
  // NEW_CUSTOMER - keep as proper case
  "AMA detergent": "Ama Detergent",
  "Delice Holding": "Delice Holding",
  "Golden Cafe": "Golden Cafe",
  "Henrys SA": "Henrys SA",
  "RANDA": "Randa",
  "SOCEM": "Socem",
  "Societe Des cafes SAHARA": "Societe Des Cafes Sahara",
  
  // EXACT - case fixes
  "SARL CONAAGRAL": "Sarl Conaagral",
  "Taibi Bilel agro": "Taibi Bilel Agro",
};

function updateHtmlCustomers(htmlFilePath) {
  console.log(`\n📄 Reading: ${htmlFilePath}`);
  
  let htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');
  let changesCount = 0;
  
  for (const [original, replacement] of Object.entries(approvedMappings)) {
    if (original !== replacement) {
      // Try both regular and HTML-encoded versions
      const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedOriginal, 'g');
      
      let matches = htmlContent.match(regex);
      if (matches) {
        htmlContent = htmlContent.replace(regex, replacement);
        console.log(`   ✓ "${original}" → "${replacement}" (${matches.length} occurrences)`);
        changesCount += matches.length;
      }
      
      // Also try with &amp; encoding for names with &
      if (original.includes('&')) {
        const ampEncoded = original.replace(/&/g, '&amp;');
        const ampReplacement = replacement.replace(/&/g, '&amp;');
        const ampEscaped = ampEncoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const ampRegex = new RegExp(ampEscaped, 'g');
        
        matches = htmlContent.match(ampRegex);
        if (matches) {
          htmlContent = htmlContent.replace(ampRegex, ampReplacement);
          console.log(`   ✓ "${ampEncoded}" → "${ampReplacement}" (${matches.length} occurrences)`);
          changesCount += matches.length;
        }
      }
    }
  }
  
  fs.writeFileSync(htmlFilePath, htmlContent, 'utf-8');
  console.log(`\n✅ Updated ${changesCount} customer name occurrences`);
  console.log(`   File saved: ${htmlFilePath}`);
  
  return changesCount;
}

const sofianePath = path.join(__dirname, '..', 'HTML Budget 2026 sales reps export and import', 'final 2026', 'final', 'FINAL_FP_Sofiane___Team_2026_20260118_0712.html');

if (fs.existsSync(sofianePath)) {
  updateHtmlCustomers(sofianePath);
} else {
  console.error(`❌ File not found: ${sofianePath}`);
}
