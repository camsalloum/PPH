/**
 * Export AI Suggestions to Excel
 * Format: Customer 1-5 (Before Merge), Proposed Merged Name
 */
require('dotenv').config();
const { pool } = require('../database/config');
const ExcelJS = require('exceljs');
const path = require('path');

async function exportSuggestionsToExcel() {
  console.log('\n=== EXPORTING AI SUGGESTIONS TO EXCEL ===\n');
  
  // Get all pending suggestions
  const suggestions = await pool.query(`
    SELECT id, suggested_merge_name, customer_group, confidence_score, suggested_at
    FROM fp_merge_rule_suggestions 
    WHERE admin_action IS NULL OR admin_action = 'PENDING'
    ORDER BY confidence_score DESC
  `);
  
  console.log(`Found ${suggestions.rows.length} pending suggestions\n`);
  
  // Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IPDashboard AI';
  workbook.created = new Date();
  
  const worksheet = workbook.addWorksheet('AI Suggestions');
  
  // Define columns
  worksheet.columns = [
    { header: 'Customer 1 (Before Merge)', key: 'customer1', width: 40 },
    { header: 'Customer 2 (Before Merge)', key: 'customer2', width: 40 },
    { header: 'Customer 3 (Before Merge)', key: 'customer3', width: 40 },
    { header: 'Customer 4 (Before Merge)', key: 'customer4', width: 40 },
    { header: 'Customer 5 (Before Merge)', key: 'customer5', width: 40 },
    { header: 'Proposed Merged Name', key: 'mergedName', width: 45 },
  ];
  
  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0078D4' } // Blue header like in image
  };
  worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 25;
  
  // Add data rows
  for (const s of suggestions.rows) {
    const customers = Array.isArray(s.customer_group) 
      ? s.customer_group 
      : JSON.parse(s.customer_group || '[]');
    
    worksheet.addRow({
      customer1: customers[0] || '',
      customer2: customers[1] || '',
      customer3: customers[2] || '',
      customer4: customers[3] || '',
      customer5: customers[4] || '',
      mergedName: s.suggested_merge_name || ''
    });
  }
  
  // Add borders to all cells
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });
  
  // Save file
  const fileName = `AI_Merge_Suggestions_${new Date().toISOString().split('T')[0]}.xlsx`;
  const filePath = path.join(__dirname, '..', '..', fileName);
  
  await workbook.xlsx.writeFile(filePath);
  
  console.log(`✅ Excel file exported: ${filePath}`);
  console.log(`   Total suggestions: ${suggestions.rows.length}`);
  
  process.exit(0);
}

exportSuggestionsToExcel().catch(e => { 
  console.error(e); 
  process.exit(1); 
});
