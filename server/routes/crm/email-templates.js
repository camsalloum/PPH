/**
 * CRM Email Template Routes
 *
 * Endpoints:
 *   GET    /email-templates
 *   POST   /email-templates
 *   POST   /email-templates/:id/preview
 *   PUT    /email-templates/:id
 *   DELETE /email-templates/:id
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');

const TEMPLATE_ADMIN_ROLES = new Set(['admin', 'manager', 'sales_manager', 'sales_coordinator']);

async function hasEmailTemplatesTable() {
  const check = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'crm_email_templates'
     ) AS ok`
  );
  return !!check.rows[0]?.ok;
}

function normalizeVariables(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  return [];
}

function applyTemplateVariables(input, values) {
  const safe = String(input || '');
  return safe.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const raw = values?.[key];
    return raw === undefined || raw === null ? '' : String(raw);
  });
}

// GET /api/crm/email-templates
router.get('/email-templates', authenticate, async (req, res) => {
  try {
    const exists = await hasEmailTemplatesTable();
    if (!exists) {
      return res.json({ success: true, data: [] });
    }

    const result = await pool.query(
      `SELECT id, owner_user_id, name, category, subject, body_html, variables, is_shared, use_count, created_at, updated_at
       FROM crm_email_templates
       WHERE is_shared = true OR owner_user_id = $1
       ORDER BY is_shared DESC, use_count DESC, created_at DESC
       LIMIT 200`,
      [req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching email templates:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch email templates' });
  }
});

// POST /api/crm/email-templates
router.post('/email-templates', authenticate, async (req, res) => {
  try {
    const exists = await hasEmailTemplatesTable();
    if (!exists) {
      return res.status(503).json({ success: false, error: 'crm_email_templates table not found' });
    }

    const { name, category, subject, body_html, variables, is_shared } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ success: false, error: 'subject is required' });
    }
    if (!body_html || !String(body_html).trim()) {
      return res.status(400).json({ success: false, error: 'body_html is required' });
    }

    const ownerUserId = is_shared ? null : req.user.id;

    const result = await pool.query(
      `INSERT INTO crm_email_templates (
         owner_user_id, name, category, subject, body_html, variables, is_shared
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        ownerUserId,
        String(name).trim(),
        category || null,
        String(subject).trim(),
        String(body_html),
        JSON.stringify(normalizeVariables(variables)),
        !!is_shared,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating email template:', error);
    res.status(500).json({ success: false, error: 'Failed to create email template' });
  }
});

// POST /api/crm/email-templates/:id/preview
router.post('/email-templates/:id/preview', authenticate, async (req, res) => {
  try {
    const exists = await hasEmailTemplatesTable();
    if (!exists) {
      return res.status(503).json({ success: false, error: 'crm_email_templates table not found' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid template id' });
    }

    const templateRes = await pool.query(
      `SELECT id, owner_user_id, name, category, subject, body_html, variables, is_shared
       FROM crm_email_templates
       WHERE id = $1
         AND (is_shared = true OR owner_user_id = $2)
       LIMIT 1`,
      [id, req.user.id]
    );

    if (!templateRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const template = templateRes.rows[0];
    const values = req.body?.variables || {};
    const renderedSubject = applyTemplateVariables(template.subject, values);
    const renderedBodyHtml = applyTemplateVariables(template.body_html, values);

    await pool.query(
      `UPDATE crm_email_templates
       SET use_count = use_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    ).catch(() => null);

    res.json({
      success: true,
      data: {
        id: template.id,
        name: template.name,
        category: template.category,
        variables: template.variables,
        subject: renderedSubject,
        body_html: renderedBodyHtml,
      },
    });
  } catch (error) {
    logger.error('Error previewing email template:', error);
    res.status(500).json({ success: false, error: 'Failed to preview email template' });
  }
});

// POST /api/crm/email-templates/:id/preview
router.post('/email-templates/:id/preview', authenticate, async (req, res) => {
  try {
    const exists = await hasEmailTemplatesTable();
    if (!exists) {
      return res.status(503).json({ success: false, error: 'crm_email_templates table not found' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid template id' });
    }

    const templateRes = await pool.query(
      `SELECT id, owner_user_id, name, category, subject, body_html, variables, is_shared
       FROM crm_email_templates
       WHERE id = $1
         AND (is_shared = true OR owner_user_id = $2)
       LIMIT 1`,
      [id, req.user.id]
    );

    if (!templateRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const template = templateRes.rows[0];
    const values = (req.body && typeof req.body === 'object') ? req.body : {};
    const renderedSubject = applyTemplateVariables(template.subject, values);
    const renderedBodyHtml = applyTemplateVariables(template.body_html, values);

    await pool.query(
      `UPDATE crm_email_templates
       SET use_count = use_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    ).catch(() => null);

    res.json({
      success: true,
      data: {
        id: template.id,
        name: template.name,
        category: template.category,
        variables: template.variables,
        subject: renderedSubject,
        body_html: renderedBodyHtml,
      },
    });
  } catch (error) {
    logger.error('Error previewing email template (POST):', error);
    res.status(500).json({ success: false, error: 'Failed to preview email template' });
  }
});

// PUT /api/crm/email-templates/:id
router.put('/email-templates/:id', authenticate, async (req, res) => {
  try {
    const exists = await hasEmailTemplatesTable();
    if (!exists) {
      return res.status(503).json({ success: false, error: 'crm_email_templates table not found' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid template id' });
    }

    const ownerRes = await pool.query(
      `SELECT owner_user_id, is_shared
       FROM crm_email_templates
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (!ownerRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const row = ownerRes.rows[0];
    const isOwner = row.owner_user_id === req.user.id;
    if (!row.is_shared && !isOwner) {
      return res.status(403).json({ success: false, error: 'Not allowed to edit this template' });
    }
    if (row.is_shared && !TEMPLATE_ADMIN_ROLES.has(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Only admins/managers can edit shared templates' });
    }

    const { name, category, subject, body_html, variables, is_shared } = req.body;
    const sets = [];
    const params = [];
    let p = 1;

    if (name !== undefined) { sets.push(`name = $${p++}`); params.push(String(name).trim()); }
    if (category !== undefined) { sets.push(`category = $${p++}`); params.push(category || null); }
    if (subject !== undefined) { sets.push(`subject = $${p++}`); params.push(String(subject)); }
    if (body_html !== undefined) { sets.push(`body_html = $${p++}`); params.push(String(body_html)); }
    if (variables !== undefined) { sets.push(`variables = $${p++}`); params.push(JSON.stringify(normalizeVariables(variables))); }
    if (is_shared !== undefined) {
      sets.push(`is_shared = $${p++}`);
      params.push(!!is_shared);
      sets.push(`owner_user_id = $${p++}`);
      params.push(is_shared ? null : req.user.id);
    }

    if (!sets.length) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    sets.push('updated_at = NOW()');

    params.push(id);
    const result = await pool.query(
      `UPDATE crm_email_templates
       SET ${sets.join(', ')}
       WHERE id = $${p}
       RETURNING *`,
      params
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating email template:', error);
    res.status(500).json({ success: false, error: 'Failed to update email template' });
  }
});

// DELETE /api/crm/email-templates/:id
router.delete('/email-templates/:id', authenticate, async (req, res) => {
  try {
    const exists = await hasEmailTemplatesTable();
    if (!exists) {
      return res.status(503).json({ success: false, error: 'crm_email_templates table not found' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid template id' });
    }

    const result = await pool.query(
      `DELETE FROM crm_email_templates
       WHERE id = $1
         AND (
           owner_user_id = $2
           OR (is_shared = true AND $3::boolean = true)
         )
       RETURNING id`,
      [id, req.user.id, TEMPLATE_ADMIN_ROLES.has(req.user.role)]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: { id } });
  } catch (error) {
    logger.error('Error deleting email template:', error);
    res.status(500).json({ success: false, error: 'Failed to delete email template' });
  }
});

module.exports = router;
