/**
 * CRM Analytics Routes
 *
 * Endpoints:
 *   GET /api/crm/analytics/activity-leaderboard
 *   GET /api/crm/analytics/deal-funnel
 *   GET /api/crm/analytics/deal-cycle-time
 *   GET /api/crm/analytics/revenue-forecast
 *   GET /api/crm/analytics/engagement-scores
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const logger = require('../../utils/logger');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

// ── Activity Leaderboard ─────────────────────────────────────────────────────
router.get('/activity-leaderboard', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { period = 'month' } = req.query;
    const PERIOD_MAP = { week: '7 days', month: '30 days', quarter: '90 days' };
    const interval = PERIOD_MAP[period] || '30 days';
    const useYtd = period === 'ytd';

    const dateFilter = useYtd
      ? `a.activity_date >= date_trunc('year', CURRENT_DATE)`
      : `a.activity_date >= CURRENT_DATE - $1::interval`;
    const params = useYtd ? [] : [interval];

    const result = await pool.query(`
      SELECT
        a.rep_id,
        a.rep_name,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE a.type = 'call')     AS calls,
        COUNT(*) FILTER (WHERE a.type = 'visit')    AS visits,
        COUNT(*) FILTER (WHERE a.type = 'email')    AS emails,
        COUNT(*) FILTER (WHERE a.type = 'whatsapp') AS whatsapp,
        COUNT(*) FILTER (WHERE a.type = 'follow_up') AS follow_ups
      FROM crm_activities a
      WHERE ${dateFilter}
        AND a.rep_id IS NOT NULL
      GROUP BY a.rep_id, a.rep_name
      ORDER BY total DESC
    `, params);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('CRM Analytics: activity-leaderboard error', err);
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
});


// ── Deal Conversion Funnel ───────────────────────────────────────────────────
router.get('/deal-funnel', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    // Count deals that have ever been in each stage
    const result = await pool.query(`
      SELECT
        h.to_stage AS stage,
        COUNT(DISTINCT h.deal_id) AS deal_count
      FROM crm_deal_stage_history h
      GROUP BY h.to_stage
      ORDER BY
        CASE h.to_stage
          WHEN 'qualified' THEN 1
          WHEN 'proposal' THEN 2
          WHEN 'negotiation' THEN 3
          WHEN 'won' THEN 4
          WHEN 'lost' THEN 5
          ELSE 6
        END
    `);

    // Also get current stage counts
    const currentRes = await pool.query(`
      SELECT stage, COUNT(*) AS count
      FROM crm_deals
      GROUP BY stage
    `);

    res.json({
      success: true,
      data: {
        funnel: result.rows,
        current: currentRes.rows,
      },
    });
  } catch (err) {
    logger.error('CRM Analytics: deal-funnel error', err);
    res.status(500).json({ success: false, error: 'Failed to fetch deal funnel' });
  }
});

// ── Deal Cycle Time ──────────────────────────────────────────────────────────
router.get('/deal-cycle-time', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT
        h.from_stage,
        h.to_stage,
        ROUND(AVG(EXTRACT(EPOCH FROM (h.changed_at - prev.changed_at)) / 86400), 1) AS avg_days,
        COUNT(*) AS transitions
      FROM crm_deal_stage_history h
      LEFT JOIN LATERAL (
        SELECT changed_at
        FROM crm_deal_stage_history h2
        WHERE h2.deal_id = h.deal_id AND h2.changed_at < h.changed_at
        ORDER BY h2.changed_at DESC
        LIMIT 1
      ) prev ON true
      WHERE prev.changed_at IS NOT NULL
      GROUP BY h.from_stage, h.to_stage
      ORDER BY transitions DESC
    `);

    // Overall average: creation to won
    const overallRes = await pool.query(`
      SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (d.updated_at - d.created_at)) / 86400), 1) AS avg_days_to_close,
        COUNT(*) AS closed_deals
      FROM crm_deals d
      WHERE d.stage IN ('won', 'lost')
    `);

    res.json({
      success: true,
      data: {
        transitions: result.rows,
        overall: overallRes.rows[0] || { avg_days_to_close: 0, closed_deals: 0 },
      },
    });
  } catch (err) {
    logger.error('CRM Analytics: deal-cycle-time error', err);
    res.status(500).json({ success: false, error: 'Failed to fetch cycle time' });
  }
});

// ── Revenue Forecast (Weighted Pipeline) ─────────────────────────────────────
router.get('/revenue-forecast', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    // Stage probabilities
    const STAGE_PROB = { qualified: 0.2, proposal: 0.4, negotiation: 0.7 };

    const result = await pool.query(`
      SELECT
        d.stage,
        COUNT(*) AS deal_count,
        COALESCE(SUM(d.estimated_value), 0) AS total_value,
        COALESCE(SUM(d.estimated_value), 0) *
          CASE d.stage
            WHEN 'qualified' THEN 0.2
            WHEN 'proposal' THEN 0.4
            WHEN 'negotiation' THEN 0.7
            ELSE 0
          END AS weighted_value
      FROM crm_deals d
      WHERE d.stage NOT IN ('won', 'lost')
      GROUP BY d.stage
      ORDER BY
        CASE d.stage
          WHEN 'qualified' THEN 1
          WHEN 'proposal' THEN 2
          WHEN 'negotiation' THEN 3
          ELSE 4
        END
    `);

    const totalWeighted = result.rows.reduce((sum, r) => sum + parseFloat(r.weighted_value || 0), 0);
    const totalPipeline = result.rows.reduce((sum, r) => sum + parseFloat(r.total_value || 0), 0);

    res.json({
      success: true,
      data: {
        stages: result.rows.map(r => ({
          ...r,
          total_value: parseFloat(r.total_value),
          weighted_value: parseFloat(r.weighted_value),
          probability: STAGE_PROB[r.stage] || 0,
        })),
        totalPipeline,
        totalWeighted,
      },
    });
  } catch (err) {
    logger.error('CRM Analytics: revenue-forecast error', err);
    res.status(500).json({ success: false, error: 'Failed to fetch revenue forecast' });
  }
});

// ── Customer Engagement Scores ───────────────────────────────────────────────
router.get('/engagement-scores', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { limit = 20 } = req.query;

    // Score = activities(30d)*3 + notes(30d)*2 + tasks(30d)*1
    const result = await pool.query(`
      SELECT
        c.customer_id AS customer_id,
        c.display_name AS customer_name,
        c.primary_country AS country,
        COALESCE(act.cnt, 0) AS activity_count,
        COALESCE(n.cnt, 0)   AS note_count,
        COALESCE(t.cnt, 0)   AS task_count,
        (COALESCE(act.cnt, 0) * 3 + COALESCE(n.cnt, 0) * 2 + COALESCE(t.cnt, 0)) AS score
      FROM fp_customer_unified c
      LEFT JOIN (
        SELECT customer_id, COUNT(*) AS cnt
        FROM crm_activities
        WHERE activity_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY customer_id
      ) act ON act.customer_id = c.customer_id
      LEFT JOIN (
        SELECT record_id AS customer_id, COUNT(*) AS cnt
        FROM crm_notes
        WHERE record_type = 'customer' AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY record_id
      ) n ON n.customer_id = c.customer_id
      LEFT JOIN (
        SELECT customer_id, COUNT(*) AS cnt
        FROM crm_tasks
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY customer_id
      ) t ON t.customer_id = c.customer_id
      WHERE c.division = 'FP'
      ORDER BY score ASC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('CRM Analytics: engagement-scores error', err);
    res.status(500).json({ success: false, error: 'Failed to fetch engagement scores' });
  }
});

module.exports = router;
