const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;

/**
 * Create an empty Excel template for a new division
 * Clones structure from FP Excel file
 */
async function createDivisionExcelTemplate(divisionCode, divisionName) {
  const fpExcelPath = path.join(__dirname, '../data', 'financials -fp.xlsx');
  const newExcelPath = path.join(__dirname, '../data', `financials-${divisionCode.toLowerCase()}.xlsx`);
  
  try {
    console.log(`📄 Creating Excel template for division ${divisionCode}...`);
    
    // Check if FP template exists
    try {
      await fs.access(fpExcelPath);
    } catch (error) {
      throw new Error(`FP template file not found at: ${fpExcelPath}`);
    }
    
    // Read the FP Excel file as template
    const fpWorkbook = XLSX.readFile(fpExcelPath);
    const fpSheetName = fpWorkbook.SheetNames[0];
    const fpSheet = fpWorkbook.Sheets[fpSheetName];
    
    // Convert to JSON to get structure
    const fpData = XLSX.utils.sheet_to_json(fpSheet, { header: 1, defval: '' });
    
    if (fpData.length === 0) {
      throw new Error('FP Excel template is empty');
    }
    
    // Create new workbook with same structure but empty data
    const newWorkbook = XLSX.utils.book_new();
    
    // Clone structure: Keep row labels (column A) and headers, clear data columns
    const newData = fpData.map((row, rowIndex) => {
      if (rowIndex === 0) {
        // Keep header row as is
        return [...row];
      } else {
        // Keep first column (labels), clear data columns (set to empty or 0)
        const newRow = [...row];
        for (let i = 1; i < newRow.length; i++) {
          // Clear numeric data but preserve structure
          if (typeof row[i] === 'number') {
            newRow[i] = 0;
          } else if (row[i]) {
            // Keep text/labels if they exist
            newRow[i] = row[i];
          } else {
            newRow[i] = '';
          }
        }
        return newRow;
      }
    });
    
    // Create worksheet from cloned data
    const newSheet = XLSX.utils.aoa_to_sheet(newData);
    
    // Copy column widths if they exist
    if (fpSheet['!cols']) {
      newSheet['!cols'] = [...fpSheet['!cols']];
    }
    
    // Copy row heights if they exist
    if (fpSheet['!rows']) {
      newSheet['!rows'] = [...fpSheet['!rows']];
    }
    
    // Copy merged cells if they exist
    if (fpSheet['!merges']) {
      newSheet['!merges'] = [...fpSheet['!merges']];
    }
    
    // Add worksheet with division code as sheet name
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, divisionCode);
    
    // Write to file
    XLSX.writeFile(newWorkbook, newExcelPath);
    
    console.log(`✅ Excel template created: ${newExcelPath}`);
    console.log(`   Sheet name: ${divisionCode}`);
    console.log(`   Rows: ${newData.length}`);
    console.log(`   Structure cloned from FP template`);
    
    return {
      success: true,
      filePath: newExcelPath,
      fileName: `financials-${divisionCode.toLowerCase()}.xlsx`,
      sheetName: divisionCode,
      rows: newData.length
    };
    
  } catch (error) {
    console.error(`❌ Error creating Excel template for ${divisionCode}:`, error);
    throw error;
  }
}

/**
 * Delete Excel file for a division
 */
async function deleteDivisionExcel(divisionCode) {
  const excelPath = path.join(__dirname, '../data', `financials-${divisionCode.toLowerCase()}.xlsx`);
  
  try {
    await fs.unlink(excelPath);
    console.log(`✅ Deleted Excel file: financials-${divisionCode.toLowerCase()}.xlsx`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`ℹ️  Excel file not found (may not have been created): financials-${divisionCode.toLowerCase()}.xlsx`);
      return true; // Not an error if file doesn't exist
    }
    console.error(`❌ Error deleting Excel file for ${divisionCode}:`, error);
    throw error;
  }
}

/**
 * Check if Excel file exists for a division
 */
async function divisionExcelExists(divisionCode) {
  const excelPath = path.join(__dirname, '../data', `financials-${divisionCode.toLowerCase()}.xlsx`);
  
  try {
    await fs.access(excelPath);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  createDivisionExcelTemplate,
  deleteDivisionExcel,
  divisionExcelExists
};
