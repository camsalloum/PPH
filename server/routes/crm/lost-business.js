/**
 * Lost Business Routes
 * Track customers marked as "lost business" by sales reps with reasons.
 *
 * Routes:
 *   GET  /lost-business          – list lost business for current rep (or all for admin)
 *   POST /lost-business          – mark a customer as lost business
 *   PATCH /lost-business/:id     – update reason/notes
 *   POST /lost-business/:id/recover – mark a lost customer as recovered
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const logger = require('../../utils/logger');
const { pool, authPool } = require('../../database/config');
const { resolveRepGroup } = require('../../services/crmService');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

// ── Ensure table exists (runs once on first request) ──────────────────────────
let tableEnsured = false;
async function ensureTable(pool) {
  if (tableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_lost_business (
        id              SERIAL PRIMARY KEY,
        customer_id     INTEGER NOT NULL,
        marked_by       INTEGER NOT NULL,
        marked_by_name  VARCHAR(200),
        reason          VARCHAR(50) NOT NULL DEFAULT 'other',
        notes           TEXT,
        lost_date       DATE NOT NULL DEFAULT CURRENT_DATE,
        last_order_amount NUMERIC(14,2),
        last_order_month  VARCHAR(7),
        monthly_avg_revenue NUMERIC(14,2),
        is_recovered    BOOLEAN NOT NULL DEFAULT false,
        recovered_at    TIMESTAMPTZ,
        recovered_note  TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Create unique partial index (ignore if exists)
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_lost_business_active
        ON crm_lost_business (customer_id, marked_by)
        WHERE is_recovered = false
    `);
    tableEnsured = true;
  } catch (err) {
    // Table might already exist — that's fine
    if (err.code !== '42P07') logger.warn('Lost business table ensure warning:', err.message);
    tableEnsured = true;
  }
}

// ── Valid reason values ───────────────────────────────────────────────────────
const VALID_REASONS = [
  'competitor', 'price', 'quality', 'service',
  'closed_business', 'relocated', 'no_demand', 'payment_issues', 'other'
];

const REASON_LABELS = {
  competitor: 'Lost to Competitor',
  price: 'Pricing Issue',
  quality: 'Quality Complaints',
  service: 'Poor Service',
  closed_business: 'Customer Closed/Bankrupt',
  relocated: 'Relocated',
  no_demand: 'No Longer Needs Products',
  payment_issues: 'Payment/Credit Issues',
  other: 'Other',
};

// ── GET /lost-business ────────────────────────────────────────────────────────
router.get('/lost-business', authenticate, async (req, res) => {
  try {
    await ensureTable(pool);

    const userId = req.user.id;
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
    const includeRecovered = req.query.include_recovered === 'true';
    const { search, reason } = req.query;

    let query = `
      SELECT lb.*,
             cu.display_name AS customer_name,
             cu.primary_country AS country,
             cu.normalized_name,
             cu.total_amount_all_time
      FROM crm_lost_business lb
      LEFT JOIN fp_customer_unified cu ON cu.customer_id = lb.customer_id
    `;
    const conditions = [];
    const params = [];

    if (!includeRecovered) {
      conditions.push('lb.is_recovered = false');
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(cu.display_name ILIKE $${params.length} OR lb.notes ILIKE $${params.length})`);
    }

    if (reason && VALID_REASONS.includes(reason)) {
      params.push(reason);
      conditions.push(`lb.reason = $${params.length}`);
    }
    if (!isAdmin) {
      const rep = await resolveRepGroup(userId);
      if (!rep) {
        return res.status(403).json({ success: false, error: 'Rep profile not found' });
      }
      if (rep.groupId) {
        params.push(rep.groupId, `%${rep.firstName}%`);
        conditions.push(
          `(cu.sales_rep_group_id = $${params.length - 1} OR (cu.sales_rep_group_id IS NULL AND cu.primary_sales_rep_name ILIKE $${params.length}))`
        );
      } else {
        params.push(`%${rep.firstName}%`);
        conditions.push(`cu.primary_sales_rep_name ILIKE $${params.length}`);
      }
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY lb.created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      reasons: REASON_LABELS,
    });
  } catch (err) {
    logger.error('Error fetching lost business:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch lost business' });
  }
});

// ── POST /lost-business ───────────────────────────────────────────────────────
router.post('/lost-business', authenticate, async (req, res) => {
  try {
    await ensureTable(pool);

    const userId = req.user.id;
    const {
      customer_id, reason, notes,
      last_order_amount, last_order_month, monthly_avg_revenue,
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'customer_id is required' });
    }
    if (reason && !VALID_REASONS.includes(reason)) {
      return res.status(400).json({ success: false, error: `Invalid reason. Must be one of: ${VALID_REASONS.join(', ')}` });
    }

    // Customer ownership check for non-admin users
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      const rep = await resolveRepGroup(userId);
      if (!rep) return res.status(403).json({ success: false, error: 'Access denied' });
      const ownershipCheck = await pool.query(
        `SELECT 1 FROM fp_customer_unified WHERE customer_id = $1 AND (sales_rep_group_id = $2 OR (sales_rep_group_id IS NULL AND primary_sales_rep_name ILIKE $3))`,
        [customer_id, rep.groupId, `%${rep.firstName}%`]
      );
      if (ownershipCheck.rows.length === 0) return res.status(403).json({ success: false, error: 'Access denied — not your customer' });
    }

    // Get user name
    let markedByName = null;
    try {
      const u = await authPool.query('SELECT full_name FROM users WHERE id = $1', [userId]);
      if (u.rows.length > 0) markedByName = u.rows[0].full_name;
    } catch (_) { /* ignore */ }

    const result = await pool.query(
      `INSERT INTO crm_lost_business
         (customer_id, marked_by, marked_by_name, reason, notes,
          last_order_amount, last_order_month, monthly_avg_revenue)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (customer_id, marked_by) WHERE is_recovered = false
       DO UPDATE SET
         reason = EXCLUDED.reason,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING *`,
      [
        customer_id, userId, markedByName,
        reason || 'other', notes || null,
        last_order_amount || null, last_order_month || null, monthly_avg_revenue || null,
      ]
    );

    logger.info(`Lost business marked: customer ${customer_id} by user ${userId}`);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Error marking lost business:', err);
    res.status(500).json({ success: false, error: 'Failed to mark lost business' });
  }
});

// ── PATCH /lost-business/:id ──────────────────────────────────────────────────
router.patch('/lost-business/:id', authenticate, async (req, res) => {
  try {
    await ensureTable(pool);

    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
    const { reason, notes } = req.body;

    if (reason && !VALID_REASONS.includes(reason)) {
      return res.status(400).json({ success: false, error: 'Invalid reason' });
    }

    // Ownership check
    const existing = await pool.query('SELECT * FROM crm_lost_business WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    if (!isAdmin && existing.rows[0].marked_by !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to edit this record' });
    }

    const sets = [];
    const params = [];
    if (reason !== undefined) { params.push(reason); sets.push(`reason = $${params.length}`); }
    if (notes !== undefined) { params.push(notes); sets.push(`notes = $${params.length}`); }
    sets.push('updated_at = NOW()');
    params.push(id);

    const result = await pool.query(
      `UPDATE crm_lost_business SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Error updating lost business:', err);
    res.status(500).json({ success: false, error: 'Failed to update' });
  }
});

// ── POST /lost-business/:id/recover ───────────────────────────────────────────
router.post('/lost-business/:id/recover', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
    const { note } = req.body;

    const existing = await pool.query('SELECT * FROM crm_lost_business WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    if (!isAdmin && existing.rows[0].marked_by !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const result = await pool.query(
      `UPDATE crm_lost_business
       SET is_recovered = true, recovered_at = NOW(), recovered_note = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [note || null, id]
    );

    logger.info(`Lost business recovered: record ${id} by user ${userId}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Error recovering lost business:', err);
    res.status(500).json({ success: false, error: 'Failed to recover' });
  }
});

// ── GET /lost-business/reasons ────────────────────────────────────────────────
router.get('/lost-business/reasons', authenticate, (req, res) => {
  res.json({ success: true, data: REASON_LABELS });
});

module.exports = router;
