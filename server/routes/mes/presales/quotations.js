/**
 * Presales Quotations — CRUD + send-to-customer
 * Approval workflow → quotation-approval.js
 * Customer response → quotation-approval.js
 */
const {
  pool, authenticate, logger,
  DIVISION,
  isAdminOrMgmt, checkInquiryOwnership,
  actorName, logActivity,
  notifyUsers, notifyRoleUsers,
  SALES_NOTIFY_ROLES,
  generateQuotationNumber,
} = require('./_helpers');

module.exports = function (router) {

  // ── POST /quotations ──────────────────────────────────────────────────────
  router.post('/quotations', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const {
        inquiry_id,
        // Estimation fields
        material_cost, process_cost, overhead_cost, margin_percent,
        unit_price, total_price, quantity, quantity_unit, currency,
        // Validity & terms
        valid_until, payment_terms, delivery_terms, notes,
      } = req.body;

      if (!inquiry_id) {
        return res.status(400).json({ success: false, error: 'inquiry_id is required' });
      }

      // Verify access
      const hasAccess = await checkInquiryOwnership(req.user, inquiry_id);
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      await client.query('BEGIN');

      const quotationNumber = await generateQuotationNumber(client);

      // Build estimation data snapshot
      const estimationData = {
        material_cost: parseFloat(material_cost) || 0,
        process_cost: parseFloat(process_cost) || 0,
        overhead_cost: parseFloat(overhead_cost) || 0,
        margin_percent: parseFloat(margin_percent) || 0,
        calculated_at: new Date().toISOString(),
      };

      const result = await client.query(
        `INSERT INTO mes_quotations
          (quotation_number, inquiry_id, estimation_data,
           unit_price, total_price, quantity, quantity_unit, currency,
           valid_until, payment_terms, delivery_terms, notes,
           status, created_by, created_by_name)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', $13, $14)
         RETURNING *`,
        [
          quotationNumber, inquiry_id, JSON.stringify(estimationData),
          parseFloat(unit_price) || null,
          parseFloat(total_price) || null,
          parseFloat(quantity) || null,
          quantity_unit || 'KGS',
          currency || 'AED',
          valid_until || null,
          payment_terms || null,
          delivery_terms || null,
          notes || null,
          req.user?.id || null,
          actorName(req.user),
        ]
      );

      // Auto-advance stage: cse_approved → estimation → quoted
      await client.query(
        `UPDATE mes_presales_inquiries
         SET inquiry_stage = CASE
           WHEN inquiry_stage = 'cse_approved' THEN 'estimation'
           WHEN inquiry_stage = 'estimation' THEN 'estimation'
           ELSE inquiry_stage
         END,
         stage_changed_at = CASE
           WHEN inquiry_stage IN ('cse_approved') THEN NOW()
           ELSE stage_changed_at
         END,
         updated_at = NOW()
         WHERE id = $1`,
        [inquiry_id]
      );

      await logActivity(inquiry_id, 'quotation_created', {
        quotation_id: result.rows[0].id,
        quotation_number: quotationNumber,
        unit_price, total_price, currency: currency || 'AED',
      }, req.user, client);

      await client.query('COMMIT');

      logger.info(`MES Quotation: ${quotationNumber} created by ${actorName(req.user)} for inquiry ${inquiry_id}`);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Quotation: create error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── GET /quotations ────────────────────────────────────────────────────────
  router.get('/quotations', authenticate, async (req, res) => {
    try {
      const { inquiry_id } = req.query;
      const conditions = [];
      const params = [];
      let idx = 1;

      if (inquiry_id) {
        conditions.push(`q.inquiry_id = $${idx++}`);
        params.push(parseInt(inquiry_id, 10));
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT q.*, i.inquiry_number, i.customer_name
         FROM mes_quotations q
         LEFT JOIN mes_presales_inquiries i ON i.id = q.inquiry_id
         ${where}
         ORDER BY q.created_at DESC`,
        params
      );

      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES Quotation: list error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /quotations/:id ────────────────────────────────────────────────────
  router.get('/quotations/:id', authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT q.*, i.inquiry_number, i.customer_name, i.customer_country
         FROM mes_quotations q
         LEFT JOIN mes_presales_inquiries i ON i.id = q.inquiry_id
         WHERE q.id = $1`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES Quotation: detail error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /quotations/:id ──────────────────────────────────────────────────
  router.patch('/quotations/:id', authenticate, async (req, res) => {
    try {
      const quotId = req.params.id;
      const existing = await pool.query('SELECT * FROM mes_quotations WHERE id = $1', [quotId]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
      if (existing.rows[0].status !== 'draft') {
        return res.status(400).json({ success: false, error: 'Can only edit draft quotations' });
      }

      const {
        material_cost, process_cost, overhead_cost, margin_percent,
        unit_price, total_price, quantity, quantity_unit, currency,
        valid_until, payment_terms, delivery_terms, notes,
      } = req.body;

      const safeFloat = (v, fallback) => { const n = parseFloat(v); return isNaN(n) ? fallback : n; };
      const estimationData = {
        material_cost: safeFloat(material_cost, existing.rows[0].estimation_data?.material_cost),
        process_cost: safeFloat(process_cost, existing.rows[0].estimation_data?.process_cost),
        overhead_cost: safeFloat(overhead_cost, existing.rows[0].estimation_data?.overhead_cost),
        margin_percent: safeFloat(margin_percent, existing.rows[0].estimation_data?.margin_percent),
        calculated_at: new Date().toISOString(),
      };

      const result = await pool.query(
        `UPDATE mes_quotations SET
           estimation_data = $1::jsonb,
           unit_price = COALESCE($2, unit_price),
           total_price = COALESCE($3, total_price),
           quantity = COALESCE($4, quantity),
           quantity_unit = COALESCE($5, quantity_unit),
           currency = COALESCE($6, currency),
           valid_until = COALESCE($7, valid_until),
           payment_terms = COALESCE($8, payment_terms),
           delivery_terms = COALESCE($9, delivery_terms),
           notes = COALESCE($10, notes),
           updated_at = NOW()
         WHERE id = $11
         RETURNING *`,
        [
          JSON.stringify(estimationData),
          parseFloat(unit_price) || null,
          parseFloat(total_price) || null,
          parseFloat(quantity) || null,
          quantity_unit || null,
          currency || null,
          valid_until || null,
          payment_terms || null,
          delivery_terms || null,
          notes || null,
          quotId,
        ]
      );

      await logActivity(existing.rows[0].inquiry_id, 'quotation_updated', {
        quotation_id: quotId,
        quotation_number: existing.rows[0].quotation_number,
      }, req.user);

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES Quotation: update error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /quotations/:id/send ──────────────────────────────────────────────
  router.post('/quotations/:id/send', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const quotId = req.params.id;
      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM mes_quotations WHERE id = $1 FOR UPDATE', [quotId]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
      if (!['draft', 'approved'].includes(existing.rows[0].status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Quotation must be draft or approved to send' });
      }

      await client.query(
        `UPDATE mes_quotations SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [quotId]
      );

      // Auto-advance stage → quoted
      await client.query(
        `UPDATE mes_presales_inquiries
         SET inquiry_stage = 'quoted', stage_changed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND inquiry_stage IN ('estimation', 'cse_approved')`,
        [existing.rows[0].inquiry_id]
      );

      await logActivity(existing.rows[0].inquiry_id, 'quotation_sent', {
        quotation_id: quotId,
        quotation_number: existing.rows[0].quotation_number,
      }, req.user, client);

      await client.query('COMMIT');

      logger.info(`MES Quotation: ${existing.rows[0].quotation_number} sent to customer by ${actorName(req.user)}`);
      res.json({ success: true, message: 'Quotation sent to customer' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Quotation: send error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });


  // Customer response endpoint → quotation-approval.js
};
