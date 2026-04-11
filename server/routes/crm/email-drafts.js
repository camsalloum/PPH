/**
 * CRM Email Drafts Routes
 *
 * Endpoints:
 *   GET    /email-drafts
 *   POST   /email-drafts
 *   PATCH  /email-drafts/:id
 *   DELETE /email-drafts/:id
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');

async function hasEmailDraftsTable() {
  const check = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'crm_email_drafts'
     ) AS ok`
  );
  return !!check.rows[0]?.ok;
}

// GET /api/crm/email-drafts
router.get('/email-drafts', authenticate, async (req, res) => {
  try {
    const exists = await hasEmailDraftsTable();
    if (!exists) {
      return res.json({ success: true, data: [] });
    }

    const dueToday = String(req.query.due_today || 'false').toLowerCase() === 'true';
    const status = req.query.status || null;

    const params = [req.user.id];
    const clauses = ['rep_id = $1'];
    let p = 2;

    if (dueToday) {
      clauses.push('due_by = CURRENT_DATE');
    }
    if (status) {
      clauses.push(`status = $${p++}`);
      params.push(status);
    }

    const result = await pool.query(
      `SELECT id, rep_id, to_customer_id, to_prospect_id, inquiry_id,
              to_emails, cc_emails, subject, body_html, body_notes,
              template_id, due_by, status, graph_draft_id, sent_graph_msg_id,
              send_via, created_at, sent_at
       FROM crm_email_drafts
       WHERE ${clauses.join(' AND ')}
       ORDER BY due_by ASC NULLS LAST, created_at DESC
       LIMIT 100`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching email drafts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch email drafts' });
  }
});

// POST /api/crm/email-drafts
router.post('/email-drafts', authenticate, async (req, res) => {
  try {
    const exists = await hasEmailDraftsTable();
    if (!exists) {
      return res.status(503).json({ success: false, error: 'crm_email_drafts table not found' });
    }

    const {
      to_customer_id,
      to_prospect_id,
      inquiry_id,
      to_emails,
      cc_emails,
      subject,
      body_html,
      body_notes,
      template_id,
      due_by,
      status,
      send_via,
    } = req.body;

    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ success: false, error: 'subject is required' });
    }

    const result = await pool.query(
      `INSERT INTO crm_email_drafts (
         rep_id, to_customer_id, to_prospect_id, inquiry_id,
         to_emails, cc_emails, subject, body_html, body_notes,
         template_id, due_by, status, send_via
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        req.user.id,
        to_customer_id || null,
        to_prospect_id || null,
        inquiry_id || null,
        JSON.stringify(to_emails || []),
        JSON.stringify(cc_emails || []),
        String(subject).trim(),
        body_html || null,
        body_notes || null,
        template_id || null,
        due_by || null,
        status || 'pending',
        send_via || 'outlook',
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating email draft:', error);
    res.status(500).json({ success: false, error: 'Failed to create email draft' });
  }
});

// PATCH /api/crm/email-drafts/:id
router.patch('/email-drafts/:id', authenticate, async (req, res) => {
  try {
    const exists = await hasEmailDraftsTable();
    if (!exists) {
      return res.status(503).json({ success: false, error: 'crm_email_drafts table not found' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid draft id' });
    }

    const {
      to_customer_id,
      to_prospect_id,
      inquiry_id,
      to_emails,
      cc_emails,
      subject,
      body_html,
      body_notes,
      template_id,
      due_by,
      status,
      graph_draft_id,
      sent_graph_msg_id,
      send_via,
      sent_at,
    } = req.body;

    const sets = [];
    const params = [];
    let p = 1;

    if (to_customer_id !== undefined) { sets.push(`to_customer_id = $${p++}`); params.push(to_customer_id); }
    if (to_prospect_id !== undefined) { sets.push(`to_prospect_id = $${p++}`); params.push(to_prospect_id); }
    if (inquiry_id !== undefined) { sets.push(`inquiry_id = $${p++}`); params.push(inquiry_id); }
    if (to_emails !== undefined) { sets.push(`to_emails = $${p++}`); params.push(JSON.stringify(to_emails || [])); }
    if (cc_emails !== undefined) { sets.push(`cc_emails = $${p++}`); params.push(JSON.stringify(cc_emails || [])); }
    if (subject !== undefined) { sets.push(`subject = $${p++}`); params.push(subject); }
    if (body_html !== undefined) { sets.push(`body_html = $${p++}`); params.push(body_html); }
    if (body_notes !== undefined) { sets.push(`body_notes = $${p++}`); params.push(body_notes); }
    if (template_id !== undefined) { sets.push(`template_id = $${p++}`); params.push(template_id); }
    if (due_by !== undefined) { sets.push(`due_by = $${p++}`); params.push(due_by); }
    if (status !== undefined) { sets.push(`status = $${p++}`); params.push(status); }
    if (graph_draft_id !== undefined) { sets.push(`graph_draft_id = $${p++}`); params.push(graph_draft_id); }
    if (sent_graph_msg_id !== undefined) { sets.push(`sent_graph_msg_id = $${p++}`); params.push(sent_graph_msg_id); }
    if (send_via !== undefined) { sets.push(`send_via = $${p++}`); params.push(send_via); }
    if (sent_at !== undefined) { sets.push(`sent_at = $${p++}`); params.push(sent_at); }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id, req.user.id);
    const result = await pool.query(
      `UPDATE crm_email_drafts
       SET ${sets.join(', ')}
       WHERE id = $${p++} AND rep_id = $${p}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating email draft:', error);
    res.status(500).json({ success: false, error: 'Failed to update email draft' });
  }
});

// DELETE /api/crm/email-drafts/:id
router.delete('/email-drafts/:id', authenticate, async (req, res) => {
  try {
    const exists = await hasEmailDraftsTable();
    if (!exists) {
      return res.status(503).json({ success: false, error: 'crm_email_drafts table not found' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid draft id' });
    }

    const result = await pool.query(
      `DELETE FROM crm_email_drafts
       WHERE id = $1 AND rep_id = $2
       RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    res.json({ success: true, data: { id } });
  } catch (error) {
    logger.error('Error deleting email draft:', error);
    res.status(500).json({ success: false, error: 'Failed to delete email draft' });
  }
});

module.exports = router;
