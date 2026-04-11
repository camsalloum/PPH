/**
 * CRM Meetings Routes
 *
 * Endpoints:
 *   POST  /meetings      — create meeting
 *   GET   /meetings      — list meetings
 *   PATCH /meetings/:id  — update meeting (status change, reschedule, etc.)
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool, authPool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

// POST /api/crm/meetings
router.post('/meetings', authenticate, async (req, res) => {
  try {
    const {
      name, description, date_start, date_end, duration_mins,
      location, customer_id, prospect_id, deal_id, assigned_to_id, attendees, reminders
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
      `INSERT INTO crm_meetings
        (name, description, date_start, date_end, duration_mins, location,
         customer_id, prospect_id, deal_id, assigned_to_id, assigned_to_name,
         attendees, reminders, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        name.trim(), description || null, date_start, date_end || null,
        duration_mins || 30, location || null,
        customer_id || null, prospect_id || null, deal_id || null,
        effectiveAssignee, assigneeName,
        JSON.stringify(attendees || []), JSON.stringify(reminders || []), userId
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Meetings table not yet created. Run migrations.' });
    logger.error('CRM: error creating meeting', err);
    res.status(500).json({ success: false, error: 'Failed to create meeting' });
  }
});

// GET /api/crm/meetings
router.get('/meetings', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const isFullAccess = FULL_ACCESS_ROLES.includes(userRole);

    const { status, customerId, prospectId, from, to, limit: limitQ } = req.query;
    const limit = Math.min(parseInt(limitQ) || 20, 100);

    const conditions = [];
    const params = [];
    let p = 1;

    if (!isFullAccess) {
      conditions.push(`m.assigned_to_id = $${p++}`);
      params.push(userId);
    }

    if (status)     { conditions.push(`m.status = $${p++}`);      params.push(status); }
    if (customerId) { conditions.push(`m.customer_id = $${p++}`); params.push(parseInt(customerId)); }
    if (prospectId) { conditions.push(`m.prospect_id = $${p++}`); params.push(parseInt(prospectId)); }
    if (from)       { conditions.push(`m.date_start >= $${p++}`); params.push(from); }
    if (to)         { conditions.push(`m.date_start <= $${p++}`); params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT m.*,
              cu.display_name AS customer_name,
              fp.customer_name AS prospect_name,
              CASE WHEN m.date_start < NOW() AND m.status = 'planned'
                   THEN 'missed' ELSE m.status END AS computed_status
       FROM crm_meetings m
       LEFT JOIN fp_customer_unified cu ON cu.customer_id = m.customer_id
       LEFT JOIN fp_prospects fp ON fp.id = m.prospect_id
       ${where}
       ORDER BY m.date_start DESC
       LIMIT ${limit}`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: [] });
    logger.error('CRM: error fetching meetings', err);
    res.status(500).json({ success: false, error: 'Failed to fetch meetings' });
  }
});

// PATCH /api/crm/meetings/:id
router.patch('/meetings/:id', authenticate, async (req, res) => {
  try {
    const meetingId = parseInt(req.params.id, 10);
    if (!meetingId) return res.status(400).json({ success: false, error: 'Invalid meeting ID' });

    const { name, description, date_start, date_end, duration_mins, location, status, attendees, reminders, customer_id, prospect_id } = req.body;

    const sets = [];
    const params = [];
    let p = 1;

    if (name !== undefined)          { sets.push(`name = $${p++}`);          params.push(name); }
    if (description !== undefined)   { sets.push(`description = $${p++}`);   params.push(description); }
    if (date_start !== undefined)    { sets.push(`date_start = $${p++}`);    params.push(date_start); }
    if (date_end !== undefined)      { sets.push(`date_end = $${p++}`);      params.push(date_end); }
    if (duration_mins !== undefined) { sets.push(`duration_mins = $${p++}`); params.push(duration_mins); }
    if (location !== undefined)      { sets.push(`location = $${p++}`);      params.push(location); }
    if (status !== undefined)        { sets.push(`status = $${p++}`);        params.push(status); }
    if (attendees !== undefined)     { sets.push(`attendees = $${p++}`);     params.push(JSON.stringify(attendees)); }
    if (reminders !== undefined)     { sets.push(`reminders = $${p++}`);     params.push(JSON.stringify(reminders)); }
    if (customer_id !== undefined)   { sets.push(`customer_id = $${p++}`);   params.push(customer_id); }
    if (prospect_id !== undefined)   { sets.push(`prospect_id = $${p++}`);   params.push(prospect_id); }

    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    sets.push(`updated_at = NOW()`);

    params.push(meetingId);
    const result = await pool.query(
      `UPDATE crm_meetings SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Meeting not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Meetings table not yet created.' });
    logger.error('CRM: error updating meeting', err);
    res.status(500).json({ success: false, error: 'Failed to update meeting' });
  }
});

module.exports = router;
