// Shared utility to compute cell value for a given rowIndex and column config
export function computeCellValue(divisionData, rowIndex, column) {
  try {
    if (!column || typeof column !== 'object') return 0;
    if (typeof rowIndex !== 'number') return 0;
    if (!divisionData || !Array.isArray(divisionData) || divisionData.length === 0) return 0;
    if (rowIndex < 0 || rowIndex >= divisionData.length) return 0;

    // Determine which months to include based on selected period
    let monthsToInclude = [];
    
    // NEW LOGIC: Use column.months array if it exists (for custom ranges and all periods)
    if (column.months && Array.isArray(column.months)) {
      monthsToInclude = column.months;
    } else {
      // FALLBACK LOGIC: Handle legacy cases if months array is not available
      if (column.month === 'Q1') {
        monthsToInclude = ['January', 'February', 'March'];
      } else if (column.month === 'Q2') {
        monthsToInclude = ['April', 'May', 'June'];
      } else if (column.month === 'Q3') {
        monthsToInclude = ['July', 'August', 'September'];
      } else if (column.month === 'Q4') {
        monthsToInclude = ['October', 'November', 'December'];
      } else if (column.month === 'Year') {
        monthsToInclude = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
      } else {
        monthsToInclude = [column.month];
      }
    }

    let sum = 0;
    let foundValues = false;
    
    // Normalize column type for case-insensitive comparison
    const targetType = column.type ? column.type.toLowerCase() : '';
    
    for (let c = 1; c < divisionData[0].length; c++) {
      const cellYear = divisionData[0] && divisionData[0][c];
      const cellMonth = divisionData[1] && divisionData[1][c];
      const cellType = divisionData[2] && divisionData[2][c];
      
      // Normalize cell type
      const normalizedCellType = cellType ? String(cellType).toLowerCase() : '';
      
      if (
        cellYear == column.year &&
        monthsToInclude.includes(cellMonth) &&
        normalizedCellType === targetType
      ) {
        const value = divisionData[rowIndex][c];
        if (value !== undefined && value !== null && !isNaN(parseFloat(value))) {
          sum += parseFloat(value);
          foundValues = true;
        }
      }
    }
    
    return foundValues ? sum : 0;
  } catch (error) {
    console.error('computeCellValue ERROR:', error);
    return 0;
  }
} 