// Function to get unique product groups based on sales rep, selected variable, and division
export function getUniqueProductGroups(rep, selectedVariable, selectedDivision, excelData, salesRepGroups) {
  // Handle specific case for Christopher Dela Cruz with Kgs variable and FP division when S&V sheet exists
  if (rep === 'Christopher Dela Cruz' && selectedVariable === 'Kgs' && selectedDivision === 'FP' && excelData['FP-S&V']) {
    return ['PG-A Category', 'PG-B Category'];
  }
  
  // Handle specific case for Christopher Dela Cruz with Amount variable and FP division
  if (rep === 'Christopher Dela Cruz' && selectedVariable === 'Amount' && selectedDivision === 'FP') {
    return ['Volume Product A', 'Volume Product B', 'Volume Product F'];
  }
  
  // Handle specific case for Christopher Dela Cruz with Kgs variable and FP division when S&V sheet is missing
  if (rep === 'Christopher Dela Cruz' && selectedVariable === 'Kgs' && selectedDivision === 'FP' && !excelData['FP-S&V']) {
    return ['Volume Product A', 'Volume Product B'];
  }
  
  // Check if this rep is actually a group
  const isGroup = salesRepGroups && Object.keys(salesRepGroups).includes(rep);
  const groupMembers = isGroup ? salesRepGroups[rep] : [];
  
  // Determine which sheet to use based on the selected variable
  let sheetName = '';
  
  // For Amount variable, always use Volume sheet
  if (selectedVariable === 'Amount') {
    if (selectedDivision === 'FP') sheetName = 'FP-Volume';
    else if (selectedDivision === 'SB') sheetName = 'SB-Volume';
    else if (selectedDivision === 'TF') sheetName = 'TF-Volume';
    else if (selectedDivision === 'HCM') sheetName = 'HCM-Volume';
    else sheetName = selectedDivision + '-Volume';
  } 
  // For Kgs variable, try to use S&V sheet first
  else {
    if (selectedDivision === 'FP') sheetName = 'FP-S&V';
    else if (selectedDivision === 'SB') sheetName = 'SB-S&V';
    else if (selectedDivision === 'TF') sheetName = 'TF-S&V';
    else if (selectedDivision === 'HCM') sheetName = 'HCM-S&V';
    else sheetName = selectedDivision + '-S&V';
    
    // Fallback to Volume sheet if S&V doesn't exist
    if (!excelData[sheetName]) {
      if (selectedDivision === 'FP') sheetName = 'FP-Volume';
      else if (selectedDivision === 'SB') sheetName = 'SB-Volume';
      else if (selectedDivision === 'TF') sheetName = 'TF-Volume';
      else if (selectedDivision === 'HCM') sheetName = 'HCM-Volume';
      else sheetName = selectedDivision + '-Volume';
    }
  }
  
  const sheetData = excelData[sheetName] || [];
  
  // Data starts from row 3 (skip 3 header rows)
  const dataRows = sheetData.slice(3);
  
  // If Kgs is selected and using S&V sheet, get unique product groups from column D (index 3)
  if (selectedVariable === 'Kgs' && sheetName.includes('S&V')) {
    // Find all product groups from column D for this rep (or group members)
    const productGroups = Array.from(new Set(
      dataRows
        .filter(row => {
          // If this is a group, check if the row's sales rep is in the group members
          if (isGroup) {
            return groupMembers.includes(row[0]) && row[6] === 'Kgs';
          }
          // Otherwise, just check if it matches the specific rep and has Kgs in column G (index 6)
          return row[0] === rep && row[6] === 'Kgs';
        })
        .map(row => row[3]) // Product Group in column D (index 3)
    )).filter(Boolean);
    
    return productGroups;
  } else {
    // For Amount or if S&V sheet doesn't exist, use column B (index 1)
    const productGroups = Array.from(new Set(
      dataRows
        .filter(row => {
          // If this is a group, check if the row's sales rep is in the group members
          if (isGroup) {
            return groupMembers.includes(row[0]) && (selectedVariable === 'Kgs' ? row[6] === 'Kgs' : true);
          }
          // Otherwise, just check if it matches the specific rep
          return row[0] === rep && (selectedVariable === 'Kgs' ? row[6] === 'Kgs' : true);
        })
        .map(row => row[1]) // Product Group in column B (index 1)
    )).filter(Boolean);
    
    return productGroups;
  }
}