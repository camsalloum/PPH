/**
 * Excel File Routes
 * Handles Excel file downloads for divisions
 * 
 * File naming convention: "financials -DIVISION.xlsx" (space before hyphen)
 * Examples: "financials -fp.xlsx", "financials -pp.xlsx"
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Dynamic file map - divisions are added dynamically based on files in data folder
// Format: "financials -DIVISION.xlsx" (with space before hyphen)
const DIVISION_FILE_MAP = {
  'fp': 'financials -fp.xlsx'
  // Other divisions are detected dynamically from file system
};

// GET /financials/:division.xlsx - Download Excel file for specific division
router.get('/financials/:division.xlsx', (req, res) => {
  const { division } = req.params;
  const divisionLower = division.toLowerCase();
  
  // Get the actual filename from the map, or try common patterns
  let fileName = DIVISION_FILE_MAP[divisionLower];
  
  if (!fileName) {
    // Try different naming patterns if not in map
    const possibleNames = [
      `financials -${divisionLower}.xlsx`,
      `financials - ${divisionLower}.xlsx`,
      `financials-${divisionLower}.xlsx`
    ];
    
    const dataDir = path.join(__dirname, '..', 'data');
    for (const name of possibleNames) {
      const testPath = path.join(dataDir, name);
      if (fs.existsSync(testPath)) {
        fileName = name;
        break;
      }
    }
  }
  
  if (!fileName) {
    logger.error('Excel file not found for division', { division });
    return res.status(404).json({ 
      success: false, 
      error: `No financial data file found for division ${division}` 
    });
  }
  
  const filePath = path.join(__dirname, '..', 'data', fileName);
  
  logger.info('Excel file requested', { division, fileName, filePath });
  
  // Check if file exists before attempting download
  if (!fs.existsSync(filePath)) {
    logger.error('Excel file does not exist', { division, filePath });
    return res.status(404).json({ 
      success: false, 
      error: `Financial data file not found: ${fileName}` 
    });
  }
  
  res.download(filePath, `financials-${divisionLower}.xlsx`, (err) => {
    if (err) {
      logger.error('Error downloading Excel file', { division, error: err.message });
      res.status(404).json({ success: false, error: 'File download failed' });
    }
  });
});

// GET /financials-fp.xlsx - Download FP Excel file (legacy route)
router.get('/financials-fp.xlsx', (req, res) => {
  const filePath = path.join(__dirname, '..', 'data', 'financials -fp.xlsx');
  res.download(filePath, 'financials-fp.xlsx');
});

// GET /excel-data - Get Excel data information
router.get('/excel-data', (req, res) => {
  res.json({ success: true, message: 'Excel data endpoint' });
});

module.exports = router;
