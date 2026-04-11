/**
 * Product Groups Routes
 * Handles product group data retrieval
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const ProductGroupDataService = require('../database/ProductGroupDataService');

// GET /fp - Get product group data for FP division
router.get('/fp', async (req, res) => {
  try {
    const { year, months, type } = req.query;
    
    if (!year || !months || !type) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required parameters: year, months, type' 
      });
    }

    let parsedMonths;
    try {
      parsedMonths = JSON.parse(months);
    } catch (parseError) {
      parsedMonths = months;
    }

    const normalizedType = type.toUpperCase();
    
    const productGroupsData = await ProductGroupDataService.getProductGroupsData(year, parsedMonths, normalizedType);
    const materialCategoriesData = await ProductGroupDataService.getMaterialCategoriesData(year, parsedMonths, normalizedType);
    const processCategoriesData = await ProductGroupDataService.getProcessCategoriesData(year, parsedMonths, normalizedType);

    const transformedData = {
      productGroups: productGroupsData.map(row => ({
        name: row.productgroup,
        metrics: [
          { type: 'KGS', data: [parseFloat(row.kgs) || 0] },
          { type: 'Sales', data: [parseFloat(row.sales) || 0] },
          { type: 'MoRM', data: [parseFloat(row.morm) || 0] }
        ]
      })),
      materialCategories: materialCategoriesData.map(row => ({
        name: row.material,
        metrics: [
          { type: 'KGS', data: [parseFloat(row.kgs) || 0] },
          { type: 'Sales', data: [parseFloat(row.sales) || 0] },
          { type: 'MoRM', data: [parseFloat(row.morm) || 0] }
        ]
      })),
      processCategories: processCategoriesData.map(row => ({
        name: row.process,
        metrics: [
          { type: 'KGS', data: [parseFloat(row.kgs) || 0] },
          { type: 'Sales', data: [parseFloat(row.sales) || 0] },
          { type: 'MoRM', data: [parseFloat(row.morm) || 0] }
        ]
      }))
    };

    res.json({ success: true, data: transformedData });
    
  } catch (error) {
    logger.error('Error retrieving FP product groups data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve product groups data' });
  }
});

// GET /fp/list - Get all product groups for FP division
router.get('/fp/list', async (req, res) => {
  try {
    const productGroups = await ProductGroupDataService.getAllProductGroups();
    const materials = await ProductGroupDataService.getAllMaterials();
    const processes = await ProductGroupDataService.getAllProcesses();

    res.json({ 
      success: true, 
      data: {
        productGroups,
        materials,
        processes
      }
    });
    
  } catch (error) {
    logger.error('Error retrieving FP product groups list', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve product groups list' });
  }
});

module.exports = router;
