/**
 * Pending Countries API Routes
 * Handles unrecognized countries awaiting admin assignment
 */

const express = require('express');
const router = express.Router();
const { getDivisionPool } = require('../utils/divisionDatabaseManager');
const logger = require('../utils/logger');

// Helper to get pool
async function getPool() {
  return await getDivisionPool('FP');
}

/**
 * @swagger
 * /api/pending-countries:
 *   get:
 *     summary: Get all pending country assignments
 *     tags: [Pending Countries]
 */
router.get('/', async (req, res) => {
  let client;
  try {
    const pool = await getPool();
    client = await pool.connect();
    
    const { status = 'PENDING' } = req.query;
    
    let query = `
      SELECT 
        id,
        country_name,
        normalized_name,
        source_table,
        occurrence_count,
        sample_customers,
        suggested_master_country,
        suggested_confidence,
        status,
        resolved_action,
        resolved_master_country,
        resolved_region,
        resolved_by,
        resolved_at,
        detected_at as first_seen_at
      FROM pending_country_assignments
    `;
    
    const params = [];
    if (status !== 'all') {
      query += ` WHERE status = $1`;
      params.push(status);
    }
    
    query += ` ORDER BY occurrence_count DESC, detected_at DESC`;
    
    const result = await client.query(query, params);
    
    // Get count by status
    const countResult = await client.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM pending_country_assignments
      GROUP BY status
    `);
    
    const counts = {
      PENDING: 0,
      RESOLVED: 0,
      IGNORED: 0,
      total: 0
    };
    
    countResult.rows.forEach(row => {
      counts[row.status] = parseInt(row.count);
      counts.total += parseInt(row.count);
    });
    
    res.json({
      success: true,
      data: result.rows,
      counts
    });
    
  } catch (error) {
    logger.error('Error fetching pending countries:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * @swagger
 * /api/pending-countries/count:
 *   get:
 *     summary: Get count of pending countries (for notification badge)
 *     tags: [Pending Countries]
 */
router.get('/count', async (req, res) => {
  let client;
  try {
    const pool = await getPool();
    client = await pool.connect();
    
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM pending_country_assignments
      WHERE status = 'PENDING'
    `);
    
    res.json({
      success: true,
      count: parseInt(result.rows[0].count)
    });
    
  } catch (error) {
    logger.error('Error fetching pending country count:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * @swagger
 * /api/pending-countries/regions:
 *   get:
 *     summary: Get list of available regions for dropdown
 *     tags: [Pending Countries]
 */
router.get('/regions', async (req, res) => {
  let client;
  try {
    const pool = await getPool();
    client = await pool.connect();
    
    const result = await client.query(`
      SELECT DISTINCT region
      FROM master_countries
      WHERE region IS NOT NULL
      ORDER BY region
    `);
    
    res.json({
      success: true,
      regions: result.rows.map(r => r.region)
    });
    
  } catch (error) {
    logger.error('Error fetching regions:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * @swagger
 * /api/pending-countries/master-countries:
 *   get:
 *     summary: Get list of master countries for alias dropdown
 *     tags: [Pending Countries]
 */
router.get('/master-countries', async (req, res) => {
  let client;
  try {
    const pool = await getPool();
    client = await pool.connect();
    
    const result = await client.query(`
      SELECT country, region
      FROM master_countries
      ORDER BY country
    `);
    
    res.json({
      success: true,
      countries: result.rows
    });
    
  } catch (error) {
    logger.error('Error fetching master countries:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * @swagger
 * /api/pending-countries/{id}/resolve:
 *   post:
 *     summary: Resolve a pending country assignment
 *     tags: [Pending Countries]
 */
router.post('/:id/resolve', async (req, res) => {
  let client;
  try {
    const pool = await getPool();
    client = await pool.connect();
    
    const { id } = req.params;
    const { action, masterCountry, region } = req.body;
    const resolvedBy = req.user?.email || req.user?.username || 'admin';
    
    // Validate action
    if (!['ALIAS', 'NEW_COUNTRY', 'IGNORED'].includes(action)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid action. Must be ALIAS, NEW_COUNTRY, or IGNORED' 
      });
    }
    
    // Validate required fields
    if (action === 'ALIAS' && !masterCountry) {
      return res.status(400).json({ 
        success: false, 
        error: 'masterCountry is required for ALIAS action' 
      });
    }
    
    if (action === 'NEW_COUNTRY' && !region) {
      return res.status(400).json({ 
        success: false, 
        error: 'region is required for NEW_COUNTRY action' 
      });
    }
    
    // Get the pending country name first
    const pending = await client.query('SELECT country_name FROM pending_country_assignments WHERE id = $1', [id]);
    if (pending.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pending country not found' });
    }
    
    const countryName = pending.rows[0].country_name;
    
    // Update the pending record
    await client.query(`
      UPDATE pending_country_assignments
      SET 
        status = 'RESOLVED',
        resolved_action = $2,
        resolved_master_country = $3,
        resolved_region = $4,
        resolved_by = $5,
        resolved_at = NOW()
      WHERE id = $1
    `, [id, action, masterCountry || null, region || null, resolvedBy]);
    
    // If ALIAS, add to country_aliases
    if (action === 'ALIAS' && masterCountry) {
      await client.query(`
        INSERT INTO country_aliases (alias, master_country, created_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (alias) DO NOTHING
      `, [countryName, masterCountry, resolvedBy]);
    }
    
    // If NEW_COUNTRY, add to master_countries
    if (action === 'NEW_COUNTRY' && region) {
      await client.query(`
        INSERT INTO master_countries (country, region)
        VALUES ($1, $2)
        ON CONFLICT (country) DO NOTHING
      `, [countryName, region]);
    }
    
    logger.info(`Resolved pending country ${id}: ${action}`, { 
      id, action, masterCountry, region, resolvedBy 
    });
    
    // Sync unified tables with new alias/country (non-blocking)
    try {
      await client.query('SELECT refresh_unified_stats()');
      await client.query('SELECT refresh_budget_unified_stats()');
      logger.info('✅ Unified tables synced after country resolution');
    } catch (syncErr) {
      logger.warn('⚠️ Unified sync failed (non-critical):', syncErr.message);
    }
    
    res.json({
      success: true,
      message: `Country resolved successfully as ${action}`
    });
    
  } catch (error) {
    logger.error('Error resolving pending country:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * @swagger
 * /api/pending-countries/bulk-resolve:
 *   post:
 *     summary: Resolve multiple pending countries at once
 *     tags: [Pending Countries]
 */
router.post('/bulk-resolve', async (req, res) => {
  let client;
  try {
    const pool = await getPool();
    client = await pool.connect();
    
    const { resolutions } = req.body;
    const resolvedBy = req.user?.email || req.user?.username || 'admin';
    
    if (!Array.isArray(resolutions) || resolutions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'resolutions array is required' 
      });
    }
    
    const results = [];
    
    await client.query('BEGIN');
    
    for (const resolution of resolutions) {
      const { id, action, masterCountry, region } = resolution;
      
      try {
        await client.query(`
          UPDATE pending_country_assignments
          SET 
            status = 'RESOLVED',
            resolved_action = $2,
            resolved_master_country = $3,
            resolved_region = $4,
            resolved_by = $5,
            resolved_at = NOW()
          WHERE id = $1
        `, [id, action, masterCountry || null, region || null, resolvedBy]);
        
        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: err.message });
      }
    }
    
    await client.query('COMMIT');
    
    const successCount = results.filter(r => r.success).length;
    
    logger.info(`Bulk resolved ${successCount}/${resolutions.length} pending countries`);
    
    res.json({
      success: true,
      message: `Resolved ${successCount} of ${resolutions.length} countries`,
      results
    });
    
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    logger.error('Error bulk resolving pending countries:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * @swagger
 * /api/pending-countries/scan:
 *   post:
 *     summary: Manually trigger scan for unknown countries
 *     tags: [Pending Countries]
 */
router.post('/scan', async (req, res) => {
  let client;
  try {
    const pool = await getPool();
    client = await pool.connect();
    
    // Check if function exists
    const funcCheck = await client.query(`
      SELECT EXISTS(
        SELECT 1 FROM pg_proc WHERE proname = 'detect_unknown_countries'
      ) as exists
    `);
    
    if (funcCheck.rows[0].exists) {
      const { sourceTable = 'all' } = req.body;
      
      const result = await client.query(`
        SELECT detect_unknown_countries($1) as result
      `, [sourceTable]);
      
      const scanResult = result.rows[0].result;
      
      logger.info('Manual country scan completed:', scanResult);
      
      res.json({
        success: true,
        message: `Scan completed. Found ${scanResult.unknown_countries_found || 0} unknown countries.`,
        result: scanResult
      });
    } else {
      res.json({
        success: true,
        message: 'Scan function not yet installed. Run migrations first.',
        result: { unknown_countries_found: 0 }
      });
    }
    
  } catch (error) {
    logger.error('Error scanning for unknown countries:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
