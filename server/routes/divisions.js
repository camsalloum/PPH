/**
 * Division Management Routes
 * Handles CRUD operations for divisions table
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { pool } = require('../database/config');

// NOTE: This is a legacy route. Prefer managing divisions via Company Settings
// (/api/settings/divisions) which keeps divisions dynamically linked to company info.
router.use(authenticate, requireRole('admin'));

// GET /divisions - Get all divisions
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        division_code,
        division_name,
        raw_divisions,
        created_at,
        updated_at
      FROM divisions
      ORDER BY division_code
    `);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching divisions', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch divisions' });
  }
});

// GET /divisions/available-raw - Get available raw divisions from fp_raw_oracle
router.get('/available-raw', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT division 
      FROM fp_raw_oracle 
      WHERE division IS NOT NULL 
      ORDER BY division
    `);
    
    const rawDivisions = result.rows.map(row => row.division);
    
    res.json({ success: true, data: rawDivisions });
  } catch (error) {
    logger.error('Error fetching available raw divisions', { error: error.message });
    // Fallback to common values
    res.json({ success: true, data: ['FP', 'BF'] });
  }
});

// POST /divisions - Create new division
router.post('/', async (req, res) => {
  try {
    const { division_code, division_name, raw_divisions } = req.body;
    
    if (!division_code || !division_name || !raw_divisions || raw_divisions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'division_code, division_name, and raw_divisions are required' 
      });
    }
    
    const result = await pool.query(`
      INSERT INTO divisions (division_code, division_name, raw_divisions)
      VALUES ($1, $2, $3::jsonb)
      RETURNING *
    `, [
      division_code.toUpperCase(),
      division_name,
      JSON.stringify(raw_divisions)
    ]);
    
    // Trigger sync to fp_actualcommon from Oracle data
    await pool.query('SELECT sync_oracle_to_actualcommon()');
    
    logger.info('Division created', { division_code, division_name, raw_divisions });
    
    res.json({ 
      success: true, 
      data: result.rows[0],
      message: 'Division created and data synced to fp_actualcommon'
    });
  } catch (error) {
    logger.error('Error creating division', { error: error.message });
    
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Division code already exists' });
    }
    
    res.status(500).json({ success: false, error: 'Failed to create division' });
  }
});

// PUT /divisions/:code - Update division
router.put('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { division_name, raw_divisions } = req.body;
    
    if (!division_name || !raw_divisions || raw_divisions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'division_name and raw_divisions are required' 
      });
    }
    
    const result = await pool.query(`
      UPDATE divisions 
      SET 
        division_name = $1,
        raw_divisions = $2::jsonb,
        updated_at = CURRENT_TIMESTAMP
      WHERE division_code = $3
      RETURNING *
    `, [division_name, JSON.stringify(raw_divisions), code.toUpperCase()]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Division not found' });
    }
    
    // Trigger sync to fp_actualcommon from Oracle data
    await pool.query('SELECT sync_oracle_to_actualcommon()');
    
    logger.info('Division updated', { code, division_name, raw_divisions });
    
    res.json({ 
      success: true, 
      data: result.rows[0],
      message: 'Division updated and data re-synced to fp_actualcommon'
    });
  } catch (error) {
    logger.error('Error updating division', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update division' });
  }
});

// DELETE /divisions/:code - Delete division
router.delete('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const result = await pool.query(`
      DELETE FROM divisions 
      WHERE division_code = $1
      RETURNING *
    `, [code.toUpperCase()]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Division not found' });
    }
    
    // Trigger sync to fp_actualcommon from Oracle data (will remove data for deleted division)
    await pool.query('SELECT sync_oracle_to_actualcommon()');
    
    logger.info('Division deleted', { code });
    
    res.json({ 
      success: true, 
      message: 'Division deleted and fp_actualcommon updated'
    });
  } catch (error) {
    logger.error('Error deleting division', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete division' });
  }
});

module.exports = router;
