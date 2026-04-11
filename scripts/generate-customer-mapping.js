const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  database: 'fp_database',
  user: 'postgres',
  password: '***REDACTED***',
  port: 5432
});

// HTML customers extracted from the file (unique list)
const htmlCustomers = [
  "A'saffa Foods Saog",
  "Al Ahlia Converting Industries",
  "Al Barkah Al Rasekhah Company Llccode 312",
  "Al Hadhrami International",
  "Al Nahda Al Masriyya",
  "Al Shaihani Paper Industries",
  "Algo Food",
  "AMA detergent",
  "Aqua Brown Food Industries",
  "Best Biscuits Morocco (BBM)",
  "Delice Holding",
  "EURL ELGAZOU",
  "Golden Cafe",
  "Henrys SA",
  "Nesto Distribution Fzcotechnopark - Tp020401",
  "RANDA",
  "SARL CELIA",
  "SARL CONAAGRAL",
  "SARL Laya Alimenta (Dozia)",
  "Sarl Maluxezi Kaidi Lot N 50 Bordj El Kif",
  "Sarl Open Business Companyzone Indust Rte Boufarik",
  "Sarl Travepszone Industrielle Ouled Yaich",
  "Soc Africaine De Fab De Margarrue El Haouza- Oukacha",
  "SOCEM",
  "Societe Des cafes SAHARA",
  "SOMAFACO",
  "Soqia Devolpement And Services",
  "Spa Cevitalnouveau Quai Port De Bejaia",
  "Taibi Bilel agro",
  "VARUN BEVERAGES MOROCCO"
];

// Manual overrides for better matching (based on DB search results)
const manualMatches = {
  "Spa Cevitalnouveau Quai Port De Bejaia": "Spa Cevital",
  "SOMAFACO": "Somafaco (Société Marocaine De",
  "Sarl Travepszone Industrielle Ouled Yaich": "Sarl Traveps",
  "Nesto Distribution Fzcotechnopark - Tp020401": "Nesto Distribution Fzco",
  "Sarl Maluxezi Kaidi Lot N 50 Bordj El Kif": "Sarl Maluxe",
  // These are NEW customers - not in DB yet
  "RANDA": null,  // NEW - Tunisia
  "SOCEM": null,  // NEW - Tunisia  
  "Delice Holding": null,  // NEW - Tunisia
  "AMA detergent": null,  // NEW - Morocco
  "Societe Des cafes SAHARA": null,  // NEW - Morocco
  "Golden Cafe": null,  // NEW - keep as is
  "Henrys SA": null,  // NEW - keep as is
};

// Simple Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Similarity score (0-100)
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
  return Math.round((1 - dist / maxLen) * 100);
}

// Check if names are a match based on normalized comparison
function normalizedMatch(htmlName, dbName) {
  const normalize = (s) => s.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
  return normalize(htmlName) === normalize(dbName);
}

async function generateMappingExcel() {
  try {
    // Get all customers from fp_actualcommon (actual data)
    const result = await pool.query(`
      SELECT DISTINCT customer_name as display_name
      FROM fp_actualcommon
      ORDER BY customer_name
    `);
    
    const dbCustomers = result.rows;
    console.log(`Found ${dbCustomers.length} customers in fp_actualcommon`);
    console.log(`Found ${htmlCustomers.length} customers in HTML file`);
    
    // Find best matches for each HTML customer
    const mappings = [];
    
    for (const htmlName of htmlCustomers) {
      let bestMatch = null;
      let bestScore = 0;
      let matchType = 'NO_MATCH';
      
      // Check for manual override first
      if (htmlName in manualMatches) {
        if (manualMatches[htmlName] === null) {
          // This is a NEW customer - not in DB
          bestMatch = '';
          bestScore = 0;
          matchType = 'NEW_CUSTOMER';
        } else {
          bestMatch = manualMatches[htmlName];
          bestScore = 100;
          matchType = 'MANUAL_MATCH';
        }
      } else {
        // Check for exact match (case-insensitive)
        const exactMatch = dbCustomers.find(db => 
          db.display_name.toLowerCase() === htmlName.toLowerCase()
        );
        
        if (exactMatch) {
          bestMatch = exactMatch.display_name;
          bestScore = 100;
          matchType = 'EXACT';
        } else {
          // Check for normalized match
          const normMatch = dbCustomers.find(db => normalizedMatch(htmlName, db.display_name));
          
          if (normMatch) {
            bestMatch = normMatch.display_name;
            bestScore = 99;
            matchType = 'NORMALIZED';
          } else {
            // Find best fuzzy match
            for (const db of dbCustomers) {
              const score = similarity(htmlName, db.display_name);
              if (score > bestScore) {
                bestScore = score;
                bestMatch = db.display_name;
              }
            }
          
            if (bestScore >= 80) {
              matchType = 'FUZZY_HIGH';
            } else if (bestScore >= 60) {
              matchType = 'FUZZY_MEDIUM';
            } else if (bestScore >= 40) {
              matchType = 'FUZZY_LOW';
            } else {
              matchType = 'NO_MATCH';
            }
          }
        }
      }
      
      mappings.push({
        htmlName,
        suggestedDbName: bestMatch || '',
        matchScore: bestScore,
        matchType,
        approved: (matchType === 'EXACT' || matchType === 'MANUAL_MATCH') ? 'YES' : (matchType === 'NEW_CUSTOMER' ? 'NEW' : ''),
        finalDbName: (matchType === 'EXACT' || matchType === 'MANUAL_MATCH') ? bestMatch : ''
      });
    }
    
    // Sort by match type (worst first so user can focus on them)
    mappings.sort((a, b) => {
      const order = { 'NEW_CUSTOMER': 0, 'NO_MATCH': 1, 'FUZZY_LOW': 2, 'FUZZY_MEDIUM': 3, 'FUZZY_HIGH': 4, 'NORMALIZED': 5, 'MANUAL_MATCH': 6, 'EXACT': 7 };
      return order[a.matchType] - order[b.matchType];
    });
    
    // Generate Excel file
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customer Mapping');
    
    // Add headers
    sheet.columns = [
      { header: 'HTML Customer Name', key: 'htmlName', width: 50 },
      { header: 'Suggested DB Name', key: 'suggestedDbName', width: 50 },
      { header: 'Match Score', key: 'matchScore', width: 12 },
      { header: 'Match Type', key: 'matchType', width: 15 },
      { header: 'Approved? (YES/NO)', key: 'approved', width: 18 },
      { header: 'Final DB Name (edit if needed)', key: 'finalDbName', width: 50 }
    ];
    
    // Style headers
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4472C4' }
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    
    // Add data rows
    for (const mapping of mappings) {
      const row = sheet.addRow(mapping);
      
      // Color code by match type
      let fillColor;
      switch (mapping.matchType) {
        case 'EXACT':
        case 'MANUAL_MATCH':
          fillColor = 'C6EFCE'; // Green
          break;
        case 'NORMALIZED':
          fillColor = 'B4C6E7'; // Light blue
          break;
        case 'FUZZY_HIGH':
          fillColor = 'FFE699'; // Yellow
          break;
        case 'FUZZY_MEDIUM':
          fillColor = 'FFCC99'; // Orange
          break;
        case 'FUZZY_LOW':
          fillColor = 'FFCCCC'; // Light red
          break;
        case 'NEW_CUSTOMER':
          fillColor = 'E2EFDA'; // Light green (new customer)
          break;
        case 'NO_MATCH':
          fillColor = 'FF9999'; // Red
          break;
        default:
          fillColor = 'FFFFFF';
      }
      
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fillColor }
      };
    }
    
    // Add a second sheet with ALL actual customers for reference
    const refSheet = workbook.addWorksheet('All Actual Customers');
    refSheet.columns = [
      { header: 'Actual Customer Name', key: 'display_name', width: 60 }
    ];
    refSheet.getRow(1).font = { bold: true };
    refSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4472C4' }
    };
    refSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    
    for (const db of dbCustomers) {
      refSheet.addRow(db);
    }
    
    // Save the file
    const outputPath = path.join(__dirname, '..', 'exports', 'customer_mapping_sofiane_team.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    
    console.log(`\n✅ Excel file generated: ${outputPath}`);
    console.log('\n📊 Summary:');
    console.log(`   - EXACT matches: ${mappings.filter(m => m.matchType === 'EXACT').length}`);
    console.log(`   - NORMALIZED matches: ${mappings.filter(m => m.matchType === 'NORMALIZED').length}`);
    console.log(`   - FUZZY_HIGH matches: ${mappings.filter(m => m.matchType === 'FUZZY_HIGH').length}`);
    console.log(`   - FUZZY_MEDIUM matches: ${mappings.filter(m => m.matchType === 'FUZZY_MEDIUM').length}`);
    console.log(`   - FUZZY_LOW matches: ${mappings.filter(m => m.matchType === 'FUZZY_LOW').length}`);
    console.log(`   - NO_MATCH: ${mappings.filter(m => m.matchType === 'NO_MATCH').length}`);
    
    // Print mappings that need attention
    console.log('\n⚠️  Mappings that need review:');
    for (const m of mappings.filter(x => x.matchType !== 'EXACT')) {
      console.log(`   "${m.htmlName}" → "${m.suggestedDbName}" (${m.matchType}, ${m.matchScore}%)`);
    }
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
}

generateMappingExcel();
