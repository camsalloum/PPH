/**
 * Sales Representatives Routes
 * Handles sales rep defaults, groups, and universal operations
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { pool } = require('../database/config');
const { authenticate } = require('../middleware/auth');
const requireAnyRole = require('../middleware/requireAnyRole');

const SENIOR_LEVEL = 6;
const CRM_SENIOR_ROLES = ['manager', 'sales_manager', 'sales_coordinator'];

router.use(
  authenticate,
  requireAnyRole(['admin'], { minLevel: SENIOR_LEVEL, minLevelRoles: CRM_SENIOR_ROLES })
);

// GET /defaults - Get sales rep defaults
router.get('/defaults', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sales_rep_defaults ORDER BY salesrepname');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching sales rep defaults', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales rep defaults' });
  }
});

// POST /defaults - Save sales rep defaults
router.post('/defaults', async (req, res) => {
  try {
    const { salesrepname, default_customer, default_country } = req.body;
    
    const result = await pool.query(
      `INSERT INTO sales_rep_defaults (salesrepname, default_customer, default_country) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (salesrepname) 
       DO UPDATE SET default_customer = $2, default_country = $3 
       RETURNING *`,
      [salesrepname, default_customer, default_country]
    );
    
    logger.info('Sales rep defaults saved', { salesrepname });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error saving sales rep defaults', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save sales rep defaults' });
  }
});

// POST /groups - Create sales rep group
router.post('/groups', async (req, res) => {
  try {
    const { division, group_name, members } = req.body;
    
    const result = await pool.query(
      `INSERT INTO sales_rep_groups (division, group_name, members) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [division, group_name, JSON.stringify(members)]
    );
    
    logger.info('Sales rep group created', { division, group_name });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating sales rep group', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create sales rep group' });
  }
});

// DELETE /groups - Delete sales rep group
router.delete('/groups', async (req, res) => {
  try {
    const { division, group_name } = req.body;
    
    await pool.query(
      'DELETE FROM sales_rep_groups WHERE division = $1 AND group_name = $2',
      [division, group_name]
    );
    
    logger.info('Sales rep group deleted', { division, group_name });
    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    logger.error('Error deleting sales rep group', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete sales rep group' });
  }
});

// GET /groups-universal - Get universal sales rep groups
router.get('/groups-universal', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sales_rep_groups ORDER BY division, group_name');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching universal sales rep groups', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch groups' });
  }
});

// POST /groups-universal - Create universal sales rep group
router.post('/groups-universal', async (req, res) => {
  try {
    const { division, group_name, members } = req.body;
    
    const result = await pool.query(
      `INSERT INTO sales_rep_groups (division, group_name, members) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (division, group_name) 
       DO UPDATE SET members = $3 
       RETURNING *`,
      [division, group_name, JSON.stringify(members)]
    );
    
    logger.info('Universal sales rep group saved', { division, group_name });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error saving universal sales rep group', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save group' });
  }
});

// DELETE /groups-universal - Delete universal sales rep group
router.delete('/groups-universal', async (req, res) => {
  try {
    const { division, group_name } = req.body;
    
    await pool.query(
      'DELETE FROM sales_rep_groups WHERE division = $1 AND group_name = $2',
      [division, group_name]
    );
    
    logger.info('Universal sales rep group deleted', { division, group_name });
    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    logger.error('Error deleting universal sales rep group', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete group' });
  }
});

// POST /complete-data - Get complete sales rep data
router.post('/complete-data', async (req, res) => {
  try {
    const { division, salesRep, filters } = req.body;
    
    // Implementation would query division-specific data
    const { getDivisionPool } = require('../utils/divisionDatabaseManager');
    const divisionPool = await getDivisionPool(division);
    
    const result = await divisionPool.query(
      `SELECT * FROM fp_actualcommon 
       WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
         AND TRIM(UPPER(sales_rep_name)) = TRIM(UPPER($2))`,
      [division, salesRep]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching complete sales rep data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch complete data' });
  }
});

module.exports = router;
