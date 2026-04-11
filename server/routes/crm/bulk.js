/**
 * CRM Bulk Operations Routes
 *
 * Endpoints:
 *   POST /api/crm/bulk/assign-customers
 *   POST /api/crm/bulk/close-stale-deals
 *   GET  /api/crm/bulk/export-deals
 *   GET  /api/crm/bulk/export-activities
 *   POST /api/crm/bulk/import-contacts
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const logger = require('../../utils/logger');
const ExcelJS = require('exceljs');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

// ── Bulk Assign Customers ────────────────────────────────────────────────────
router.post('/assign-customers', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { customerIds, repGroupId } = req.body;
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ success: false, error: 'customerIds array is required' });
    }
    if (!repGroupId) {
      return res.status(400).json({ success: false, error: 'repGroupId is required' });
    }

    // Get group name
    const groupRes = await pool.query(
      'SELECT group_name FROM sales_rep_groups WHERE id = $1', [repGroupId]
    );
    if (groupRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rep group not found' });
    }
    const groupName = groupRes.rows[0].group_name;

    const result = await pool.query(
      `UPDATE fp_customer_unified
       SET sales_rep_group_name = $1, updated_at = NOW()
       WHERE id = ANY($2)
       RETURNING id`,
      [groupName, customerIds.map(Number)]
    );

    res.json({
      success: true,
      data: { updated: result.rowCount, groupName },
    });
  } catch (err) {
    logger.error('CRM Bulk: assign-customers error', err);
    res.status(500).json({ success: false, error: 'Failed to assign customers' });
  }
});

// ── Bulk Close Stale Deals ───────────────────────────────────────────────────
router.post('/close-stale-deals', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { staleDays = 90 } = req.body;

    const result = await pool.query(
      `UPDATE crm_deals
       SET stage = 'lost',
           close_reason = 'Auto-closed: stale for ' || $1 || ' days',
           updated_at = NOW()
       WHERE stage NOT IN ('won', 'lost')
         AND expected_close_date < CURRENT_DATE - ($1 || ' days')::interval
       RETURNING id, title`,
      [staleDays]
    );

    // Record stage history for each
    for (const deal of result.rows) {
      await pool.query(
        `INSERT INTO crm_deal_stage_history (deal_id, from_stage, to_stage, changed_by, note)
         VALUES ($1, 'unknown', 'lost', $2, 'Bulk auto-close: stale deal')`,
        [deal.id, req.user.id]
      ).catch(() => {});
    }

    res.json({
      success: true,
      data: { closed: result.rowCount, deals: result.rows },
    });
  } catch (err) {
    logger.error('CRM Bulk: close-stale-deals error', err);
    res.status(500).json({ success: false, error: 'Failed to close stale deals' });
  }
});


// ── Export Deals to Excel ────────────────────────────────────────────────────
router.get('/export-deals', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT
        d.id, d.title, d.stage, d.estimated_value, d.expected_close_date,
        d.close_reason, d.created_at, d.updated_at,
        c.customer_name, c.country
      FROM crm_deals d
      LEFT JOIN fp_customer_unified c ON c.customer_id = d.customer_id
      ORDER BY d.created_at DESC
    `);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Deals');
    ws.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Customer', key: 'customer_name', width: 25 },
      { header: 'Country', key: 'country', width: 15 },
      { header: 'Stage', key: 'stage', width: 15 },
      { header: 'Est. Value', key: 'estimated_value', width: 15 },
      { header: 'Expected Close', key: 'expected_close_date', width: 15 },
      { header: 'Close Reason', key: 'close_reason', width: 20 },
      { header: 'Created', key: 'created_at', width: 20 },
    ];

    // Style header
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F7FF' } };

    result.rows.forEach(r => ws.addRow(r));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=crm-deals.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error('CRM Bulk: export-deals error', err);
    res.status(500).json({ success: false, error: 'Failed to export deals' });
  }
});

// ── Export Activities to Excel ────────────────────────────────────────────────
router.get('/export-activities', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { from, to } = req.query;
    const conditions = [];
    const params = [];
    let p = 1;

    if (from) { conditions.push(`a.activity_date >= $${p++}`); params.push(from); }
    if (to)   { conditions.push(`a.activity_date <= $${p++}`); params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT
        a.id, a.type, a.rep_name, a.activity_date, a.duration_mins,
        a.outcome_note, a.created_at,
        c.customer_name, c.country
      FROM crm_activities a
      LEFT JOIN fp_customer_unified c ON c.customer_id = a.customer_id
      ${where}
      ORDER BY a.activity_date DESC
      LIMIT 5000
    `, params);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Activities');
    ws.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Rep', key: 'rep_name', width: 20 },
      { header: 'Customer', key: 'customer_name', width: 25 },
      { header: 'Country', key: 'country', width: 15 },
      { header: 'Date', key: 'activity_date', width: 15 },
      { header: 'Duration (min)', key: 'duration_mins', width: 12 },
      { header: 'Note', key: 'outcome_note', width: 40 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F7FF' } };

    result.rows.forEach(r => ws.addRow(r));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=crm-activities.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error('CRM Bulk: export-activities error', err);
    res.status(500).json({ success: false, error: 'Failed to export activities' });
  }
});

// ── Import Contacts from CSV ─────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/import-contacts', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'CSV file is required' });
    }

    const rows = [];
    const errors = [];

    await new Promise((resolve, reject) => {
      const stream = Readable.from(req.file.buffer.toString());
      stream
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: 'CSV file is empty' });
    }

    let imported = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const customerId = parseInt(r.customer_id);
        const name = (r.name || r.contact_name || '').trim();

        if (!customerId || !name) {
          errors.push({ row: i + 2, error: 'Missing customer_id or name' });
          continue;
        }

        try {
          await client.query(
            `INSERT INTO fp_customer_contacts (customer_id, name, designation, phone, email, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              customerId,
              name,
              (r.designation || r.title || '').trim() || null,
              (r.phone || r.mobile || '').trim() || null,
              (r.email || '').trim() || null,
              r.is_primary === 'true' || r.is_primary === '1' || false,
            ]
          );
          imported++;
        } catch (err) {
          errors.push({ row: i + 2, error: err.message });
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      data: { total: rows.length, imported, errors: errors.slice(0, 20) },
    });
  } catch (err) {
    logger.error('CRM Bulk: import-contacts error', err);
    res.status(500).json({ success: false, error: 'Failed to import contacts' });
  }
});

module.exports = router;
