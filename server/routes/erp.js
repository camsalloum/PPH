/**
 * ERP Integration Routes
 * 
 * Provides REST API endpoints for Oracle ERP synchronization
 * All endpoints require authentication
 * 
 * Routes:
 * GET  /api/erp/test-connection     - Test Oracle connection
 * GET  /api/erp/schema              - Get Oracle table schema (57 columns)
 * POST /api/erp/sync                - Trigger manual sync (full or incremental)
 * GET  /api/erp/sync-status         - Get sync history and current status
 * GET  /api/erp/data-count          - Get row count in fp_raw_data
 * GET  /api/erp/columns             - List all fp_raw_data columns
 */

const express = require('express');
const router = express.Router();
const OracleERPSyncService = require('../services/OracleERPSyncService');
const { pool } = require('../database/config');
const logger = require('../utils/logger');
const { authMiddleware } = require('../middleware/auth');

/**
 * Test Oracle ERP connection
 * GET /api/erp/test-connection
 */
router.get('/test-connection', authMiddleware, async (req, res) => {
  try {
    logger.info('🔌 Testing Oracle connection...');
    
    await OracleERPSyncService.testConnection();

    res.json({
      success: true,
      message: 'Oracle ERP connection successful',
      details: {
        server: 'PRODDB-SCAN.ITSUPPORT.HG:1521/REPDB',
        schema: 'HAP111',
        table: 'XL_FPSALESVSCOST_FULL',
        user: 'noor',
        columns: 57
      }
    });

  } catch (error) {
    logger.error('❌ Connection test failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      hint: 'Check ODBC configuration, firewall, and Oracle credentials'
    });
  }
});

/**
 * Get Oracle table schema (all 57 columns)
 * GET /api/erp/schema
 */
router.get('/schema', authMiddleware, async (req, res) => {
  try {
    logger.info('📋 Fetching Oracle table schema...');

    const schema = await OracleERPSyncService.getTableSchema();

    res.json({
      success: true,
      totalColumns: schema.length,
      schema: schema.map(col => ({
        name: col.COLUMN_NAME,
        type: col.DATA_TYPE,
        length: col.DATA_LENGTH,
        precision: col.DATA_PRECISION,
        scale: col.DATA_SCALE,
        nullable: col.NULLABLE,
        columnId: col.COLUMN_ID
      }))
    });

  } catch (error) {
    logger.error('❌ Schema fetch failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Trigger manual synchronization
 * POST /api/erp/sync
 * 
 * Body: {
 *   syncType: 'full' | 'incremental' (default: 'full')
 * }
 */
router.post('/sync', authMiddleware, async (req, res) => {
  try {
    const { syncType = 'full' } = req.body;

    // Validate sync type
    if (!['full', 'incremental'].includes(syncType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sync type. Use "full" or "incremental"'
      });
    }

    logger.info(`🔄 Manual sync triggered: ${syncType}`);

    // Start sync and send immediate response
    // Sync continues in background
    res.json({
      success: true,
      message: `${syncType} sync started`,
      syncType: syncType,
      status: 'running',
      hint: 'Check /api/erp/sync-status for progress'
    });

    // Run sync in background (don't await)
    OracleERPSyncService.syncToPostgreSQL(syncType)
      .then(result => {
        logger.info('✅ Background sync completed:', result);
      })
      .catch(error => {
        logger.error('❌ Background sync failed:', error.message);
      });

  } catch (error) {
    logger.error('❌ Sync trigger failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get sync history and status
 * GET /api/erp/sync-status?limit=10
 */
router.get('/sync-status', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Get history
    const history = await OracleERPSyncService.getSyncHistory(limit);

    // Get current running sync if any
    const runningQuery = `
      SELECT *
      FROM erp_sync_metadata
      WHERE sync_status = 'running'
      ORDER BY sync_start_time DESC
      LIMIT 1
    `;
    
    const runningResult = await pool.query(runningQuery);

    res.json({
      success: true,
      isCurrentlyRunning: runningResult.rows.length > 0,
      currentSync: runningResult.rows[0] || null,
      recentSyncs: history.map(row => ({
        id: row.id,
        syncType: row.sync_type,
        status: row.sync_status,
        rowsFetched: row.rows_fetched,
        rowsInserted: row.rows_inserted,
        rowsUpdated: row.rows_updated,
        rowsSkipped: row.rows_skipped,
        startTime: row.sync_start_time,
        endTime: row.sync_end_time,
        durationSeconds: row.duration_seconds,
        errorMessage: row.error_message
      }))
    });

  } catch (error) {
    logger.error('❌ Failed to get sync status:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get row count in fp_raw_data
 * GET /api/erp/data-count
 */
router.get('/data-count', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) as total_rows FROM fp_raw_data');
    const totalRows = parseInt(result.rows[0].total_rows);

    res.json({
      success: true,
      table: 'fp_raw_data',
      totalRows: totalRows
    });

  } catch (error) {
    logger.error('❌ Failed to get data count:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get all fp_raw_data columns
 * GET /api/erp/columns
 */
router.get('/columns', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fp_raw_data'
      ORDER BY ordinal_position
    `);

    res.json({
      success: true,
      totalColumns: result.rows.length,
      columns: result.rows.map((row, index) => ({
        position: index + 1,
        name: row.column_name,
        type: row.data_type,
        maxLength: row.character_maximum_length
      }))
    });

  } catch (error) {
    logger.error('❌ Failed to get columns:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get sample data from fp_raw_data
 * GET /api/erp/sample?limit=10
 */
router.get('/sample', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const result = await pool.query(
      'SELECT * FROM fp_raw_data ORDER BY created_at DESC LIMIT $1',
      [limit]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });

  } catch (error) {
    logger.error('❌ Failed to get sample data:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
