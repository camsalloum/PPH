/**
 * FP Division Master Data Routes
 * Handles product groups, pricing, material percentages for FP division
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const fpDataService = require('../database/FPDataService');
const productPricingRoundingService = require('../database/ProductPricingRoundingService');
const productGroupService = require('../services/productGroupService');
const ProductGroupMasterService = require('../services/ProductGroupMasterService');
const { authenticate, requireRole } = require('../middleware/auth');

// Use cached sales rep config instead of reading file on every request
const { loadSalesRepConfig } = require('../utils/salesRepConfigCache');

// PostgreSQL pool for fp_actualcommon - use shared database config
const { pool: fpRawPool } = require('../database/config');

// Helper to get raw divisions from divisions table
async function getRawDivisions(divisionCode) {
  try {
    const result = await fpRawPool.query(
      'SELECT raw_divisions FROM divisions WHERE division_code = $1',
      [divisionCode.toUpperCase()]
    );
    
    if (result.rows.length === 0) {
      logger.warn(`Division ${divisionCode} not found in divisions table`);
      return [divisionCode.toUpperCase()];
    }
    
    return result.rows[0].raw_divisions || [divisionCode.toUpperCase()];
  } catch (error) {
    logger.error('Error fetching raw divisions', { error: error.message });
    return [divisionCode.toUpperCase()];
  }
}

// GET /sales-reps - Get all sales reps from FP database
router.get('/sales-reps', async (req, res) => {
  try {
    const salesReps = await fpDataService.getSalesReps();
    res.json({ success: true, data: salesReps });
  } catch (error) {
    logger.error('Error fetching FP sales reps', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales reps' });
  }
});

// GET /master-data/test - Test master data connection
router.get('/master-data/test', async (req, res) => {
  try {
    const result = await fpDataService.testMasterDataConnection();
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('FP master data test failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Master data connection test failed' });
  }
});

// GET /master-data/product-groups - Get all product groups
router.get('/master-data/product-groups', async (req, res) => {
  try {
    const productGroups = await fpDataService.getProductGroups();
    res.json({ success: true, data: productGroups });
  } catch (error) {
    logger.error('Error fetching FP product groups', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch product groups' });
  }
});

// GET /master-data/product-pricing-years - Get available pricing years
router.get('/master-data/product-pricing-years', async (req, res) => {
  try {
    const years = await fpDataService.getProductGroupPricingYears();
    res.json({ success: true, data: years });
  } catch (error) {
    logger.error('Error fetching FP pricing years', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch pricing years' });
  }
});

// GET /master-data/product-pricing - Get product pricing data
router.get('/master-data/product-pricing', async (req, res) => {
  try {
    const { year } = req.query;
    const pricing = await fpDataService.getProductGroupPricingAverages(year);
    res.json({ success: true, data: pricing });
  } catch (error) {
    logger.error('Error fetching FP product pricing', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch product pricing' });
  }
});

// GET /master-data/product-pricing-rounded - Get rounded pricing data
router.get('/master-data/product-pricing-rounded', async (req, res) => {
  try {
    const { year } = req.query;
    const roundedPricing = await productPricingRoundingService.getRoundedPrices('FP', year);
    res.json({ success: true, data: roundedPricing });
  } catch (error) {
    logger.error('Error fetching FP rounded pricing', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch rounded pricing' });
  }
});

// POST /master-data/product-pricing-rounded - Save rounded pricing data
router.post('/master-data/product-pricing-rounded', async (req, res) => {
  try {
    const { year, roundedData } = req.body;
    
    if (!year || !roundedData) {
      return res.status(400).json({ success: false, error: 'Year and rounded data are required' });
    }
    
    await productPricingRoundingService.saveRoundedPrices('FP', year, roundedData);
    logger.info('FP rounded pricing saved', { year });
    
    res.json({ success: true, message: 'Rounded pricing saved successfully' });
  } catch (error) {
    logger.error('Error saving FP rounded pricing', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save rounded pricing' });
  }
});

// GET /master-data/material-percentages - Get material percentages
router.get('/master-data/material-percentages', async (req, res) => {
  try {
    const percentages = await fpDataService.getMaterialPercentages();
    res.json({ success: true, data: percentages });
  } catch (error) {
    logger.error('Error fetching FP material percentages', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch material percentages' });
  }
});

// POST /master-data/material-percentages - Save material percentages
// Handles two formats:
// 1. Single: { productGroup, percentages: {PE:..., PP:...}, material, process }
// 2. Bulk: { percentages: [{productGroup, pe, bopp, ...}, ...] }
router.post('/master-data/material-percentages', async (req, res) => {
  try {
    const { productGroup, percentages, material, process } = req.body;
    
    // Single product group save (from MaterialPercentageManager)
    if (productGroup && percentages && !Array.isArray(percentages)) {
      logger.info('Saving material percentages for:', { productGroup, percentages, material, process });
      const result = await fpDataService.saveMaterialPercentage(productGroup, percentages, material || '', process || '');
      logger.info('FP material percentage saved successfully for:', productGroup);
      return res.json({ success: true, message: 'Material percentage saved successfully', data: result });
    }
    
    // Bulk save (array of percentages)
    if (percentages && Array.isArray(percentages)) {
      await fpDataService.saveMaterialPercentages(percentages);
      logger.info('FP material percentages saved (bulk)');
      return res.json({ success: true, message: 'Material percentages saved successfully' });
    }
    
    return res.status(400).json({ success: false, error: 'Invalid request format. Provide productGroup with percentages, or array of percentages.' });
  } catch (error) {
    logger.error('Error saving FP material percentages', { error: error.message, stack: error.stack, body: req.body });
    res.status(500).json({ success: false, error: 'Failed to save material percentages', details: error.message });
  }
});

// ============================================
// UNIFIED PRODUCT GROUP MASTER ROUTES (NEW)
// ============================================

// GET /master-data/product-group-master - Get unified product group master data
router.get('/master-data/product-group-master', async (req, res) => {
  try {
    const division = req.query.division || 'FP';
    const data = await ProductGroupMasterService.getProductGroupMaster(division);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching product group master data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch product group master data' });
  }
});

// POST /master-data/product-group-master - Save unified product group master data
router.post('/master-data/product-group-master', async (req, res) => {
  try {
    const { division = 'FP', productGroup, data } = req.body;
    
    if (!productGroup || !data) {
      return res.status(400).json({ success: false, error: 'productGroup and data are required' });
    }
    
    const result = await ProductGroupMasterService.saveProductGroupMaster(division, productGroup, data);
    logger.info('Product group master data saved', { division, productGroup });
    res.json({ success: true, data: result, message: 'Product group master data saved successfully' });
  } catch (error) {
    logger.error('Error saving product group master data', { error: error.message });
    res.status(500).json({ success: false, error: error.message || 'Failed to save product group master data' });
  }
});

// POST /master-data/material-columns - Add new material column (with ALTER TABLE)
router.post('/master-data/material-columns', async (req, res) => {
  try {
    const { division = 'FP', columnCode, displayName, defaultValue = 0 } = req.body;
    
    if (!columnCode || !displayName) {
      return res.status(400).json({ success: false, error: 'columnCode and displayName are required' });
    }
    
    const result = await ProductGroupMasterService.addMaterialColumn(division, {
      columnCode,
      displayName,
      defaultValue
    });
    
    logger.info('Material column added', { division, columnCode });
    res.json({ success: true, message: `Column ${columnCode} added successfully`, data: result });
  } catch (error) {
    logger.error('Error adding material column', { error: error.message });
    res.status(500).json({ success: false, error: error.message || 'Failed to add material column' });
  }
});

// DELETE /master-data/material-columns/:code - Remove material column
router.delete('/master-data/material-columns/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { division = 'FP', hardDelete = false } = req.query;
    
    const result = await ProductGroupMasterService.removeMaterialColumn(division, code, hardDelete === 'true');
    logger.info('Material column removed', { division, code, hardDelete });
    res.json({ success: true, message: `Column ${code} removed successfully`, data: result });
  } catch (error) {
    logger.error('Error removing material column', { error: error.message });
    res.status(500).json({ success: false, error: error.message || 'Failed to remove material column' });
  }
});

// POST /master-data/product-group-master-rounded - Save rounded pricing to unified master table
router.post('/master-data/product-group-master-rounded', async (req, res) => {
  try {
    const { division = 'FP', year, roundedData } = req.body;
    
    if (!year || !roundedData) {
      return res.status(400).json({ success: false, error: 'Year and rounded data are required' });
    }
    
    const result = await ProductGroupMasterService.saveRoundedPricing(division, year, roundedData);
    logger.info('Rounded pricing saved to unified master table', { division, year, count: roundedData.length });
    
    res.json({ success: true, message: 'Rounded pricing saved successfully', data: result });
  } catch (error) {
    logger.error('Error saving rounded pricing', { error: error.message });
    res.status(500).json({ success: false, error: error.message || 'Failed to save rounded pricing' });
  }
});

// POST /master-data/refresh-actual-pricing - Refresh actual pricing from fp_actualcommon
router.post('/master-data/refresh-actual-pricing', async (req, res) => {
  try {
    const { division = 'FP', year } = req.body;
    
    const result = await ProductGroupMasterService.refreshActualPricing(division, year);
    logger.info('Actual pricing refreshed', { division, year });
    res.json({ success: true, message: 'Actual pricing refreshed successfully', data: result });
  } catch (error) {
    logger.error('Error refreshing actual pricing', { error: error.message });
    res.status(500).json({ success: false, error: error.message || 'Failed to refresh actual pricing' });
  }
});

// GET /master-data/material-columns - Get active material columns
router.get('/master-data/material-columns', async (req, res) => {
  try {
    const division = req.query.division || 'FP';
    const columns = await ProductGroupMasterService.getMaterialColumns(division);
    res.json({ success: true, data: columns });
  } catch (error) {
    logger.error('Error fetching material columns', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch material columns' });
  }
});

// PUT /master-data/material-columns/:code - Update/rename material column
router.put('/master-data/material-columns/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { division = 'FP', newDisplayName, newColumnCode } = req.body;
    
    if (!newDisplayName) {
      return res.status(400).json({ success: false, error: 'newDisplayName is required' });
    }
    
    const result = await ProductGroupMasterService.updateMaterialColumn(division, code, {
      displayName: newDisplayName,
      columnCode: newColumnCode
    });
    
    logger.info('Material column updated', { division, code, newDisplayName });
    res.json({ success: true, message: `Column updated successfully`, data: result });
  } catch (error) {
    logger.error('Error updating material column', { error: error.message });
    res.status(500).json({ success: false, error: error.message || 'Failed to update material column' });
  }
});

// ============================================
// Raw Product Groups Routes
// ============================================

// GET /master-data/raw-product-groups - Get all raw product group mappings from auth database
router.get('/master-data/raw-product-groups', async (req, res) => {
  try {
    const divisionCode = req.query.division || 'FP';
    const mappings = await fpDataService.getRawProductGroupMappings(divisionCode);
    res.json({ success: true, data: mappings });
  } catch (error) {
    logger.error('Error fetching raw product group mappings', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch raw product group mappings' });
  }
});

// GET /master-data/raw-product-groups/distinct - Get distinct raw product groups from data
router.get('/master-data/raw-product-groups/distinct', async (req, res) => {
  try {
    const rawProductGroups = await fpDataService.getDistinctRawProductGroups();
    res.json({ success: true, data: rawProductGroups });
  } catch (error) {
    logger.error('Error fetching distinct raw product groups', { 
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch distinct raw product groups' });
  }
});

// GET /master-data/raw-product-groups/combined - Get all raw product group setup data in one request
router.get('/master-data/raw-product-groups/combined', async (req, res) => {
  try {
    const divisionCode = (req.query.division || 'FP').toUpperCase();
    const [distinct, mappings, overrides] = await Promise.all([
      fpDataService.getDistinctRawProductGroups(divisionCode),
      fpDataService.getRawProductGroupMappings(divisionCode),
      fpDataService.getItemGroupOverrides()
    ]);

    res.json({
      success: true,
      data: {
        distinct,
        mappings,
        overrides
      }
    });
  } catch (error) {
    logger.error('Error fetching combined raw product group data', {
      error: error.message
    });
    res.status(500).json({ success: false, error: 'Failed to fetch raw product group data' });
  }
});

// GET /master-data/pg-combine-options - Get available PGCombine options from material percentages
router.get('/master-data/pg-combine-options', async (req, res) => {
  try {
    const options = await fpDataService.getPGCombineOptions();
    res.json({ success: true, data: options });
  } catch (error) {
    logger.error('Error fetching PGCombine options', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch PGCombine options' });
  }
});

// POST /master-data/raw-product-groups - Save raw product group mapping(s)
router.post('/master-data/raw-product-groups', async (req, res) => {
  try {
    const { rawProductGroup, pgCombine, mappings } = req.body;
    
    // Single mapping save
    if (rawProductGroup) {
      const result = await fpDataService.saveRawProductGroupMapping(rawProductGroup, pgCombine || null);
      logger.info('Raw product group mapping saved', { rawProductGroup, pgCombine });
      return res.json({ success: true, data: result, message: 'Mapping saved successfully' });
    }
    
    // Bulk mappings save
    if (mappings && Array.isArray(mappings)) {
      const results = await fpDataService.saveRawProductGroupMappings(mappings);
      logger.info('Raw product group mappings saved (bulk)', { count: mappings.length });
      return res.json({ success: true, data: results, message: `${mappings.length} mappings saved successfully` });
    }
    
    return res.status(400).json({ success: false, error: 'Provide rawProductGroup or mappings array' });
  } catch (error) {
    logger.error('Error saving raw product group mapping', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save raw product group mapping' });
  }
});

// POST /master-data/raw-product-groups/save-and-sync - Save mappings to auth database and sync PGCombines to material percentages
// Admin only - requires authentication and admin role
router.post('/master-data/raw-product-groups/save-and-sync', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { mappings, pgCombines, division } = req.body;
    const divisionCode = division || 'FP';
    
    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({ success: false, error: 'Mappings array is required' });
    }
    
    // Add user info to mappings for audit trail
    const mappingsWithUser = mappings.map(m => ({
      ...m,
      createdBy: req.user?.email || 'system',
      updatedBy: req.user?.email || 'system'
    }));
    
    // Save all mappings to auth database (including is_unmapped flag)
    const mappingResults = await fpDataService.saveRawProductGroupMappings(mappingsWithUser, divisionCode);
    logger.info('Raw product group mappings saved to auth database', { 
      count: mappings.length, 
      division: divisionCode, 
      user: req.user?.email 
    });
    
    // Clear product group service cache after mappings change
    productGroupService.clearCache(divisionCode);
    
    // Only sync PGCombines that are NOT unmapped
    // Filter out pgCombines from unmapped entries
    const unmappedRawPGs = new Set(
      mappings.filter(m => m.isUnmapped === true).map(m => m.rawProductGroup)
    );
    
    // Get PGCombines from mapped entries only
    const mappedPGCombines = pgCombines?.filter(pg => {
      // Check if this pgCombine is used by any mapped (not unmapped) entry
      return mappings.some(m => 
        m.pgCombine === pg && m.isUnmapped !== true
      );
    }) || [];
    
    if (mappedPGCombines.length > 0) {
      await fpDataService.syncPGCombinesToMaterialPercentages(mappedPGCombines);
      logger.info('PGCombines synced to material percentages', { count: mappedPGCombines.length });
    }
    
    // SYNC EXCLUSIONS: Update fp_product_group_exclusions table in division database
    // Add product groups that are marked as unmapped (isUnmapped = true)
    // Remove product groups that are no longer marked as unmapped
    // IMPORTANT: Use exact case from mappings to match data case
    try {
      const divisionPool = require('../utils/divisionDatabaseHelper').getPoolForDivision(divisionCode.toUpperCase());
      const tables = require('./aebf/shared').getTableNames(divisionCode.toUpperCase());
      
      // Get all unmapped product groups (these should be excluded)
      // Use the exact pg_combine value from mappings (proper case)
      const excludedPGCombines = mappings
        .filter(m => m.isUnmapped === true && m.pgCombine && m.pgCombine.trim())
        .map(m => m.pgCombine.trim()); // Keep original case from user input
      
      // Get all mapped product groups (these should NOT be excluded)
      const includedPGCombines = mappings
        .filter(m => m.isUnmapped !== true && m.pgCombine && m.pgCombine.trim())
        .map(m => m.pgCombine.trim()); // Keep original case
      
      // Ensure exclusions table exists
      await divisionPool.query(`
        CREATE TABLE IF NOT EXISTS ${tables.productGroupExclusions} (
          id SERIAL PRIMARY KEY,
          division_code VARCHAR(10) NOT NULL,
          product_group VARCHAR(255) NOT NULL,
          reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(division_code, product_group)
        )
      `);
      
      // Remove exclusions for product groups that are now mapped (included)
      // Use case-insensitive comparison for removal
      if (includedPGCombines.length > 0) {
        await divisionPool.query(`
          DELETE FROM ${tables.productGroupExclusions}
          WHERE UPPER(division_code) = UPPER($1)
            AND UPPER(product_group) = ANY($2::text[])
        `, [divisionCode, includedPGCombines.map(pg => pg.toUpperCase())]);
        logger.info(`Removed ${includedPGCombines.length} exclusions (now mapped)`, { division: divisionCode });
      }
      
      // Add exclusions for product groups that are marked as unmapped
      // Store in exact case from mappings
      if (excludedPGCombines.length > 0) {
        for (const pg of excludedPGCombines) {
          await divisionPool.query(`
            INSERT INTO ${tables.productGroupExclusions} 
              (division_code, product_group, reason, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (division_code, product_group) 
            DO UPDATE SET 
              reason = $3,
              updated_at = CURRENT_TIMESTAMP
          `, [divisionCode, pg, 'Excluded from Raw Product Groups mapping']);
        }
        logger.info(`✅ Synced ${excludedPGCombines.length} product group exclusions`, { division: divisionCode, excluded: excludedPGCombines });
      }
      
    } catch (exclusionErr) {
      logger.error('Failed to sync product group exclusions:', exclusionErr.message);
      // Don't fail the whole request, just log the error
    }
    
    // SYNC: Update unified product group table
    try {
      const pool = require('../db');
      await pool.query('SELECT * FROM sync_product_groups_complete()');
      logger.info('🔄 Unified product group table synced');
    } catch (syncErr) {
      logger.warn('Failed to sync unified table (run POST /api/unified/sync-product-groups):', syncErr.message);
    }
    
    return res.json({ 
      success: true, 
      message: `${mappings.length} mappings saved. ${mappedPGCombines.length} PGCombines synced (${mappings.filter(m => m.isUnmapped).length} unmapped).`,
      data: { mappings: mappingResults.length, pgCombines: mappedPGCombines.length }
    });
  } catch (error) {
    logger.error('Error saving and syncing raw product groups', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save and sync' });
  }
});

// DELETE /master-data/raw-product-groups/:id - Delete a raw product group mapping (admin only)
router.delete('/master-data/raw-product-groups/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await fpDataService.deleteRawProductGroupMapping(id);
    
    if (result) {
      logger.info('Raw product group mapping deleted from auth database', { 
        id, 
        user: req.user?.email 
      });
      res.json({ success: true, message: 'Mapping deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Mapping not found' });
    }
  } catch (error) {
    logger.error('Error deleting raw product group mapping', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete raw product group mapping' });
  }
});

// POST /master-data/pg-combine - Add a new PGCombine to material percentages
router.post('/master-data/pg-combine', async (req, res) => {
  try {
    const { pgCombine, material, process } = req.body;
    
    if (!pgCombine) {
      return res.status(400).json({ success: false, error: 'pgCombine is required' });
    }
    
    const result = await fpDataService.addPGCombine(pgCombine, material || '', process || '');
    
    if (result) {
      logger.info('New PGCombine added', { pgCombine, material, process });
      res.json({ success: true, data: result, message: 'PGCombine added successfully' });
    } else {
      res.json({ success: true, message: 'PGCombine already exists' });
    }
  } catch (error) {
    logger.error('Error adding PGCombine', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to add PGCombine' });
  }
});

// POST /master-data/initialize - Initialize master data tables
router.post('/master-data/initialize', async (req, res) => {
  try {
    await fpDataService.initializeMasterDataTables();
    logger.info('FP master data tables initialized');
    
    res.json({ success: true, message: 'Master data tables initialized successfully' });
  } catch (error) {
    logger.error('Error initializing FP master data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to initialize master data tables' });
  }
});

// ============================================
// Item Group Description Override Routes
// ============================================

// GET /master-data/item-group-overrides - Get all item group description overrides
router.get('/master-data/item-group-overrides', async (req, res) => {
  try {
    const overrides = await fpDataService.getItemGroupOverrides();
    res.json({ success: true, data: overrides });
  } catch (error) {
    logger.error('Error fetching item group overrides', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch item group overrides' });
  }
});

// POST /master-data/item-group-overrides - Save an item group description override
router.post('/master-data/item-group-overrides', async (req, res) => {
  try {
    const { itemGroupDescription, pgCombine, originalProductGroup } = req.body;
    
    if (!itemGroupDescription || !pgCombine) {
      return res.status(400).json({ success: false, error: 'itemGroupDescription and pgCombine are required' });
    }
    
    const result = await fpDataService.saveItemGroupOverride(itemGroupDescription, pgCombine, originalProductGroup);
    
    logger.info('Item group override saved', { itemGroupDescription, pgCombine });
    res.json({ success: true, data: result, message: `"${itemGroupDescription}" remapped to "${pgCombine}"` });
  } catch (error) {
    logger.error('Error saving item group override', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save item group override' });
  }
});

// DELETE /master-data/item-group-overrides/:itemGroupDescription - Delete an item group override
router.delete('/master-data/item-group-overrides/:itemGroupDescription', async (req, res) => {
  try {
    const itemGroupDescription = decodeURIComponent(req.params.itemGroupDescription);
    const result = await fpDataService.deleteItemGroupOverride(itemGroupDescription);
    
    if (result) {
      logger.info('Item group override deleted', { itemGroupDescription });
      res.json({ success: true, message: 'Override removed - item will use default mapping' });
    } else {
      res.status(404).json({ success: false, error: 'Override not found' });
    }
  } catch (error) {
    logger.error('Error deleting item group override', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete item group override' });
  }
});

// GET /product-groups - Get FP product groups with sales data
router.get('/product-groups', async (req, res) => {
  try {
    const productGroups = await fpDataService.getProductGroupsWithSales();
    res.json({ success: true, data: productGroups });
  } catch (error) {
    logger.error('Error fetching FP product groups with sales', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch product groups' });
  }
});

// GET /sales-data - Get FP sales data
router.get('/sales-data', async (req, res) => {
  try {
    const salesData = await fpDataService.getSalesData(req.query);
    res.json({ success: true, data: salesData });
  } catch (error) {
    logger.error('Error fetching FP sales data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales data' });
  }
});

// GET /sales-reps-from-db - Get sales reps from database
router.get('/sales-reps-from-db', async (req, res) => {
  try {
    const salesReps = await fpDataService.getSalesRepsFromDB();
    res.json({ success: true, data: salesReps });
  } catch (error) {
    logger.error('Error fetching FP sales reps from DB', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales reps' });
  }
});

// Budget structure cutoff year - starting from this year, budget data uses separate tables
const BUDGET_CUTOFF_YEAR = 2025;

// POST /sales-rep-dashboard - Get sales rep dashboard data
router.post('/sales-rep-dashboard', async (req, res) => {
  try {
    const { salesRep, valueTypes = ['KGS', 'Amount'], periods = [] } = req.body;
    
    logger.info('Sales rep dashboard request', { salesRep, valueTypes, periodCount: periods.length });
    
    if (!salesRep) {
      return res.status(400).json({ 
        success: false, 
        error: 'salesRep is required' 
      });
    }
    
    const config = loadSalesRepConfig();
    const fpConfig = config.FP || { groups: {} };
    
    // Check if this is a division-level query (not a specific sales rep or group)
    const isDivisionLevel = salesRep === 'FP Division' || salesRep === 'FP' || salesRep === 'All';
    
    logger.info('Query type', { isDivisionLevel, isGroup: !!(fpConfig.groups && fpConfig.groups[salesRep]) });
    
    let productGroups;
    
    if (isDivisionLevel) {
      // Division-level query: get all product groups
      productGroups = await fpDataService.getProductGroups();
    } else if (fpConfig.groups && fpConfig.groups[salesRep]) {
      const groupMembers = fpConfig.groups[salesRep];
      const allProductGroups = new Set();
      
      for (const member of groupMembers) {
        try {
          const memberProductGroups = await fpDataService.getProductGroupsBySalesRep(member);
          memberProductGroups.forEach(pg => allProductGroups.add(pg));
        } catch (memberError) {
          logger.warn('Failed to fetch product groups for member', { member, error: memberError.message });
        }
      }
      productGroups = Array.from(allProductGroups);
    } else {
      productGroups = await fpDataService.getProductGroupsBySalesRep(salesRep);
    }
    
    const dashboardData = {};
    
    for (const productGroup of productGroups) {
      dashboardData[productGroup] = {};
      
      for (const valueType of valueTypes) {
        dashboardData[productGroup][valueType] = {};
        
        for (const period of periods) {
          const { year, month, type = 'Actual' } = period;
          
          let salesData;
          
          // For Budget type with year >= BUDGET_CUTOFF_YEAR at division level, use divisional budget
          const isBudgetType = type.toUpperCase() === 'BUDGET';
          
          if (isDivisionLevel) {
            // Division-level query: aggregate all sales reps or use divisional budget
            if (isBudgetType && year >= BUDGET_CUTOFF_YEAR) {
              // Use fp_budget_unified for 2026+ Budget
              salesData = await fpDataService.getDivisionalBudgetData(productGroup, valueType, year, month);
            } else {
              // Aggregate from fp_actualcommon for Actual or pre-2026 Budget
              salesData = await fpDataService.getBudgetByProductGroup(productGroup, valueType, year, month);
              // For Actual type, we need a different method - aggregate all sales reps
              if (!isBudgetType) {
                salesData = await fpDataService.getAggregatedActualData(productGroup, valueType, year, month);
              }
            }
          } else if (fpConfig.groups && fpConfig.groups[salesRep]) {
            const groupMembers = fpConfig.groups[salesRep];
            salesData = await fpDataService.getSalesDataForGroup(groupMembers, productGroup, valueType, year, month, type);
          } else {
            salesData = await fpDataService.getSalesDataByValueType(salesRep, productGroup, valueType, year, month, type);
          }
          
          dashboardData[productGroup][valueType][`${year}-${month}-${type}`] = salesData;
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        salesRep,
        productGroups,
        dashboardData,
        isGroup: !!(fpConfig.groups && fpConfig.groups[salesRep]),
        isDivisionLevel
      }
    });
    
  } catch (error) {
    logger.error('Error fetching FP sales rep dashboard', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

// POST /customer-dashboard - Get customer dashboard data
router.post('/customer-dashboard', async (req, res) => {
  try {
    const { salesRep, periods = [] } = req.body;
    
    if (!salesRep) {
      return res.status(400).json({ 
        success: false, 
        error: 'salesRep is required' 
      });
    }
    
    const config = loadSalesRepConfig();
    const fpConfig = config.FP || { groups: {} };
    
    let customers;
    
    if (fpConfig.groups && fpConfig.groups[salesRep]) {
      const groupMembers = fpConfig.groups[salesRep];
      const allCustomers = new Set();
      
      for (const member of groupMembers) {
        try {
          const memberCustomers = await fpDataService.getCustomersBySalesRep(member);
          memberCustomers.forEach(c => allCustomers.add(c));
        } catch (memberError) {
          logger.warn('Failed to fetch customers for member', { member, error: memberError.message });
        }
      }
      customers = Array.from(allCustomers);
    } else {
      customers = await fpDataService.getCustomersBySalesRep(salesRep);
    }
    
    const dashboardData = {};
    
    for (const customer of customers) {
      dashboardData[customer] = {};
      
      for (const period of periods) {
        const { year, month, type = 'Actual' } = period;
        
        let salesData;
        if (fpConfig.groups && fpConfig.groups[salesRep]) {
          const groupMembers = fpConfig.groups[salesRep];
          salesData = 0;
          for (const member of groupMembers) {
            const memberData = await fpDataService.getCustomerSalesDataByValueType(member, customer, 'KGS', year, month, type);
            salesData += memberData;
          }
        } else {
          salesData = await fpDataService.getCustomerSalesDataByValueType(salesRep, customer, 'KGS', year, month, type);
        }
        
        dashboardData[customer][`${year}-${month}-${type}`] = salesData;
      }
    }
    
    res.json({
      success: true,
      data: {
        salesRep,
        customers,
        dashboardData,
        isGroup: !!(fpConfig.groups && fpConfig.groups[salesRep])
      }
    });
    
  } catch (error) {
    logger.error('Error fetching FP customer dashboard', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

// POST /yearly-budget - Get yearly budget data
router.post('/yearly-budget', async (req, res) => {
  try {
    const { salesRep, year, valuesType, groupMembers } = req.body;
    logger.info(`📊 Yearly budget request: salesRep="${salesRep}", year=${year}, valuesType="${valuesType}"`);
    const budgetData = await fpDataService.getYearlyBudget(salesRep, year, valuesType, groupMembers);
    res.json({ success: true, data: budgetData });
  } catch (error) {
    logger.error('Error fetching FP yearly budget', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch budget data' });
  }
});

// POST /sales-by-country - Get sales by country
router.post('/sales-by-country', async (req, res) => {
  try {
    const salesData = await fpDataService.getSalesByCountry(req.body);
    res.json({ success: true, data: salesData });
  } catch (error) {
    logger.error('Error fetching FP sales by country', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales data' });
  }
});

// GET /countries - Get all countries
router.get('/countries', async (req, res) => {
  try {
    const countries = await fpDataService.getCountries();
    res.json({ success: true, data: countries });
  } catch (error) {
    logger.error('Error fetching FP countries', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch countries' });
  }
});

// GET /countries-by-sales-rep - Get countries filtered by sales rep
router.get('/countries-by-sales-rep', async (req, res) => {
  try {
    const { salesRep } = req.query;
    const countries = await fpDataService.getCountriesBySalesRep(salesRep);
    res.json({ success: true, data: countries });
  } catch (error) {
    logger.error('Error fetching FP countries by sales rep', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch countries' });
  }
});

// NOTE: /product-performance route is handled by fpPerformanceRoutes for comprehensive data

// GET /all-customers - Get all customers
router.get('/all-customers', async (req, res) => {
  try {
    const customers = await fpDataService.getAllCustomers();
    res.json({ success: true, data: customers });
  } catch (error) {
    logger.error('Error fetching FP customers', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch customers' });
  }
});

// GET /raw-data/years - Get available years from fp_actualcommon
router.get('/raw-data/years', async (req, res) => {
  try {
    const { division } = req.query;
    
    if (!division) {
      return res.status(400).json({ success: false, error: 'Division is required' });
    }
    
    // IMPORTANT: Use admin_division_code to include ALL Oracle divisions mapped to this admin division
    // e.g., FP admin division includes both Oracle 'FP' and 'BF' data
    const query = `
      SELECT DISTINCT year
      FROM fp_actualcommon
      WHERE UPPER(admin_division_code) = UPPER($1)
      AND year IS NOT NULL
      ORDER BY year DESC
    `;
    
    const result = await fpRawPool.query(query, [division.toUpperCase()]);
    const years = result.rows.map(row => row.year);
    
    res.json({ 
      success: true, 
      data: { years }
    });
  } catch (error) {
    logger.error('Error fetching years from fp_actualcommon', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch years' });
  }
});

// GET /raw-data/year-summary - Get year summary from fp_actualcommon
router.get('/raw-data/year-summary', async (req, res) => {
  try {
    const { division, year } = req.query;
    
    if (!division) {
      return res.status(400).json({ success: false, error: 'Division is required' });
    }
    
    // IMPORTANT: Use admin_division_code to include ALL Oracle divisions mapped to this admin division
    // e.g., FP admin division includes both Oracle 'FP' and 'BF' data
    let whereClause = 'WHERE UPPER(admin_division_code) = UPPER($1)';
    const params = [division.toUpperCase()];
    
    if (year) {
      whereClause += ' AND year = $2';
      params.push(parseInt(year));
    }
    
    const query = `
      SELECT 
        'AMOUNT' as values_type,
        COUNT(*) as record_count,
        COALESCE(SUM(amount), 0) as total_values
      FROM fp_actualcommon
      ${whereClause}
      
      UNION ALL
      
      SELECT 
        'KGS' as values_type,
        COUNT(*) as record_count,
        COALESCE(SUM(qty_kgs), 0) as total_values
      FROM fp_actualcommon
      ${whereClause}
      
      UNION ALL
      
      SELECT 
        'MORM' as values_type,
        COUNT(*) as record_count,
        COALESCE(SUM(morm), 0) as total_values
      FROM fp_actualcommon
      ${whereClause}
      
      ORDER BY values_type
    `;
    
    const result = await fpRawPool.query(query, params);
    
    res.json({ 
      success: true, 
      data: { summary: result.rows }
    });
  } catch (error) {
    logger.error('Error fetching year summary from fp_actualcommon', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch year summary' });
  }
});

// GET /raw-data/export - Export complete fp_actualcommon table to Excel (ALL columns dynamically)
router.get('/raw-data/export', async (req, res) => {
  try {
    const { division } = req.query;
    
    if (!division) {
      return res.status(400).json({ success: false, error: 'Division is required' });
    }
    
    // IMPORTANT: Use admin_division_code to include ALL Oracle divisions mapped to this admin division
    // e.g., FP admin division includes both Oracle 'FP' and 'BF' data
    
    // Get ALL columns dynamically from table structure (excluding internal metadata)
    const columnsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'fp_actualcommon' 
      AND column_name NOT IN ('id', 'created_at', 'updated_at')
      ORDER BY ordinal_position
    `;
    
    const columnsResult = await fpRawPool.query(columnsQuery);
    const columns = columnsResult.rows.map(row => row.column_name);
    
    // Build dynamic SELECT query with all columns
    const selectColumns = columns.join(', ');
    
    const dataQuery = `
      SELECT ${selectColumns}
      FROM fp_actualcommon
      WHERE UPPER(admin_division_code) = UPPER($1)
      ORDER BY year DESC, month_no DESC, customer_name
    `;
    
    const result = await fpRawPool.query(dataQuery, [division.toUpperCase()]);
    
    // Convert to Excel using XLSX
    const XLSX = require('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(result.rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, divisionName);
    
    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${division}_ActualData_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    logger.info(`Exported ${result.rows.length} rows with ${columns.length} columns for ${divisionName}`);
    
    res.send(buffer);
  } catch (error) {
    logger.error('Error exporting actual common data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to export data' });
  }
});

// POST /sync-oracle-excel - Sync data from Oracle Excel file to fp_raw_data
router.post('/sync-oracle-excel', async (req, res) => {
  try {
    logger.info('📥 Starting Oracle Excel sync to fp_raw_data (FAST mode)');
    
    const { spawn } = require('child_process');
    // Use FAST import script (disables trigger during import)
    const scriptPath = path.join(__dirname, '..', '..', 'import-excel-to-raw-fast.js');
    
    // Use spawn to capture real-time output
    const child = spawn('node', [scriptPath]);
    
    let stdout = '';
    let stderr = '';
    let lastProgress = '';
    
    // Stream stdout with progress updates
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      const output = data.toString();
      
      // Look for progress lines like: 📊 45.2% | 22,850/50,529 rows | 530 rows/sec
      const progressMatch = output.match(/📊\s+([\d.]+)%\s+\|.*?(\d+)\/(\d+)\s+rows/);
      if (progressMatch) {
        lastProgress = progressMatch[0];
      }
      
      logger.info('Import progress:', output.trim());
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      logger.error('Import stderr:', data.toString());
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        logger.error('Import script failed', { code, stderr });
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to sync data from Oracle',
          details: stderr || `Process exited with code ${code}`
        });
      }
      
      // Parse output to get row count
      const match = stdout.match(/Successful: (\d+) rows/);
      const inserted = match ? parseInt(match[1]) : 0;
      
      logger.info(`✅ Oracle Excel sync completed: ${inserted} rows`);
      res.json({ 
        success: true, 
        data: { 
          inserted,
          message: `Successfully synced ${inserted} rows from Oracle to fp_raw_data`
        }
      });
    });
    
    // Timeout after 5 minutes
    setTimeout(() => {
      if (!child.killed) {
        child.kill();
        logger.error('Import script timeout');
        res.status(500).json({ 
          success: false, 
          error: 'Import timeout - operation took too long'
        });
      }
    }, 300000);
    
  } catch (error) {
    logger.error('Error syncing Oracle Excel data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to sync data from Oracle' });
  }
});

// GET /sync-oracle-excel/progress - Get current sync progress (SSE endpoint)
router.get('/sync-oracle-excel/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const { mode = 'replace-all', year } = req.query;
  
  const { spawn } = require('child_process');
  // Use FAST import script (disables trigger during import)
  const scriptPath = path.join(__dirname, '..', '..', 'import-excel-to-raw-fast.js');
  
  // Pass mode and year as command line arguments
  const args = [scriptPath, mode];
  if (mode === 'update-year' && year) {
    args.push(year);
  }
  
  const child = spawn('node', args);
  
  child.stdout.on('data', (data) => {
    const output = data.toString();
    
    // Look for progress lines
    const progressMatch = output.match(/📊\s+([\d.]+)%\s+\|\s+([\d,]+)\/([\d,]+)\s+rows\s+\|\s+(\d+)\s+rows\/sec/);
    if (progressMatch) {
      const [, percentage, current, total, speed] = progressMatch;
      res.write(`data: ${JSON.stringify({ 
        type: 'progress',
        percentage: parseFloat(percentage),
        current: parseInt(current.replace(/,/g, '')),
        total: parseInt(total.replace(/,/g, '')),
        speed: parseInt(speed)
      })}\n\n`);
    }
  });
  
  child.on('close', (code) => {
    if (code === 0) {
      res.write(`data: ${JSON.stringify({ type: 'complete', code })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', code })}\n\n`);
    }
    res.end();
  });
  
  req.on('close', () => {
    if (!child.killed) {
      child.kill();
    }
  });
});

module.exports = router;
