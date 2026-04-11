/**
 * RM (Raw Material) Sync Routes
 * API endpoints for syncing raw material data from Oracle ERP to fp_actualrmdata
 * Oracle View: HAP111.XL_FPRMAVERAGES_PMD_111
 * 
 * Same pattern as oracleDirectSync.js but for raw materials.
 */

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { pool, authPool } = require('../database/config');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const requireAnyRole = require('../middleware/requireAnyRole');
const vpnService = require('../services/VPNService');
const { notifyNewRMBatchReceived } = require('../services/rmNotificationService');

const activeSyncs = new Map();
const PROGRESS_FILE = path.join(__dirname, '..', 'rm-sync-progress.json');
const SENIOR_LEVEL = 6;
const SENIOR_MANAGEMENT_ROLES = ['manager', 'sales_manager', 'sales_coordinator'];
const RAW_MATERIALS_VIEW_ROLES = [
  'admin',
  'production_manager',
  'production_planner',
  'quality_control',
  'qc_manager',
  'qc_lab',
  'rd_engineer',
  'lab_technician',
  'procurement',
  'logistics_manager',
  'stores_keeper',
  'store_keeper',
  'warehouse_manager',
  'operator',
  'production_operator',
  'production_op',
];

const requireViewAccess = requireAnyRole(
  RAW_MATERIALS_VIEW_ROLES,
  { minLevel: SENIOR_LEVEL, minLevelRoles: SENIOR_MANAGEMENT_ROLES }
);

async function autoCreateQcIncomingRecords(syncId) {
  try {
    const result = await pool.query(
      `WITH inserted AS (
         INSERT INTO qc_rm_incoming (
           rm_sync_id,
           source,
           division,
           material_code,
           material_name,
           material_type,
             supplier_code,
             supplier_name,
             batch_number,
             grn_reference,
             po_reference,
           received_date,
           quantity,
           unit,
           qc_status,
           qc_lot_id,
           created_by,
           created_by_name
         )
         SELECT
           d.id,
           'oracle_sync',
           'FP',
           COALESCE(NULLIF(TRIM(d.mainitem), ''), CONCAT('RM-', d.id::text)),
           COALESCE(NULLIF(TRIM(d.maindescription), ''), NULLIF(TRIM(d.mainitem), ''), 'Unknown material'),
           COALESCE(NULLIF(TRIM(d.itemgroup), ''), NULLIF(TRIM(d.category), ''), 'Unclassified'),
           NULLIF(TRIM(COALESCE(
             j.data->>'supplier_code',
             j.data->>'suppliercode',
             j.data->>'supplier',
             j.data->>'vendor_code',
             j.data->>'vendorcode',
             j.data->>'vendor',
             j.data->>'party_code',
             j.data->>'partycode'
           )), ''),
           NULLIF(TRIM(COALESCE(
             j.data->>'supplier_name',
             j.data->>'suppliername',
             j.data->>'vendor_name',
             j.data->>'vendorname',
             j.data->>'supplier',
             j.data->>'vendor'
           )), ''),
           NULLIF(TRIM(COALESCE(
             j.data->>'batch_number',
             j.data->>'batchno',
             j.data->>'batch',
             j.data->>'lot_number',
             j.data->>'lotno'
           )), ''),
           NULLIF(TRIM(COALESCE(
             j.data->>'grn_reference',
             j.data->>'grn_no',
             j.data->>'grn',
             j.data->>'goods_receipt_no',
             j.data->>'goods_receipt'
           )), ''),
           NULLIF(TRIM(COALESCE(
             j.data->>'po_reference',
             j.data->>'po_no',
             j.data->>'purchase_order',
             j.data->>'ponumber'
           )), ''),
           CURRENT_DATE,
           COALESCE(d.mainitemstock, 0) + COALESCE(d.pendingorderqty, 0),
           COALESCE(NULLIF(TRIM(d.mainunit), ''), 'KG'),
           'pending',
           generate_qc_rm_lot_id(COALESCE(d.mainitem, 'RM')),
           NULL,
           'RM Sync Engine'
         FROM fp_actualrmdata d
         CROSS JOIN LATERAL (SELECT to_jsonb(d) AS data) j
         WHERE NOT EXISTS (
           SELECT 1 FROM qc_rm_incoming q WHERE q.rm_sync_id = d.id
         )
         RETURNING id,
                   division,
                   source,
                   material_code,
                   material_name,
                   material_type,
                   supplier_code,
                   supplier_name,
                   batch_number,
                   qc_lot_id,
                   received_date,
                   quantity,
                   unit,
                   qc_status
       ), tier_seed AS (
       INSERT INTO qc_supplier_tiers (
         supplier_code,
         supplier_name,
         tier,
         tier_reason,
         tier_assigned_by
       )
       SELECT DISTINCT
         i.supplier_code,
         i.supplier_name,
         'tier_2',
         'Auto-seeded from RM sync',
         NULL
       FROM inserted i
       WHERE i.supplier_code IS NOT NULL
         AND TRIM(i.supplier_code) <> ''
       ON CONFLICT (supplier_code) DO UPDATE
         SET supplier_name = COALESCE(EXCLUDED.supplier_name, qc_supplier_tiers.supplier_name),
             updated_at = NOW()
       RETURNING supplier_code
       ), logged AS (
       INSERT INTO qc_rm_activity_log (
         incoming_id,
         action,
         from_status,
         to_status,
         performed_by,
         performed_by_name,
         details,
         metadata
       )
       SELECT
         i.id,
         'created',
         NULL,
         i.qc_status,
         NULL,
         'RM Sync Engine',
         'Auto-created from RM sync',
         jsonb_build_object('sync_id', $1)
       FROM inserted i
       RETURNING incoming_id
       )
       SELECT * FROM inserted`,
      [syncId]
    );

    return {
      count: result.rowCount || 0,
      rows: result.rows || [],
    };
  } catch (error) {
    // Migration may not be applied yet in all environments.
    if (['42P01', '42883', '42703'].includes(error.code)) {
      console.warn('[RM Sync] QC incoming auto-create skipped (Phase 4 schema not present yet).');
      return { count: 0, rows: [] };
    }
    throw error;
  }
}

/**
 * POST /api/rm-sync/sync
 * Start a raw material sync from Oracle
 */
router.post('/sync', authenticate, requireAnyRole(['admin']), async (req, res) => {
  const syncId = Date.now().toString();

  try {
    console.log('🧪 Starting RM (Raw Material) Sync from Oracle...');

    // Connect VPN if needed
    console.log('🔌 Checking VPN / Oracle connectivity...');
    const vpnResult = await vpnService.connect();
    if (!vpnResult.success) {
      console.error('[RM Sync] VPN connection failed:', vpnResult.message);
      return res.status(503).json({
        success: false,
        error: `VPN connection failed: ${vpnResult.message}`
      });
    }
    console.log(`   VPN: ${vpnResult.message}`);

    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'simple-rm-sync.js');
    const projectRoot = path.join(__dirname, '..', '..');
    const serverNodeModules = path.join(__dirname, '..', 'node_modules');
    const cmd = `node "${scriptPath}"`;

    activeSyncs.set(syncId, {
      startTime: new Date(),
      status: 'running',
      output: [],
      rowsInserted: 0,
      qcIncomingCreated: 0
    });

    const child = exec(cmd, {
      cwd: projectRoot,
      env: { ...process.env, NODE_PATH: serverNodeModules },
      timeout: 30 * 60 * 1000, // 30 min
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    }, async (error, stdout, stderr) => {
      const syncInfo = activeSyncs.get(syncId);

      try { await vpnService.disconnect(); } catch {}

      if (error) {
        console.error('[RM Sync] Error:', error.message);
        if (syncInfo) {
          syncInfo.status = 'failed';
          syncInfo.error = error.message;
        }
        return;
      }

      console.log('[RM Sync] Output:', stdout);

      if (syncInfo) {
        syncInfo.output.push(stdout);
        syncInfo.endTime = new Date();

        const rowsMatch = stdout.match(/Fetched (\d+) rows/i) || stdout.match(/Inserted (\d+) rows/i);
        if (rowsMatch) syncInfo.rowsInserted = parseInt(rowsMatch[1]);

        if (stdout.includes('RM SYNC COMPLETE')) {
          syncInfo.status = 'completed';
          try {
            await authPool.query(`
              INSERT INTO company_settings (setting_key, setting_value)
              VALUES ('rm_last_sync', $1::jsonb)
              ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
            `, [JSON.stringify({
              rowsInserted: syncInfo.rowsInserted,
              completedAt: new Date().toISOString()
            })]);
          } catch (e) { console.error('[RM Sync] Save error:', e.message); }

          try {
            const created = await autoCreateQcIncomingRecords(syncId);
            syncInfo.qcIncomingCreated = created.count;
            console.log(`[RM Sync] Auto-created ${created.count} QC incoming record(s).`);

            if (created.count > 0) {
              try {
                await notifyNewRMBatchReceived(created.rows, { syncId });
              } catch (notifyErr) {
                console.error('[RM Sync] Notification dispatch error:', notifyErr.message);
              }
            }
          } catch (e) {
            console.error('[RM Sync] QC incoming auto-create error:', e.message);
          }
        } else {
          syncInfo.status = 'failed';
        }
      }
    });

    const syncInfo = activeSyncs.get(syncId);
    if (syncInfo) syncInfo.process = child;

    res.json({ success: true, syncId, message: 'RM sync started.' });
  } catch (error) {
    console.error('RM Sync Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/rm-sync/progress
 */
router.get('/progress', authenticate, requireViewAccess, (req, res) => {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
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
 * GET /api/rm-sync/stats
 */
router.get('/stats', authenticate, requireViewAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT division) as divisions,
        COUNT(DISTINCT itemgroup) as item_groups,
        COUNT(DISTINCT warehouse) as warehouses,
        MAX(synced_at) as last_sync
      FROM fp_actualrmdata
    `);

    const byDivision = await pool.query(`
      SELECT division, COUNT(*) as row_count, 
        SUM(mainitemstock * maincost) as total_stock_value,
        SUM(pendingorderqty * purchaseprice) as total_pending_value
      FROM fp_actualrmdata
      GROUP BY division ORDER BY division
    `);

    res.json({ success: true, stats: result.rows[0], byDivision: byDivision.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/rm-sync/data
 * Get raw material data with optional filters
 */
router.get('/data', authenticate, requireViewAccess, async (req, res) => {
  try {
    const { division, itemgroup, warehouse, limit = 500 } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (division) { where.push(`division = $${idx++}`); params.push(division); }
    if (itemgroup) { where.push(`itemgroup = $${idx++}`); params.push(itemgroup); }
    if (warehouse) { where.push(`warehouse = $${idx++}`); params.push(warehouse); }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM fp_actualrmdata ${whereClause} ORDER BY division, itemgroup, mainitem LIMIT $${idx}`,
      [...params, parseInt(limit)]
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/rm-sync/last-sync
 */
router.get('/last-sync', authenticate, requireViewAccess, async (req, res) => {
  try {
    const result = await authPool.query(
      `SELECT setting_value, updated_at FROM company_settings WHERE setting_key = 'rm_last_sync'`
    );
    res.json({ success: true, lastSync: result.rows.length > 0 ? result.rows[0].setting_value : null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/rm-sync/sync/:syncId/status
 */
router.get('/sync/:syncId/status', authenticate, requireViewAccess, (req, res) => {
  const syncInfo = activeSyncs.get(req.params.syncId);
  if (!syncInfo) return res.status(404).json({ success: false, error: 'Sync not found' });

  res.json({
    success: true,
    syncId: req.params.syncId,
    status: syncInfo.status,
    rowsInserted: syncInfo.rowsInserted,
    qcIncomingCreated: syncInfo.qcIncomingCreated || 0,
    startTime: syncInfo.startTime,
    endTime: syncInfo.endTime
  });
});

/**
 * GET /api/rm-sync/categories
 * Returns deduplicated categories from mes_category_mapping with column labels,
 * sort order, and item counts. Used by RM Dashboard to build tabs dynamically.
 */
router.get('/categories', authenticate, requireViewAccess, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        m.material_class,
        m.display_label,
        m.has_parameters,
        m.sort_order,
        m.column_labels,
        m.is_aggregated,
        m.spec_table,
        ARRAY_AGG(DISTINCT m.oracle_category) AS oracle_categories,
        SUM(sub.item_count)::INT AS item_count
      FROM mes_category_mapping m
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT LOWER(TRIM(r.mainitem)))::INT AS item_count
        FROM fp_actualrmdata r
        WHERE UPPER(TRIM(r.category)) = m.oracle_category
          AND COALESCE(TRIM(r.mainitem), '') <> ''
      ) sub ON TRUE
      WHERE m.is_active = true
      GROUP BY m.material_class, m.display_label, m.has_parameters, m.sort_order,
               m.column_labels, m.is_aggregated, m.spec_table
      ORDER BY m.sort_order ASC, m.display_label ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('GET /api/rm-sync/categories error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

module.exports = router;
