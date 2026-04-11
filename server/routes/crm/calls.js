/**
 * CRM Calls Routes
 *
 * Endpoints:
 *   POST  /calls      — create/log a call
 *   GET   /calls      — list calls
 *   PATCH /calls/:id  — update call
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool, authPool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

// POST /api/crm/calls
router.post('/calls', authenticate, async (req, res) => {
  try {
    const {
      name, description, date_start, duration_mins, direction,
      customer_id, prospect_id, deal_id, assigned_to_id, outcome_note, reminders
    } = req.body;
    const userId = req.user.id;

    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'name is required' });
    if (!date_start) return res.status(400).json({ success: false, error: 'date_start is required' });

    const effectiveAssignee = assigned_to_id || userId;
    let assigneeName = null;
    try {
      const r = await authPool.query(`SELECT full_name FROM users WHERE id = $1`, [effectiveAssignee]);
      if (r.rows.length > 0) assigneeName = r.rows[0].full_name;
    } catch (_) { /* non-critical */ }

    const result = await pool.query(
      `INSERT INTO crm_calls
        (name, description, date_start, duration_mins, direction,
         customer_id, prospect_id, deal_id, assigned_to_id, assigned_to_name,
         outcome_note, reminders, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        name.trim(), description || null, date_start, duration_mins || 5,
        direction || 'outbound',
        customer_id || null, prospect_id || null, deal_id || null,
        effectiveAssignee, assigneeName,
        outcome_note || null, JSON.stringify(reminders || []), userId
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Calls table not yet created. Run migrations.' });
    logger.error('CRM: error creating call', err);
    res.status(500).json({ success: false, error: 'Failed to create call' });
  }
});

// GET /api/crm/calls
router.get('/calls', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const isFullAccess = FULL_ACCESS_ROLES.includes(userRole);

    const { status, direction, customerId, prospectId, from, to, limit: limitQ } = req.query;
    const limit = Math.min(parseInt(limitQ) || 20, 100);

    const conditions = [];
    const params = [];
    let p = 1;

    if (!isFullAccess) {
      conditions.push(`c.assigned_to_id = $${p++}`);
      params.push(userId);
    }

    if (status)     { conditions.push(`c.status = $${p++}`);      params.push(status); }
    if (direction)  { conditions.push(`c.direction = $${p++}`);   params.push(direction); }
    if (customerId) { conditions.push(`c.customer_id = $${p++}`); params.push(parseInt(customerId)); }
    if (prospectId) { conditions.push(`c.prospect_id = $${p++}`); params.push(parseInt(prospectId)); }
    if (from)       { conditions.push(`c.date_start >= $${p++}`); params.push(from); }
    if (to)         { conditions.push(`c.date_start <= $${p++}`); params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT c.*,
              cu.display_name AS customer_name,
              fp.customer_name AS prospect_name
       FROM crm_calls c
       LEFT JOIN fp_customer_unified cu ON cu.customer_id = c.customer_id
       LEFT JOIN fp_prospects fp ON fp.id = c.prospect_id
       ${where}
       ORDER BY c.date_start DESC
       LIMIT ${limit}`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: [] });
    logger.error('CRM: error fetching calls', err);
    res.status(500).json({ success: false, error: 'Failed to fetch calls' });
  }
});

// PATCH /api/crm/calls/:id
router.patch('/calls/:id', authenticate, async (req, res) => {
  try {
    const callId = parseInt(req.params.id, 10);
    if (!callId) return res.status(400).json({ success: false, error: 'Invalid call ID' });

    const { name, description, date_start, duration_mins, direction, status, outcome_note, reminders, customer_id, prospect_id } = req.body;

    const sets = [];
    const params = [];
    let p = 1;

    if (name !== undefined)          { sets.push(`name = $${p++}`);          params.push(name); }
    if (description !== undefined)   { sets.push(`description = $${p++}`);   params.push(description); }
    if (date_start !== undefined)    { sets.push(`date_start = $${p++}`);    params.push(date_start); }
    if (duration_mins !== undefined) { sets.push(`duration_mins = $${p++}`); params.push(duration_mins); }
    if (direction !== undefined)     { sets.push(`direction = $${p++}`);     params.push(direction); }
    if (status !== undefined)        { sets.push(`status = $${p++}`);        params.push(status); }
    if (outcome_note !== undefined)  { sets.push(`outcome_note = $${p++}`);  params.push(outcome_note); }
    if (reminders !== undefined)     { sets.push(`reminders = $${p++}`);     params.push(JSON.stringify(reminders)); }
    if (customer_id !== undefined)   { sets.push(`customer_id = $${p++}`);   params.push(customer_id); }
    if (prospect_id !== undefined)   { sets.push(`prospect_id = $${p++}`);   params.push(prospect_id); }

    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    sets.push(`updated_at = NOW()`);

    params.push(callId);
    const result = await pool.query(
      `UPDATE crm_calls SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Call not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Calls table not yet created.' });
    logger.error('CRM: error updating call', err);
    res.status(500).json({ success: false, error: 'Failed to update call' });
  }
});

module.exports = router;
