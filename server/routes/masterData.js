/**
 * Master Data Routes (Legacy)
 * Handles master data operations for material percentages and product groups
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const MASTER_DATA_FILE_PATH = path.join(__dirname, '..', 'data', 'master-data.json');

// Load master data from file
function loadMasterData() {
  try {
    if (fs.existsSync(MASTER_DATA_FILE_PATH)) {
      const data = fs.readFileSync(MASTER_DATA_FILE_PATH, 'utf8');
      return JSON.parse(data);
    }
    return getDefaultMasterData();
  } catch (error) {
    logger.error('Error loading master data', { error: error.message });
    return getDefaultMasterData();
  }
}

// Save master data to file
function saveMasterData(data) {
  try {
    fs.writeFileSync(MASTER_DATA_FILE_PATH, JSON.stringify(data, null, 2));
    logger.info('Master data saved successfully');
    return true;
  } catch (error) {
    logger.error('Error saving master data', { error: error.message });
    return false;
  }
}

// Default master data structure
function getDefaultMasterData() {
  return {
    FP: {
      'Commercial Items Plain': { PE: 100, BOPP: 0, PET: 0, Alu: 0, Paper: 0, 'PVC/PET': 0 },
      'Commercial Items Printed': { PE: 100, BOPP: 0, PET: 0, Alu: 0, Paper: 0, 'PVC/PET': 0 },
      'Industrial Items Plain': { PE: 100, BOPP: 0, PET: 0, Alu: 0, Paper: 0, 'PVC/PET': 0 },
      'Industrial Items Printed': { PE: 100, BOPP: 0, PET: 0, Alu: 0, Paper: 0, 'PVC/PET': 0 },
      'Laminates': { PE: 50, BOPP: 5, PET: 15, Alu: 20, Paper: 10, 'PVC/PET': 0 },
      'Mono Film Printed': { PE: 40, BOPP: 5, PET: 0, Alu: 0, Paper: 55, 'PVC/PET': 0 },
      'Shrink Film Plain': { PE: 100, BOPP: 0, PET: 0, Alu: 0, Paper: 0, 'PVC/PET': 0 },
      'Shrink Film Printed': { PE: 100, BOPP: 0, PET: 0, Alu: 0, Paper: 0, 'PVC/PET': 0 },
      'Shrink Sleeves': { PE: 0, BOPP: 0, PET: 0, Alu: 0, Paper: 0, 'PVC/PET': 100 },
      'Wide Film': { PE: 100, BOPP: 0, PET: 0, Alu: 0, Paper: 0, 'PVC/PET': 0 },
      'Labels': { PE: 0, BOPP: 100, PET: 0, Alu: 0, Paper: 0, 'PVC/PET': 0 },
      'Services Charges': { PE: 0, BOPP: 0, PET: 0, Alu: 0, Paper: 0, 'PVC/PET': 0 }
    },
    HC: {
      'Preforms': { PE: 0, BOPP: 0, PET: 100, Alu: 0, Paper: 0, 'PVC/PET': 0 },
      'Closures': { PE: 100, BOPP: 0, PET: 0, Alu: 0, Paper: 0, 'PVC/PET': 0 }
    }
  };
}

// GET / - Get master data
router.get('/', (req, res) => {
  try {
    const masterData = loadMasterData();
    res.json({ success: true, data: masterData });
  } catch (error) {
    logger.error('Error retrieving master data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve master data' });
  }
});

// POST / - Save master data
router.post('/', (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ success: false, error: 'Master data is required' });
    }
    
    const success = saveMasterData(data);
    
    if (success) {
      res.json({ success: true, message: 'Master data saved successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save master data' });
    }
  } catch (error) {
    logger.error('Error saving master data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save master data' });
  }
});

// GET /sales-data - Get sales data for country reference
router.get('/sales-data', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const salesFilePath = path.join(__dirname, '..', 'data', 'Sales.xlsx');
    
    if (!fs.existsSync(salesFilePath)) {
      return res.json({ success: true, data: [] });
    }

    const workbook = XLSX.readFile(salesFilePath);
    const salesData = [];
    
    workbook.SheetNames.forEach(sheetName => {
      try {
        const worksheet = workbook.Sheets[sheetName];
        let data, rawData;
        
        if (sheetName.includes('-Countries')) {
          data = XLSX.utils.sheet_to_json(worksheet);
          rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        } else {
          data = XLSX.utils.sheet_to_json(worksheet);
        }
        
        salesData.push({
          sheetName: sheetName,
          data: data,
          rawData: rawData
        });
      } catch (sheetError) {
        logger.error('Error processing sheet', { sheetName, error: sheetError.message });
      }
    });
    
    res.json({ success: true, data: salesData });
    
  } catch (error) {
    logger.error('Error retrieving sales data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve sales data' });
  }
});

module.exports = router;
