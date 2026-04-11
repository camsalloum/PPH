/**
 * Global Configuration Routes
 * Handles standard configuration CRUD operations
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const GlobalConfigService = require('../database/GlobalConfigService');

const globalConfigService = new GlobalConfigService();

// GET / - Get all configuration
router.get('/', async (req, res) => {
  try {
    const config = await globalConfigService.getAllConfigs();
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('Error fetching all config', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch configuration' });
  }
});

// POST / - Create or update configuration
router.post('/', async (req, res) => {
  try {
    // Accept both 'value' and 'data' for backwards compatibility
    const { key, value, data, value_type, description } = req.body;
    const configValue = value !== undefined ? value : data;
    
    if (!key) {
      return res.status(400).json({ success: false, error: 'Key is required' });
    }
    
    // Allow value to be 0 (valid base period index) or empty array
    if (configValue === undefined || configValue === null) {
      return res.status(400).json({ success: false, error: 'Key and value/data are required' });
    }
    
    await globalConfigService.setConfig(key, configValue, value_type, description);
    logger.info('Config updated', { key });
    
    res.json({ success: true, message: 'Configuration saved successfully' });
  } catch (error) {
    logger.error('Error saving config', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save configuration' });
  }
});

// GET /:key - Get specific configuration value
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const result = await globalConfigService.getConfig(key);
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Configuration key not found' });
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error fetching config', { key: req.params.key, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch configuration' });
  }
});

// DELETE /:key - Delete configuration
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    await globalConfigService.deleteConfig(key);
    logger.info('Config deleted', { key });
    
    res.json({ success: true, message: 'Configuration deleted successfully' });
  } catch (error) {
    logger.error('Error deleting config', { key: req.params.key, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete configuration' });
  }
});

module.exports = router;
