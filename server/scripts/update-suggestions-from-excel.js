/**
 * Update AI Suggestions from Excel file
 * Reads the updated Excel and updates suggested_merge_name in database
 */
require('dotenv').config();
const { pool } = require('../database/config');
const ExcelJS = require('exceljs');
const path = require('path');

async function updateSuggestionsFromExcel() {
  console.log('\n=== UPDATING AI SUGGESTIONS FROM EXCEL ===\n');
  
  // Read updated Excel file
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(__dirname, '..', '..', 'AI_Merge_Suggestions_2026-01-02.xlsx'));
  
  const worksheet = workbook.getWorksheet('AI Suggestions');
  
  // Build map of customer1 -> new merged name
  const updates = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    const customer1 = row.getCell(1).value?.toString().trim() || '';
    const newMergedName = row.getCell(6).value?.toString().trim() || '';
    
    if (customer1 && newMergedName) {
      updates.push({ customer1, newMergedName });
    }
  });
  
  console.log(`Found ${updates.length} rows to update\n`);
  
  // Get current suggestions from database
  const suggestions = await pool.query(`
    SELECT id, suggested_merge_name, customer_group
    FROM fp_merge_rule_suggestions 
    WHERE admin_action IS NULL OR admin_action = 'PENDING'
    ORDER BY confidence_score DESC
  `);
  
  let updatedCount = 0;
  let skippedCount = 0;
  
  for (const update of updates) {
    // Find matching suggestion by first customer
    const matching = suggestions.rows.find(s => {
      const customers = Array.isArray(s.customer_group) 
        ? s.customer_group 
        : JSON.parse(s.customer_group || '[]');
      return customers[0] === update.customer1;
    });
    
    if (matching) {
      // Check if name actually changed
      if (matching.suggested_merge_name !== update.newMergedName) {
        await pool.query(`
          UPDATE fp_merge_rule_suggestions 
          SET suggested_merge_name = $1
          WHERE id = $2
        `, [update.newMergedName, matching.id]);
        
        console.log(`✅ Updated ID ${matching.id}: "${matching.suggested_merge_name}" → "${update.newMergedName}"`);
        updatedCount++;
      } else {
        skippedCount++;
      }
    } else {
      console.log(`⚠️  No match found for: ${update.customer1}`);
    }
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Updated: ${updatedCount}`);
  console.log(`Unchanged: ${skippedCount}`);
  console.log(`Total: ${updates.length}`);
  
  process.exit(0);
}

updateSuggestionsFromExcel().catch(e => { 
  console.error(e); 
  process.exit(1); 
});
