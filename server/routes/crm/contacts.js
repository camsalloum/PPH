/**
 * CRM Contacts Routes
 *
 * Endpoints:
 *   GET    /customers/:customerId/contacts              — list contacts
 *   POST   /customers/:customerId/contacts              — create contact
 *   PATCH  /customers/:customerId/contacts/:contactId   — update contact
 *   DELETE /customers/:customerId/contacts/:contactId   — soft delete contact
 *   GET    /contacts?customerId=:id                     — alias for InquiryCapture
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const { resolveRepGroup } = require('../../services/crmService');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

/**
 * Verify the requesting user owns the given customer (by rep group or name).
 * Admin/manager roles bypass the check.
 * Returns true if access is granted, false otherwise.
 */
async function verifyCustomerOwnership(reqUser, customerId) {
  if (FULL_ACCESS_ROLES.includes(reqUser.role)) return true;
  const rep = await resolveRepGroup(reqUser.id);
  if (!rep) return false;
  const check = await pool.query(
    `SELECT 1 FROM fp_customer_unified WHERE customer_id = $1 AND (sales_rep_group_id = $2 OR (sales_rep_group_id IS NULL AND primary_sales_rep_name ILIKE $3))`,
    [customerId, rep.groupId, `%${rep.firstName}%`]
  );
  return check.rows.length > 0;
}

// GET /customers/:customerId/contacts
router.get('/customers/:customerId/contacts', authenticate, async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (!customerId || customerId <= 0) return res.status(400).json({ success: false, error: 'Invalid customer ID' });
    const result = await pool.query(
      `SELECT * FROM fp_customer_contacts WHERE customer_id = $1 AND is_active = true ORDER BY is_primary DESC, contact_name ASC`,
      [customerId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('CRM: error fetching customer contacts', err);
    res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

// POST /customers/:customerId/contacts
router.post('/customers/:customerId/contacts', authenticate, async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (!customerId || customerId <= 0) return res.status(400).json({ success: false, error: 'Invalid customer ID' });

    if (!(await verifyCustomerOwnership(req.user, customerId))) {
      return res.status(403).json({ success: false, error: 'Access denied — not your customer' });
    }

    const { contact_name, designation, email, phone, whatsapp, is_primary, notes } = req.body;
    if (!contact_name) return res.status(400).json({ success: false, error: 'contact_name is required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (is_primary) {
        await client.query(`UPDATE fp_customer_contacts SET is_primary = false WHERE customer_id = $1`, [customerId]);
      }
      const result = await client.query(
        `INSERT INTO fp_customer_contacts (customer_id, contact_name, designation, email, phone, whatsapp, is_primary, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [customerId, contact_name, designation || null, email || null, phone || null, whatsapp || null, !!is_primary, notes || null, req.user.id]
      );
      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('CRM: error creating customer contact', err);
    res.status(500).json({ success: false, error: 'Failed to create contact' });
  }
});

// PATCH /customers/:customerId/contacts/:contactId
router.patch('/customers/:customerId/contacts/:contactId', authenticate, async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    const contactId = parseInt(req.params.contactId, 10);
    if (!customerId || !contactId) return res.status(400).json({ success: false, error: 'Invalid IDs' });

    if (!(await verifyCustomerOwnership(req.user, customerId))) {
      return res.status(403).json({ success: false, error: 'Access denied — not your customer' });
    }

    const { contact_name, designation, email, phone, whatsapp, is_primary, notes } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (is_primary) {
        await client.query(`UPDATE fp_customer_contacts SET is_primary = false WHERE customer_id = $1`, [customerId]);
      }
      const result = await client.query(
        `UPDATE fp_customer_contacts SET
           contact_name = COALESCE($1, contact_name),
           designation = COALESCE($2, designation),
           email = COALESCE($3, email),
           phone = COALESCE($4, phone),
           whatsapp = COALESCE($5, whatsapp),
           is_primary = COALESCE($6, is_primary),
           notes = COALESCE($7, notes),
           updated_at = NOW()
         WHERE id = $8 AND customer_id = $9 RETURNING *`,
        [contact_name, designation, email, phone, whatsapp, is_primary, notes, contactId, customerId]
      );
      await client.query('COMMIT');
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Contact not found' });
      res.json({ success: true, data: result.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('CRM: error updating customer contact', err);
    res.status(500).json({ success: false, error: 'Failed to update contact' });
  }
});

// DELETE /customers/:customerId/contacts/:contactId (soft delete)
router.delete('/customers/:customerId/contacts/:contactId', authenticate, async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    const contactId = parseInt(req.params.contactId, 10);
    if (!customerId || !contactId) return res.status(400).json({ success: false, error: 'Invalid IDs' });

    if (!(await verifyCustomerOwnership(req.user, customerId))) {
      return res.status(403).json({ success: false, error: 'Access denied — not your customer' });
    }

    // Only creator or admin can delete
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      const createdByCheck = await pool.query(
        'SELECT 1 FROM fp_customer_contacts WHERE id = $1 AND customer_id = $2 AND created_by = $3',
        [contactId, customerId, req.user.id]
      );
      if (createdByCheck.rows.length === 0) return res.status(403).json({ success: false, error: 'Only the creator or admin can delete this contact' });
    }

    const result = await pool.query(
      `UPDATE fp_customer_contacts SET is_active = false, updated_at = NOW() WHERE id = $1 AND customer_id = $2 RETURNING id`,
      [contactId, customerId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Contact not found' });
    res.json({ success: true, message: 'Contact removed' });
  } catch (err) {
    logger.error('CRM: error deleting customer contact', err);
    res.status(500).json({ success: false, error: 'Failed to delete contact' });
  }
});

// GET /contacts?customerId=:id — alias for InquiryCapture wizard
router.get('/contacts', authenticate, async (req, res) => {
  try {
    const customerId = parseInt(req.query.customerId, 10);
    if (!customerId || customerId <= 0) return res.status(400).json({ success: false, error: 'customerId required' });
    const result = await pool.query(
      `SELECT * FROM fp_customer_contacts WHERE customer_id = $1 AND is_active = true ORDER BY is_primary DESC, contact_name ASC`,
      [customerId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('CRM: error fetching contacts alias', err);
    res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

module.exports = router;
