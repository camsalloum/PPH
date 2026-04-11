/**
 * CRM Activities Routes
 *
 * Endpoints:
 *   POST /activities          — log an activity
 *   GET  /activities          — list activities
 *   GET  /recent-activities   — recent activities (dashboard)
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool, authPool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const { cacheGet, cacheSet } = require('../../services/crmCacheService');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

// POST /api/crm/activities
router.post('/activities', authenticate, async (req, res) => {
  try {
    const { type, customer_id, prospect_id, activity_date, duration_mins, outcome_note } = req.body;
    const userId = req.user.id;

    if (!type) return res.status(400).json({ success: false, error: 'type is required' });
    const validTypes = ['call', 'visit', 'whatsapp', 'email', 'follow_up'];
    if (!validTypes.includes(type)) return res.status(400).json({ success: false, error: `type must be one of: ${validTypes.join(', ')}` });
    if (!customer_id && !prospect_id) return res.status(400).json({ success: false, error: 'customer_id or prospect_id is required' });

    let repName = req.user.full_name || req.user.username || null;
    try {
      const repRes = await authPool.query(`SELECT full_name FROM users WHERE id = $1`, [userId]);
      if (repRes.rows.length > 0) repName = repRes.rows[0].full_name;
    } catch (_) { /* non-critical */ }

    const result = await pool.query(
      `INSERT INTO crm_activities (type, activity_type, customer_id, prospect_id, rep_id, rep_name, activity_date, duration_mins, outcome_note)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [type, customer_id || null, prospect_id || null, userId, repName,
       activity_date || new Date(), duration_mins || null, outcome_note || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Activities table not yet created. Please run migrations.' });
    logger.error('CRM: error creating activity', err);
    res.status(500).json({ success: false, error: 'Failed to create activity' });
  }
});

// GET /api/crm/activities
router.get('/activities', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const isFullAccess = FULL_ACCESS_ROLES.includes(userRole);

    const { customerId, prospectId, repId, type, from, to, limit: limitQ } = req.query;
    const limit = Math.min(parseInt(limitQ) || 20, 100);

    const conditions = [];
    const params = [];
    let p = 1;

    if (!isFullAccess) {
      conditions.push(`a.rep_id = $${p++}`);
      params.push(userId);
    } else if (repId && repId !== 'me') {
      conditions.push(`a.rep_id = $${p++}`);
      params.push(parseInt(repId));
    } else if (repId === 'me') {
      conditions.push(`a.rep_id = $${p++}`);
      params.push(userId);
    }

    if (customerId) { conditions.push(`a.customer_id = $${p++}`); params.push(parseInt(customerId)); }
    if (prospectId) { conditions.push(`a.prospect_id = $${p++}`); params.push(parseInt(prospectId)); }
    if (type)       { conditions.push(`a.type = $${p++}`);        params.push(type); }
    if (from)       { conditions.push(`a.activity_date >= $${p++}`); params.push(from); }
    if (to)         { conditions.push(`a.activity_date <= $${p++}`); params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT a.*,
              cu.display_name AS customer_name,
              fp.customer_name AS prospect_name
       FROM crm_activities a
       LEFT JOIN fp_customer_unified cu ON cu.customer_id = a.customer_id
       LEFT JOIN fp_prospects fp ON fp.id = a.prospect_id
       ${where}
       ORDER BY a.activity_date DESC
       LIMIT $${p}`,
      [...params, limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') return res.json({ success: true, data: [] });
    logger.error('CRM: error fetching activities', err);
    res.status(500).json({ success: false, error: 'Failed to fetch activities' });
  }
});

// GET /api/crm/recent-activities
router.get('/recent-activities', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 30);
    const { group_id } = req.query;

    const raCacheKey = `ra|${group_id || 'all'}|${limit}`;
    const raCached = cacheGet(raCacheKey);
    if (raCached) return res.json(raCached);

    let activities = [];
    try {
      const conditions = [];
      const params = [];
      let p = 1;

      if (group_id && group_id !== 'all') {
        const gid = parseInt(group_id);
        if (!isNaN(gid)) {
          conditions.push(`(a.rep_id IN (SELECT user_id FROM crm_sales_reps WHERE group_id = $${p}) OR a.created_by IN (SELECT user_id FROM crm_sales_reps WHERE group_id = $${p}))`);
          params.push(gid);
          p++;
        }
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const crmResult = await pool.query(`
        SELECT a.id, a.type, a.outcome_note, a.subject,
               a.rep_name, a.created_by_name, a.activity_date, a.created_at,
               cu.display_name AS customer_name,
               fp.customer_name AS prospect_name
        FROM crm_activities a
        LEFT JOIN fp_customer_unified cu ON cu.customer_id = a.customer_id
        LEFT JOIN fp_prospects fp ON fp.id = a.prospect_id
        ${where}
        ORDER BY COALESCE(a.activity_date, a.created_at) DESC
        LIMIT $${p}
      `, [...params, limit]);

      if (crmResult.rows.length > 0) {
        activities = crmResult.rows.map(r => {
          const actType = r.type || 'follow_up';
          const name = r.customer_name || r.prospect_name || '';
          const rep = r.rep_name || r.created_by_name || '';
          const note = r.outcome_note || r.subject || '';
          return {
            type: actType,
            text: name ? `${actType} — ${name}` : `${actType}${note ? ': ' + note : ''}`,
            detail: rep,
            time: r.activity_date || r.created_at,
          };
        });
      }
    } catch (crmErr) {
      logger.warn('recent-activities: crm_activities query failed, using legacy fallback', crmErr.message);
    }

    if (activities.length === 0) {
      const DIVISION = 'FP';
      let prospectGroupFilter = '';
      let prospectGroupParams = [];
      let customerGroupFilter = '';
      let customerGroupParams = [];
      if (group_id && group_id !== 'all') {
        const gid = parseInt(group_id);
        if (!isNaN(gid)) {
          const groupResult = await pool.query('SELECT id, group_name FROM sales_rep_groups WHERE id = $1 LIMIT 1', [gid]);
          if (groupResult.rows.length > 0) {
            prospectGroupFilter = ` AND TRIM(UPPER(sales_rep_group)) = TRIM(UPPER($3))`;
            prospectGroupParams = [groupResult.rows[0].group_name];
            customerGroupFilter = ` AND sales_rep_group_id = $3`;
            customerGroupParams = [groupResult.rows[0].id];
          }
        }
      }

      const [recentProspects, recentCustomers] = await Promise.all([
        pool.query(`
          SELECT id, customer_name, country, sales_rep_group,
                 approval_status, created_at, updated_at, approved_at
          FROM fp_prospects
          WHERE UPPER(division) = $1${prospectGroupFilter}
          ORDER BY GREATEST(COALESCE(approved_at, created_at), COALESCE(updated_at, created_at)) DESC
          LIMIT $2
        `, [DIVISION, limit, ...prospectGroupParams]),
        pool.query(`
          SELECT customer_id, display_name, primary_country,
                 sales_rep_group_name, created_at
          FROM fp_customer_unified
          WHERE division = $1${customerGroupFilter}
          ORDER BY created_at DESC NULLS LAST
          LIMIT $2
        `, [DIVISION, limit, ...customerGroupParams]),
      ]);

      for (const p of recentProspects.rows) {
        const ts = p.approved_at || p.updated_at || p.created_at;
        if (p.approval_status === 'approved') {
          activities.push({ type: 'prospect_approved', text: `Prospect "${p.customer_name}" approved`, detail: p.sales_rep_group || '', time: ts });
        } else if (p.approval_status === 'rejected') {
          activities.push({ type: 'prospect_rejected', text: `Prospect "${p.customer_name}" rejected`, detail: p.sales_rep_group || '', time: ts });
        } else {
          activities.push({ type: 'prospect_new', text: `New prospect "${p.customer_name}" (${p.country || 'N/A'})`, detail: p.sales_rep_group || '', time: p.created_at });
        }
      }
      for (const c of recentCustomers.rows) {
        if (c.created_at) {
          activities.push({ type: 'customer_added', text: `Customer "${c.display_name}" added`, detail: c.sales_rep_group_name || c.primary_country || '', time: c.created_at });
        }
      }
      activities.sort((a, b) => new Date(b.time) - new Date(a.time));
      activities = activities.slice(0, limit);
    }

    const raResp = { success: true, data: activities };
    cacheSet(raCacheKey, raResp);
    res.json(raResp);
  } catch (error) {
    logger.error('Error fetching recent activities:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recent activities', data: [] });
  }
});

module.exports = router;
