/**
 * Script to update customer names in Sojy & Hisham HTML budget file
 * Based on approved mappings from Excel
 */

const fs = require('fs');
const path = require('path');

// Approved mappings from Excel (only where approved = "yes" and names differ)
const approvedMappings = {
  "Adam International Fzcos60525, Jebel Ali Freezone, Je": "Adam International Fzco",
  "Al Garg Steel & Aluminium Tr7, Al Garg Steel & Aluminium T": "Al Garg Steel & Aluminium Tr",
  "Al Marwan General Cont.co.llc": "Al Marwan General Cont.Co.Llc",
  "Arabian Agencies And Trading Fjebel Ali Free Zone": "Arabian Agencies And Trading F",
  "B.i (europe) Limited21-22 Kernan Drive": "B.I (Europe) Limited",
  "Baheej International Spcal Hamliyah": "Baheej International Spc",
  "Barzman National": "Barzman National L.L.C.",
  "Bright Homes Buildingsali Mohammed Ahmed Mesmar Al S": "Bright Homes Buildings",
  "COCA-COLA AL AHLIA-UAE": "Coca-Cola Al Ahlia Beverages",
  "Coca Cola Bottling Bahrain": "Coca Cola Bottling Co Of Bahrain Bs",
  "Cosmoplast Ind Co": "Cosmoplast Ind Co Llc (Trade)",
  "Douda Tazwid Industriesplateau Du Serpent": "Douda Tazwid Industries",
  "Dubai Refreshment (Pepsi Dubai)": "Dubai Refreshment(Pjsc)",
  "Euro Polymer Plastic Indutriesp.o Box 4332": "Euro Polymer Plastic Indutries",
  "Fedex Express Bahrain W.l.lmuharraq": "Fedex Express Bahrain W.L.L",
  "Harwal Container Mfg Llc (trade)": "Harwal Container Mfg Llc (Trade)",
  "Haseeb Ahmed Ladies Fashionheeli, Al Ain Heeli, Al Ain": "Haseeb Ahmed Ladies Fashion",
  "Iklix General Trading Llciklix Llc, Sky Business Centre": "Iklix General Trading Llc",
  "International Beverages": "International Beverage & Filling",
  "Johnson Co Ltddubai, Uae": "Johnson Co Ltd",
  "Kalzip Fzejebel Ali Free Zone": "Kalzip Fze",
  "Kamdak Food Trading L.l.cal Nahda 1 Dubai": "Kamdak Food Trading L.L.C",
  "Mai Dubai": "Mai Dubai Llc.",
  "Microless General Trading L.l.warehouse 2, First Al Khail St": "Microless General Trading L.L.",
  "Middle Eastern Al Ahlia Beverages6421 Way Ghala Industrial Area": "Middle Eastern Al Ahlia Beverages",
  "Miscellaneous Customers": "Miscellaneous Customer",
  "Oman Refreshment": "Oman Refreshments Co",
  "Pioneer Electricals And Buildipo Box-110493, Musaffah M-9, A": "Pioneer Electricals And Buildi",
  "Premier International": "Premier International Plastic",
  "Rasmi Pure Mineral Watersomalia": "Rasmi Pure Mineral Water",
  "SHIPA DELIVERY SERVICES": "Shipa Delivery Services Llc",
  "Salah Mohammed Ali Badashdrmount -Al Moukalla": "Salah Mohammed Ali Badas",
  "TECHNICAL ALUMINIUM FOIL": "Technical Aluminium Foil Company",
  "TECHNICAL SUPPLIES & SERVICES": "Technical Supplies &Services Co Llc",
  "The Independent Tobacco": "The Independent Tobacco Fze",
  "Tte Engineering L.l.cal Ittihad Road (dubai - Sharj": "Tte Engineering L.L.C",
  "U.s.polymers Inc": "U.S.Polymers Inc",
  "United Bottling": "United Bottling Co.",
  "WEATHERMAKER": "Weathermaker Fze",
  "Waterfall Pumps Manufacturingwarehouse # 1-5, Altay Area, A": "Waterfall Pumps Manufacturing"
};

// NOT approved (keeping original): Awal Dairy, Fedex Express, Jet Plastic

function updateHtmlCustomers(htmlFilePath) {
  console.log(`\n📄 Reading: ${htmlFilePath}`);
  
  let htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');
  let changesCount = 0;
  
  for (const [original, replacement] of Object.entries(approvedMappings)) {
    if (original !== replacement) {
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
  
  fs.writeFileSync(htmlFilePath, htmlContent, 'utf-8');
  console.log(`\n✅ Updated ${changesCount} customer name occurrences`);
  console.log(`   File saved: ${htmlFilePath}`);
  
  return changesCount;
}

const sojyPath = path.join(__dirname, '..', 'HTML Budget 2026 sales reps export and import', 'final 2026', 'final', 'FINAL_FP_Sojy___Hisham___Direct_Sales_2026_20260118_0712.html');

if (fs.existsSync(sojyPath)) {
  updateHtmlCustomers(sojyPath);
} else {
  console.error(`❌ File not found: ${sojyPath}`);
}
