/**
 * Customer Mapping Script for Sojy & Hisham & Direct Sales HTML Budget
 * Compares customers in HTML with fp_customer_unified database
 */

const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: '***REDACTED***'
});

// Levenshtein distance function
function levenshtein(a, b) {
  const matrix = [];
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
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

function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 100;
  return Math.round(((longer.length - levenshtein(longer, shorter)) / longer.length) * 100);
}

function normalize(str) {
  return str.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  try {
    // Get all customers from actual data (fp_actualcommon) instead of unified
    const dbResult = await pool.query(`
      SELECT DISTINCT customer_name as display_name
      FROM fp_actualcommon
      ORDER BY customer_name
    `);
    const dbCustomers = dbResult.rows;
    console.log(`Found ${dbCustomers.length} customers in fp_actualcommon`);
    
    // Read HTML file
    const htmlPath = path.join(__dirname, '..', 'HTML Budget 2026 sales reps export and import', 'final 2026', 'final', 'FINAL_FP_Sojy___Hisham___Direct_Sales_2026_20260118_0712.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    
    // Extract unique customer names from table cells
    // Customer names are in <td rowspan="2">CustomerName</td> in actual-row class rows
    const htmlCustomers = new Set();
    
    // Match actual-row followed by first <td rowspan="2">content</td>
    const rowRegex = /<tr class="actual-row">\s*<td rowspan="2">([^<]+)<\/td>/g;
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      // Decode HTML entities
      let customerName = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      htmlCustomers.add(customerName);
    }
    
    const customerList = [...htmlCustomers].sort();
    console.log(`Found ${customerList.length} customers in HTML file`);
    
    // Known manual matches (to be updated after reviewing results)
    const manualMatches = {
      // Add manual matches here after initial run
    };
    
    // Known new customers (not in DB)
    const newCustomers = [
      // Add new customer names here after reviewing
    ];
    
    // Match each HTML customer to DB
    const mappings = [];
    
    for (const htmlName of customerList) {
      // Check manual matches first
      if (manualMatches[htmlName] !== undefined) {
        if (manualMatches[htmlName] === null) {
          mappings.push({
            htmlName,
            suggestedDbName: '',
            matchType: 'NEW_CUSTOMER',
            matchScore: 0
          });
        } else {
          mappings.push({
            htmlName,
            suggestedDbName: manualMatches[htmlName],
            matchType: 'MANUAL_MATCH',
            matchScore: 100
          });
        }
        continue;
      }
      
      // Check new customers
      if (newCustomers.includes(htmlName)) {
        mappings.push({
          htmlName,
          suggestedDbName: '',
          matchType: 'NEW_CUSTOMER',
          matchScore: 0
        });
        continue;
      }
      
      // Try exact match
      const exactMatch = dbCustomers.find(db => db.display_name === htmlName);
      if (exactMatch) {
        mappings.push({
          htmlName,
          suggestedDbName: exactMatch.display_name,
          matchType: 'EXACT',
          matchScore: 100
        });
        continue;
      }
      
      // Try normalized match
      const normalizedHtml = normalize(htmlName);
      const normalizedMatch = dbCustomers.find(db => normalize(db.display_name) === normalizedHtml);
      if (normalizedMatch) {
        mappings.push({
          htmlName,
          suggestedDbName: normalizedMatch.display_name,
          matchType: 'NORMALIZED',
          matchScore: 95
        });
        continue;
      }
      
      // Fuzzy match
      let bestMatch = null;
      let bestScore = 0;
      
      for (const db of dbCustomers) {
        const score = similarity(normalizedHtml, normalize(db.display_name));
        if (score > bestScore) {
          bestScore = score;
          bestMatch = db.display_name;
        }
      }
      
      let matchType = 'NO_MATCH';
      if (bestScore >= 80) matchType = 'FUZZY_HIGH';
      else if (bestScore >= 60) matchType = 'FUZZY_MEDIUM';
      else if (bestScore >= 40) matchType = 'FUZZY_LOW';
      
      mappings.push({
        htmlName,
        suggestedDbName: bestMatch || '',
        matchType,
        matchScore: bestScore
      });
    }
    
    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customer Mapping');
    
    sheet.columns = [
      { header: 'HTML Customer Name', key: 'htmlName', width: 55 },
      { header: 'Suggested DB Name', key: 'suggestedDbName', width: 55 },
      { header: 'Match Type', key: 'matchType', width: 15 },
      { header: 'Match Score %', key: 'matchScore', width: 12 },
      { header: 'Approved', key: 'approved', width: 10 }
    ];
    
    // Style header
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4472C4' }
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    
    // Add data rows
    for (const m of mappings) {
      sheet.addRow(m);
    }
    
    // Color code rows
    for (let i = 2; i <= mappings.length + 1; i++) {
      const row = sheet.getRow(i);
      const matchType = row.getCell(3).value;
      
      let fillColor;
      switch (matchType) {
        case 'EXACT':
        case 'MANUAL_MATCH':
          fillColor = '90EE90'; // light green
          break;
        case 'NORMALIZED':
        case 'FUZZY_HIGH':
        case 'NEW_CUSTOMER':
          fillColor = 'C6EFCE'; // pale green
          break;
        case 'FUZZY_MEDIUM':
          fillColor = 'FFFF99'; // yellow
          break;
        case 'FUZZY_LOW':
          fillColor = 'FFD699'; // orange
          break;
        case 'NO_MATCH':
          fillColor = 'FFC7CE'; // red
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
    
    // Add reference sheet
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
    
    // Save file
    const outputPath = path.join(__dirname, '..', 'exports', 'customer_mapping_sojy_hisham.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    
    console.log(`\n✅ Excel file generated: ${outputPath}`);
    console.log('\n📊 Summary:');
    console.log(`   - EXACT matches: ${mappings.filter(m => m.matchType === 'EXACT').length}`);
    console.log(`   - MANUAL_MATCH: ${mappings.filter(m => m.matchType === 'MANUAL_MATCH').length}`);
    console.log(`   - NEW_CUSTOMER: ${mappings.filter(m => m.matchType === 'NEW_CUSTOMER').length}`);
    console.log(`   - NORMALIZED matches: ${mappings.filter(m => m.matchType === 'NORMALIZED').length}`);
    console.log(`   - FUZZY_HIGH matches: ${mappings.filter(m => m.matchType === 'FUZZY_HIGH').length}`);
    console.log(`   - FUZZY_MEDIUM matches: ${mappings.filter(m => m.matchType === 'FUZZY_MEDIUM').length}`);
    console.log(`   - FUZZY_LOW matches: ${mappings.filter(m => m.matchType === 'FUZZY_LOW').length}`);
    console.log(`   - NO_MATCH: ${mappings.filter(m => m.matchType === 'NO_MATCH').length}`);
    
    // Print non-exact matches for review
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

main();
