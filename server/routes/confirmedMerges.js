/**
 * Confirmed Customer Merges Routes
 * Handles confirmed customer merge groups
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CONFIRMED_MERGES_PATH = path.join(__dirname, '..', 'data', 'confirmed-merges.json');

// Helper to read confirmed merges
function readConfirmedMerges() {
  try {
    if (!fs.existsSync(CONFIRMED_MERGES_PATH)) {
      return [];
    }
    const data = fs.readFileSync(CONFIRMED_MERGES_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error('Error reading confirmed merges', { error: error.message });
    return [];
  }
}

// Helper to write confirmed merges
function writeConfirmedMerges(merges) {
  try {
    fs.writeFileSync(CONFIRMED_MERGES_PATH, JSON.stringify(merges, null, 2), 'utf8');
    logger.info('Confirmed merges saved successfully');
  } catch (error) {
    logger.error('Error writing confirmed merges', { error: error.message });
    throw error;
  }
}

// GET / - Get all confirmed merges
router.get('/', (req, res) => {
  try {
    const merges = readConfirmedMerges();
    res.json({ success: true, data: merges });
  } catch (error) {
    logger.error('Error fetching confirmed merges', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch confirmed merges' });
  }
});

// POST / - Create a new confirmed merge
router.post('/', (req, res) => {
  try {
    const { group } = req.body;
    
    if (!Array.isArray(group) || group.length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Group must be an array of at least 2 customer names' 
      });
    }
    
    const merges = readConfirmedMerges();
    const sortedGroup = [...group].sort();
    
    // Check if this merge already exists
    if (!merges.some(g => JSON.stringify(g) === JSON.stringify(sortedGroup))) {
      merges.push(sortedGroup);
      writeConfirmedMerges(merges);
      logger.info('Confirmed merge added', { group: sortedGroup });
    }
    
    res.json({ success: true, message: 'Merge confirmed and saved' });
  } catch (error) {
    logger.error('Error creating confirmed merge', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create confirmed merge' });
  }
});

// PUT / - Update all confirmed merges (typically for deletion)
router.put('/', (req, res) => {
  try {
    const { merges } = req.body;
    
    if (!Array.isArray(merges)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Merges must be an array' 
      });
    }
    
    writeConfirmedMerges(merges);
    logger.info('Confirmed merges updated', { count: merges.length });
    
    res.json({ success: true, message: 'Merges updated successfully' });
  } catch (error) {
    logger.error('Error updating confirmed merges', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update confirmed merges' });
  }
});

module.exports = router;
