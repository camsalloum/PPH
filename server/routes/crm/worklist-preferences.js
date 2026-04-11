/**
 * CRM Worklist Preferences Routes
 *
 * Endpoints:
 *   GET    /worklist/preferences?type=tasks|meetings|calls|deals
 *   PUT    /worklist/preferences/:type
 *   DELETE /worklist/preferences/:type
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');

const ALLOWED_TYPES = new Set(['tasks', 'meetings', 'calls', 'deals']);

router.get('/worklist/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.query;

    if (type && !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ success: false, error: 'Invalid worklist type' });
    }

    if (type) {
      const result = await pool.query(
        `SELECT user_id, list_type, default_status, default_query, updated_at
         FROM crm_worklist_preferences
         WHERE user_id = $1 AND list_type = $2`,
        [userId, type]
      );
      return res.json({ success: true, data: result.rows[0] || null });
    }

    const result = await pool.query(
      `SELECT user_id, list_type, default_status, default_query, updated_at
       FROM crm_worklist_preferences
       WHERE user_id = $1
       ORDER BY list_type`,
      [userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: req.query.type ? null : [] });
    logger.error('CRM: error fetching worklist preferences', err);
    res.status(500).json({ success: false, error: 'Failed to fetch worklist preferences' });
  }
});

router.put('/worklist/preferences/:type', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const listType = String(req.params.type || '').toLowerCase();

    if (!ALLOWED_TYPES.has(listType)) {
      return res.status(400).json({ success: false, error: 'Invalid worklist type' });
    }

    const { status, q } = req.body || {};
    const defaultStatus = status ? String(status).trim() : null;
    const defaultQuery = q ? String(q).trim() : null;

    const result = await pool.query(
      `INSERT INTO crm_worklist_preferences (user_id, list_type, default_status, default_query)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, list_type)
       DO UPDATE SET
         default_status = EXCLUDED.default_status,
         default_query = EXCLUDED.default_query,
         updated_at = NOW()
       RETURNING user_id, list_type, default_status, default_query, updated_at`,
      [userId, listType, defaultStatus, defaultQuery]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Worklist preferences table not ready. Please run migrations.' });
    }
    logger.error('CRM: error saving worklist preferences', err);
    res.status(500).json({ success: false, error: 'Failed to save worklist preferences' });
  }
});

router.delete('/worklist/preferences/:type', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const listType = String(req.params.type || '').toLowerCase();

    if (!ALLOWED_TYPES.has(listType)) {
      return res.status(400).json({ success: false, error: 'Invalid worklist type' });
    }

    await pool.query(
      `DELETE FROM crm_worklist_preferences WHERE user_id = $1 AND list_type = $2`,
      [userId, listType]
    );

    res.json({ success: true });
  } catch (err) {
    logger.error('CRM: error deleting worklist preferences', err);
    res.status(500).json({ success: false, error: 'Failed to clear worklist preferences' });
  }
});

module.exports = router;
