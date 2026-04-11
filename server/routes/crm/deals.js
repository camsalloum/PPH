/**
 * CRM Deals Routes
 *
 * Endpoints:
 *   GET   /deals                      — list deals
 *   POST  /deals                      — create deal
 *   PATCH /deals/:id                  — update deal (stage change, etc.)
 *   GET   /deals/:id/unified-timeline — merged CRM + MES activity timeline
 *   POST  /deals/:id/link-inquiry    — link deal to existing MES inquiry
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool, authPool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const { notifyDealClosed } = require('../../services/crmNotificationService');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

// GET /api/crm/deals
router.get('/deals', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const isFullAccess = FULL_ACCESS_ROLES.includes(userRole);

    const { repId, stage, customerId, status, closeBefore } = req.query;

    const conditions = [];
    const params = [];
    let p = 1;

    if (!isFullAccess) {
      conditions.push(`d.assigned_rep_id = $${p++}`);
      params.push(userId);
    } else if (repId) {
      conditions.push(`d.assigned_rep_id = $${p++}`);
      params.push(parseInt(repId));
    }

    if (stage)       { conditions.push(`d.stage = $${p++}`);       params.push(stage); }
    if (customerId)  { conditions.push(`d.customer_id = $${p++}`); params.push(parseInt(customerId)); }
    if (closeBefore) { conditions.push(`d.expected_close_date <= $${p++}`); params.push(closeBefore); }
    if (status === 'active') { conditions.push(`d.stage NOT IN ('confirmed','lost')`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Apply optional limit (default: no limit for full-access, 100 for reps)
    const limitVal = req.query.limit ? Math.min(parseInt(req.query.limit) || 500, 500) : null;
    const limitClause = limitVal ? `LIMIT $${p++}` : '';
    if (limitVal) params.push(limitVal);

    const result = await pool.query(
      `SELECT d.*,
              COALESCE(cu.display_name, p.customer_name) AS customer_name,
              (d.expected_close_date - CURRENT_DATE) AS days_to_close,
              i.inquiry_stage
       FROM crm_deals d
       LEFT JOIN fp_customer_unified cu ON cu.customer_id = d.customer_id
       LEFT JOIN fp_prospects p ON p.id = d.prospect_id
       LEFT JOIN mes_presales_inquiries i ON i.id = d.inquiry_id
       ${where}
       ORDER BY d.expected_close_date ASC
       ${limitClause}`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: [] });
    logger.error('CRM: error fetching deals', err);
    res.status(500).json({ success: false, error: 'Failed to fetch deals' });
  }
});

// POST /api/crm/deals
router.post('/deals', authenticate, async (req, res) => {
  try {
    const { title, customer_id, prospect_id, contact_id, stage, estimated_value, currency, expected_close_date, assigned_rep_id, inquiry_id, description } = req.body;
    const userId = req.user.id;

    if (!title || !title.trim()) return res.status(400).json({ success: false, error: 'title is required' });
    // Allow either customer_id OR prospect_id (prospect-based deals)
    if (!customer_id && !prospect_id) return res.status(400).json({ success: false, error: 'customer_id or prospect_id is required' });
    if (!expected_close_date) return res.status(400).json({ success: false, error: 'expected_close_date is required' });

    const effectiveRep = assigned_rep_id || userId;
    let repName = null;
    try {
      const rRes = await authPool.query(`SELECT full_name FROM users WHERE id = $1`, [effectiveRep]);
      if (rRes.rows.length > 0) repName = rRes.rows[0].full_name;
    } catch (_) { /* non-critical */ }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO crm_deals (title, customer_id, prospect_id, contact_id, stage, estimated_value, currency, expected_close_date, assigned_rep_id, assigned_rep_name, created_by, inquiry_id, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [title.trim(), customer_id || null, prospect_id || null, contact_id || null, stage || 'interest',
         estimated_value || null, currency || 'AED', expected_close_date,
         effectiveRep, repName, userId, inquiry_id || null, description || null]
      );
      const deal = result.rows[0];
      await client.query(
        `INSERT INTO crm_deal_stage_history (deal_id, from_stage, to_stage, changed_by) VALUES ($1,$2,$3,$4)`,
        [deal.id, null, deal.stage, userId]
      );
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: deal });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('CRM: error creating deal', err);
    res.status(500).json({ success: false, error: 'Failed to create deal' });
  }
});

// PATCH /api/crm/deals/:id
router.patch('/deals/:id', authenticate, async (req, res) => {
  try {
    const dealId = parseInt(req.params.id, 10);
    const userId = req.user.id;
    const userRole = req.user.role;
    const isFullAccess = FULL_ACCESS_ROLES.includes(userRole);

    if (!dealId) return res.status(400).json({ success: false, error: 'Invalid deal ID' });

    const { stage, title, estimated_value, expected_close_date, close_reason, contact_id } = req.body;

    const current = await pool.query(`SELECT * FROM crm_deals WHERE id = $1`, [dealId]);
    if (current.rows.length === 0) return res.status(404).json({ success: false, error: 'Deal not found' });
    const deal = current.rows[0];

    if (['won', 'lost'].includes(deal.stage) && !isFullAccess) {
      return res.status(403).json({ success: false, error: 'Cannot modify a closed deal without manager access' });
    }

    if (stage && ['won', 'lost'].includes(stage) && !close_reason) {
      return res.status(400).json({ success: false, error: 'close_reason is required when moving to won or lost' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sets = ['updated_at = NOW()'];
      const params = [];
      let p = 1;

      if (title !== undefined)              { sets.push(`title = $${p++}`);               params.push(title); }
      if (estimated_value !== undefined)    { sets.push(`estimated_value = $${p++}`);     params.push(estimated_value); }
      if (expected_close_date !== undefined){ sets.push(`expected_close_date = $${p++}`); params.push(expected_close_date); }
      if (contact_id !== undefined)         { sets.push(`contact_id = $${p++}`);          params.push(contact_id); }
      if (close_reason !== undefined)       { sets.push(`close_reason = $${p++}`);        params.push(close_reason); }
      if (stage !== undefined)              { sets.push(`stage = $${p++}`);               params.push(stage); }

      params.push(dealId);
      const result = await client.query(
        `UPDATE crm_deals SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
        params
      );

      if (stage && stage !== deal.stage) {
        await client.query(
          `INSERT INTO crm_deal_stage_history (deal_id, from_stage, to_stage, changed_by, note) VALUES ($1,$2,$3,$4,$5)`,
          [dealId, deal.stage, stage, userId, close_reason || null]
        );
      }

      await client.query('COMMIT');
      const updatedDeal = result.rows[0];
      res.json({ success: true, data: updatedDeal });

      if (stage && ['won', 'lost'].includes(stage) && stage !== deal.stage) {
        notifyDealClosed({
          deal: updatedDeal,
          stage,
          repName: req.user.full_name || req.user.username || 'A rep',
          closeReason: close_reason || null,
        }).catch(() => {});
      }
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('CRM: error updating deal', err);
    res.status(500).json({ success: false, error: 'Failed to update deal' });
  }
});

// GET /api/crm/deals/:id/unified-timeline
router.get('/deals/:id/unified-timeline', authenticate, async (req, res) => {
  try {
    const dealId = parseInt(req.params.id, 10);
    if (!dealId) return res.status(400).json({ success: false, error: 'Invalid deal ID' });

    const dealRes = await pool.query('SELECT id, inquiry_id FROM crm_deals WHERE id = $1', [dealId]);
    if (dealRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Deal not found' });

    const deal = dealRes.rows[0];

    // CRM activities linked to the same inquiry
    let crmActivities = [];
    if (deal.inquiry_id) {
      try {
        const crmRes = await pool.query(
          `SELECT id, type AS action, outcome_note AS details, created_at AS timestamp, rep_name AS actor_name, 'crm' AS source
           FROM crm_activities WHERE inquiry_id = $1
           ORDER BY created_at DESC`,
          [deal.inquiry_id]
        );
        crmActivities = crmRes.rows;
      } catch (e) {
        logger.warn('CRM timeline: crm_activities query failed', e.message);
      }
    }

    // Deal stage history
    let stageHistory = [];
    try {
      const stageRes = await pool.query(
        `SELECT id, from_stage, to_stage AS action, note AS details, changed_at AS timestamp,
                CASE WHEN source = 'mes_sync' THEN 'mes' ELSE 'crm' END AS source
         FROM crm_deal_stage_history WHERE deal_id = $1
         ORDER BY changed_at DESC`,
        [dealId]
      );
      stageHistory = stageRes.rows;
    } catch (e) {
      logger.warn('CRM timeline: stage history query failed', e.message);
    }

    // MES activities for the linked inquiry
    let mesActivities = [];
    if (deal.inquiry_id) {
      try {
        const mesRes = await pool.query(
          `SELECT id, action, details, created_at AS timestamp, user_name AS actor_name, 'mes' AS source
           FROM mes_presales_activity_log WHERE inquiry_id = $1
           ORDER BY created_at DESC`,
          [deal.inquiry_id]
        );
        mesActivities = mesRes.rows;
      } catch (e) {
        logger.warn('CRM timeline: MES activity log query failed', e.message);
      }
    }

    // Merge and sort by timestamp DESC
    const timeline = [
      ...crmActivities.map(r => ({ ...r, type: 'activity' })),
      ...stageHistory.map(r => ({ ...r, type: 'stage_change' })),
      ...mesActivities.map(r => ({ ...r, type: 'activity' })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ success: true, data: timeline });
  } catch (err) {
    logger.error('CRM: error fetching unified timeline', err);
    res.status(500).json({ success: false, error: 'Failed to fetch timeline' });
  }
});

// POST /api/crm/deals/:id/link-inquiry
router.post('/deals/:id/link-inquiry', authenticate, async (req, res) => {
  try {
    const dealId = parseInt(req.params.id, 10);
    const { inquiry_id } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    const isFullAccess = FULL_ACCESS_ROLES.includes(userRole);

    if (!dealId) return res.status(400).json({ success: false, error: 'Invalid deal ID' });
    if (!inquiry_id) return res.status(400).json({ success: false, error: 'inquiry_id is required' });

    // Fetch deal
    const dealRes = await pool.query('SELECT * FROM crm_deals WHERE id = $1', [dealId]);
    if (dealRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Deal not found' });
    const deal = dealRes.rows[0];

    // Owner or management check
    if (!isFullAccess && deal.assigned_rep_id !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Validate inquiry exists and belongs to same customer
    const inqRes = await pool.query('SELECT id, customer_id FROM mes_presales_inquiries WHERE id = $1', [inquiry_id]);
    if (inqRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Inquiry not found' });

    if (deal.customer_id && inqRes.rows[0].customer_id && deal.customer_id !== inqRes.rows[0].customer_id) {
      return res.status(400).json({ success: false, error: 'Inquiry belongs to a different customer' });
    }

    // Check inquiry not already linked to another deal
    const linkedRes = await pool.query('SELECT id FROM crm_deals WHERE inquiry_id = $1 AND id != $2', [inquiry_id, dealId]);
    if (linkedRes.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Inquiry is already linked to another deal' });
    }

    // Update deal
    await pool.query('UPDATE crm_deals SET inquiry_id = $1, updated_at = NOW() WHERE id = $2', [inquiry_id, dealId]);

    res.json({ success: true, message: 'Inquiry linked to deal' });
  } catch (err) {
    logger.error('CRM: error linking inquiry to deal', err);
    res.status(500).json({ success: false, error: 'Failed to link inquiry' });
  }
});

module.exports = router;
