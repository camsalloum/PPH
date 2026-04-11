/**
 * Oracle Direct Sync Routes
 * API endpoints for syncing data directly from Oracle ERP to fp_raw_oracle
 * Bypasses Excel export workflow
 * 
 * On VPS: Automatically connects FortiGate SSL-VPN before sync,
 * disconnects after sync completes.
 */

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const pool = require('../database/config');
const { authPool } = require('../database/config');
const vpnService = require('../services/VPNService');

// Store active sync processes
const activeSyncs = new Map();

// Progress file path
const PROGRESS_FILE = path.join(__dirname, '..', 'sync-progress.json');

/**
 * POST /api/oracle-direct/sync
 * Start a direct Oracle sync
 * Query params:
 *   - mode: 'all' | 'current-year'
 *   - year: specific year (optional, defaults to current year for 'current-year' mode)
 */
router.post('/sync', async (req, res) => {
  const { mode = 'current-year', year } = req.body;
  const syncId = Date.now().toString();
  
  try {
    // Determine year filter
    const targetYear = mode === 'all' ? null : (year || new Date().getFullYear());
    
    console.log(`🚀 Starting Oracle Direct Sync - Mode: ${mode}, Year: ${targetYear || 'ALL'}`);
    
    // Step 1: Connect VPN if needed (auto-skips if Oracle already reachable)
    console.log('🔌 Checking VPN / Oracle connectivity...');
    const vpnResult = await vpnService.connect();
    if (!vpnResult.success) {
      console.error('[Oracle Sync] VPN connection failed:', vpnResult.message);
      return res.status(503).json({
        success: false,
        error: `VPN connection failed: ${vpnResult.message}`,
        hint: 'Ensure openfortivpn is installed on the server and VPN credentials are correct in .env'
      });
    }
    console.log(`   VPN: ${vpnResult.message}`);
    
    // Use the simple script that works
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'simple-oracle-sync.js');
    const projectRoot = path.join(__dirname, '..', '..');
    const serverNodeModules = path.join(__dirname, '..', 'node_modules');
    
    // Build command - same as terminal
    const cmd = targetYear 
      ? `node "${scriptPath}" ${targetYear}`
      : `node "${scriptPath}"`;
    
    console.log(`   Command: ${cmd}`);
    console.log(`   Working dir: ${projectRoot}`);
    
    // Store sync info BEFORE starting
    activeSyncs.set(syncId, {
      mode,
      year: targetYear,
      startTime: new Date(),
      status: 'running',
      output: [],
      rowsInserted: 0
    });
    
    // Use exec with long timeout (2 hours for all years)
    const child = exec(cmd, {
      cwd: projectRoot,
      env: { ...process.env, NODE_PATH: serverNodeModules },
      timeout: 2 * 60 * 60 * 1000,  // 2 hours for "Sync All"
      maxBuffer: 50 * 1024 * 1024,  // 50MB output buffer
      windowsHide: true
    }, async (error, stdout, stderr) => {
      const syncInfo = activeSyncs.get(syncId);
      
      // Always disconnect VPN after sync (success or failure)
      try {
        await vpnService.disconnect();
        console.log('[Oracle Sync] VPN disconnected after sync');
      } catch (vpnErr) {
        console.error('[Oracle Sync] VPN disconnect error:', vpnErr.message);
      }
      
      if (error) {
        console.error('[Oracle Sync] Error:', error.message);
        if (syncInfo) {
          syncInfo.status = 'failed';
          syncInfo.error = error.message;
          syncInfo.output.push(`ERROR: ${error.message}`);
        }
        return;
      }
      
      console.log('[Oracle Sync] Output:', stdout);
      if (stderr) console.error('[Oracle Sync] Stderr:', stderr);
      
      if (syncInfo) {
        syncInfo.output.push(stdout);
        syncInfo.endTime = new Date();
        
        // Parse rows from output
        const rowsMatch = stdout.match(/Inserted (\d+) rows/i) || stdout.match(/Fetched (\d+) rows/i);
        if (rowsMatch) {
          syncInfo.rowsInserted = parseInt(rowsMatch[1]);
        }
        
        // Check for success
        if (stdout.includes('SYNC COMPLETE')) {
          syncInfo.status = 'completed';
          
          // Save last sync info
          try {
            await authPool.query(`
              INSERT INTO company_settings (setting_key, setting_value)
              VALUES ('oracle_last_sync', $1)
              ON CONFLICT (setting_key) DO UPDATE SET 
                setting_value = $1,
                updated_at = NOW()
            `, [JSON.stringify({
              mode,
              year: targetYear,
              rowsInserted: syncInfo.rowsInserted,
              completedAt: new Date().toISOString()
            })]);
          } catch (saveErr) {
            console.error('[Oracle Sync] Error saving sync info:', saveErr.message);
          }
        } else {
          syncInfo.status = 'failed';
        }
      }
    });
    
    // Store the child process
    const syncInfo = activeSyncs.get(syncId);
    if (syncInfo) {
      syncInfo.process = child;
    }
    
    res.json({
      success: true,
      syncId,
      mode,
      year: targetYear,
      message: `Oracle sync started. This may take 3-5 minutes.`
    });
    
  } catch (error) {
    console.error('Oracle Direct Sync Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/oracle-direct/sync/:syncId/status
 * Get sync status
 */
router.get('/sync/:syncId/status', (req, res) => {
  const { syncId } = req.params;
  const syncInfo = activeSyncs.get(syncId);
  
  if (!syncInfo) {
    return res.status(404).json({ success: false, error: 'Sync not found' });
  }
  
  res.json({
    success: true,
    syncId,
    status: syncInfo.status,
    mode: syncInfo.mode,
    year: syncInfo.year,
    rowsInserted: syncInfo.rowsInserted,
    startTime: syncInfo.startTime,
    endTime: syncInfo.endTime,
    output: syncInfo.output.slice(-10) // Last 10 lines
  });
});

/**
 * GET /api/oracle-direct/progress
 * Get current sync progress from file
 */
router.get('/progress', (req, res) => {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      
      // Calculate live elapsed time if still running
      if (data.status === 'running' && data.startTime) {
        data.elapsedSeconds = Math.round((Date.now() - new Date(data.startTime).getTime()) / 1000);
      }
      
      res.json({ success: true, progress: data });
    } else {
      res.json({ success: true, progress: null });
    }
  } catch (error) {
    res.json({ success: true, progress: null, error: error.message });
  }
});

/**
 * GET /api/oracle-direct/stats
 * Get current stats from fp_raw_oracle table
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT year1) as years,
        MIN(year1) as min_year,
        MAX(year1) as max_year,
        COUNT(DISTINCT division) as divisions,
        MAX(synced_at) as last_sync
      FROM fp_raw_oracle
    `);
    
    const byYear = await pool.query(`
      SELECT year1, division, COUNT(*) as row_count
      FROM fp_raw_oracle
      GROUP BY year1, division
      ORDER BY year1 DESC, division
    `);
    
    res.json({
      success: true,
      stats: result.rows[0],
      byYear: byYear.rows
    });
    
  } catch (error) {
    console.error('Oracle Direct Stats Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/oracle-direct/data
 * Clear fp_raw_oracle table
 */
router.delete('/data', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE fp_raw_oracle');
    res.json({
      success: true,
      message: 'fp_raw_oracle table cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/oracle-direct/last-sync
 * Get last sync time from company_settings
 */
router.get('/last-sync', async (req, res) => {
  try {
    const result = await authPool.query(`
      SELECT setting_value, updated_at 
      FROM company_settings 
      WHERE setting_key = 'oracle_last_sync'
    `);
    
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        lastSync: null
      });
    }
    
    // setting_value is JSONB, so it's already an object
    const syncData = result.rows[0].setting_value;
    
    res.json({
      success: true,
      lastSync: syncData
    });
  } catch (error) {
    console.error('Get Last Sync Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/oracle-direct/last-sync
 * Save last sync time to company_settings
 */
router.post('/last-sync', async (req, res) => {
  try {
    const { mode, year, rowsInserted, completedAt } = req.body;
    
    // setting_value is JSONB, so pass object directly
    const syncData = {
      mode,
      year,
      rowsInserted,
      completedAt: completedAt || new Date().toISOString()
    };
    
    // Upsert into company_settings
    await authPool.query(`
      INSERT INTO company_settings (setting_key, setting_value)
      VALUES ('oracle_last_sync', $1::jsonb)
      ON CONFLICT (setting_key) 
      DO UPDATE SET 
        setting_value = $1::jsonb, 
        updated_at = NOW()
    `, [JSON.stringify(syncData)]);
    
    res.json({
      success: true,
      message: 'Last sync time saved'
    });
  } catch (error) {
    console.error('Save Last Sync Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/oracle-direct/vpn-status
 * Check current VPN connection status
 */
router.get('/vpn-status', (req, res) => {
  const status = vpnService.getStatus();
  res.json({ success: true, vpn: status });
});

/**
 * POST /api/oracle-direct/vpn-test
 * Test VPN connection + Oracle reachability
 */
router.post('/vpn-test', async (req, res) => {
  try {
    // Check if Oracle is already reachable
    const alreadyReachable = await vpnService.isOracleReachable();
    if (alreadyReachable) {
      return res.json({
        success: true,
        vpnNeeded: false,
        oracleReachable: true,
        message: 'Oracle is already reachable — no VPN needed'
      });
    }

    // Try connecting VPN
    const vpnResult = await vpnService.connect();
    if (!vpnResult.success) {
      return res.json({
        success: false,
        vpnNeeded: true,
        oracleReachable: false,
        message: vpnResult.message
      });
    }

    // Check Oracle reachability through VPN
    const reachable = await vpnService.isOracleReachable();

    // Disconnect after test
    await vpnService.disconnect();

    res.json({
      success: true,
      vpnNeeded: true,
      vpnConnected: true,
      oracleReachable: reachable,
      message: reachable
        ? 'VPN connected and Oracle is reachable'
        : 'VPN connected but Oracle host not reachable — check routing'
    });
  } catch (error) {
    // Ensure VPN is disconnected on error
    try { await vpnService.disconnect(); } catch {}
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
