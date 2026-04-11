/**
 * CRM Technical Briefs Routes
 *
 * Endpoints:
 *   GET   /technical-briefs          — list briefs for a customer
 *   POST  /technical-briefs          — create a brief (only product_description required)
 *   PUT   /technical-briefs/:id      — update a brief
 *   POST  /technical-briefs/:id/convert — convert brief to pre-sales inquiry
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const { resolveRepGroup } = require('../../services/crmService');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

// GET /api/crm/technical-briefs?customer_id=X
router.get('/technical-briefs', authenticate, async (req, res) => {
  try {
    const { customer_id } = req.query;
    if (!customer_id) return res.status(400).json({ success: false, error: 'customer_id is required' });

    const isFullAccess = FULL_ACCESS_ROLES.includes(req.user.role);
    const rep = isFullAccess ? { fullName: req.user.full_name || req.user.username, groupId: null, groupName: null } : await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const result = await pool.query(
      `SELECT tb.*, cu.display_name AS customer_name
       FROM crm_technical_briefs tb
       LEFT JOIN fp_customer_unified cu ON cu.customer_id = tb.customer_id
       WHERE tb.customer_id = $1
       ORDER BY tb.created_at DESC`,
      [parseInt(customer_id)]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('CRM: error fetching technical briefs', err);
    res.status(500).json({ success: false, error: 'Failed to fetch technical briefs' });
  }
});

// POST /api/crm/technical-briefs
router.post('/technical-briefs', authenticate, async (req, res) => {
  try {
    const isFullAccess = FULL_ACCESS_ROLES.includes(req.user.role);
    const rep = isFullAccess ? { fullName: req.user.full_name || req.user.username, groupId: null, groupName: null } : await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const { customer_id, product_description, product_category, substrate_interest,
            approx_dimensions, print_colors, barrier_requirements, annual_volume_est,
            target_price_range, current_supplier, decision_timeline, next_step_agreed } = req.body;

    if (!customer_id) return res.status(400).json({ success: false, error: 'customer_id is required' });
    if (!product_description || !product_description.trim()) {
      return res.status(400).json({ success: false, error: 'product_description is required' });
    }

    const result = await pool.query(
      `INSERT INTO crm_technical_briefs
         (customer_id, created_by, product_description, product_category, substrate_interest,
          approx_dimensions, print_colors, barrier_requirements, annual_volume_est,
          target_price_range, current_supplier, decision_timeline, next_step_agreed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [parseInt(customer_id), req.user.id, product_description.trim(),
       product_category || null, substrate_interest || null,
       approx_dimensions || null, print_colors || null, barrier_requirements || null,
       annual_volume_est || null, target_price_range || null, current_supplier || null,
       decision_timeline || null, next_step_agreed || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('CRM: error creating technical brief', err);
    res.status(500).json({ success: false, error: 'Failed to create technical brief' });
  }
});

// PUT /api/crm/technical-briefs/:id
router.put('/technical-briefs/:id', authenticate, async (req, res) => {
  try {
    const briefId = parseInt(req.params.id, 10);
    if (!briefId) return res.status(400).json({ success: false, error: 'Invalid brief ID' });

    const isFullAccess = FULL_ACCESS_ROLES.includes(req.user.role);
    const rep = isFullAccess ? { fullName: req.user.full_name || req.user.username, groupId: null, groupName: null } : await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    // Verify ownership
    const existing = await pool.query(`SELECT * FROM crm_technical_briefs WHERE id = $1`, [briefId]);
    if (!existing.rows.length) return res.status(404).json({ success: false, error: 'Brief not found' });
    if (existing.rows[0].status === 'converted') {
      return res.status(400).json({ success: false, error: 'Cannot edit a converted brief' });
    }

    const { product_description, product_category, substrate_interest,
            approx_dimensions, print_colors, barrier_requirements, annual_volume_est,
            target_price_range, current_supplier, decision_timeline, next_step_agreed, status } = req.body;

    const sets = ['updated_at = NOW()'];
    const params = [];
    let p = 1;

    if (product_description !== undefined) { sets.push(`product_description = $${p++}`); params.push(product_description); }
    if (product_category !== undefined)    { sets.push(`product_category = $${p++}`);    params.push(product_category); }
    if (substrate_interest !== undefined)  { sets.push(`substrate_interest = $${p++}`);  params.push(substrate_interest); }
    if (approx_dimensions !== undefined)   { sets.push(`approx_dimensions = $${p++}`);   params.push(approx_dimensions); }
    if (print_colors !== undefined)        { sets.push(`print_colors = $${p++}`);        params.push(print_colors); }
    if (barrier_requirements !== undefined){ sets.push(`barrier_requirements = $${p++}`); params.push(barrier_requirements); }
    if (annual_volume_est !== undefined)   { sets.push(`annual_volume_est = $${p++}`);   params.push(annual_volume_est); }
    if (target_price_range !== undefined)  { sets.push(`target_price_range = $${p++}`);  params.push(target_price_range); }
    if (current_supplier !== undefined)    { sets.push(`current_supplier = $${p++}`);    params.push(current_supplier); }
    if (decision_timeline !== undefined)   { sets.push(`decision_timeline = $${p++}`);   params.push(decision_timeline); }
    if (next_step_agreed !== undefined)    { sets.push(`next_step_agreed = $${p++}`);    params.push(next_step_agreed); }
    if (status !== undefined && ['draft', 'submitted'].includes(status)) {
      sets.push(`status = $${p++}`); params.push(status);
    }

    params.push(briefId);
    const result = await pool.query(
      `UPDATE crm_technical_briefs SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
      params
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('CRM: error updating technical brief', err);
    res.status(500).json({ success: false, error: 'Failed to update technical brief' });
  }
});

// POST /api/crm/technical-briefs/:id/convert — convert brief to pre-sales inquiry
router.post('/technical-briefs/:id/convert', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const briefId = parseInt(req.params.id, 10);
    if (!briefId) return res.status(400).json({ success: false, error: 'Invalid brief ID' });

    const isFullAccess = FULL_ACCESS_ROLES.includes(req.user.role);
    const rep = isFullAccess ? { fullName: req.user.full_name || req.user.username, groupId: null, groupName: null } : await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    await client.query('BEGIN');

    const briefRes = await client.query(`SELECT * FROM crm_technical_briefs WHERE id = $1`, [briefId]);
    if (!briefRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Brief not found' });
    }
    const brief = briefRes.rows[0];
    if (brief.status === 'converted') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Brief already converted' });
    }

    // Get customer name for the inquiry
    const custRes = await client.query(
      `SELECT display_name, customer_name, country FROM fp_customer_unified WHERE customer_id = $1`,
      [brief.customer_id]
    );
    const cust = custRes.rows[0] || {};
    const customerName = cust.display_name || cust.customer_name || 'Unknown';

    // Build product_groups from brief data
    const productGroups = brief.product_category ? [brief.product_category] : [];

    // Create inquiry
    const inquiryRes = await client.query(
      `INSERT INTO mes_presales_inquiries (
         inquiry_number, division, sales_rep_group_id, sales_rep_group_name,
         source, source_detail, customer_type, customer_id, customer_name, customer_country,
         product_groups, estimated_quantity, quantity_unit, priority, notes, inquiry_type
       ) VALUES (
         (SELECT generate_inquiry_number('FP')), 'FP', $1, $2,
         'technical_brief', $3, 'existing', $4, $5, $6,
         $7, $8, 'KGS', 'normal', $9, 'sar'
       ) RETURNING *`,
      [
        rep.groupId, rep.groupName,
        `Converted from Technical Brief #${briefId}`,
        brief.customer_id, customerName, cust.country || null,
        JSON.stringify(productGroups),
        brief.annual_volume_est || null,
        [brief.product_description, brief.barrier_requirements, brief.next_step_agreed]
          .filter(Boolean).join(' | ')
      ]
    );
    const inquiry = inquiryRes.rows[0];

    // Update brief: set status to converted, store inquiry_id
    await client.query(
      `UPDATE crm_technical_briefs SET status = 'converted', inquiry_id = $1, updated_at = NOW() WHERE id = $2`,
      [inquiry.id, briefId]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: { brief: { ...brief, status: 'converted', inquiry_id: inquiry.id }, inquiry } });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('CRM: error converting technical brief', err);
    res.status(500).json({ success: false, error: 'Failed to convert technical brief' });
  } finally {
    client.release();
  }
});

module.exports = router;
