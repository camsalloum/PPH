/**
 * Presales Quotation Approval Workflow
 *
 * Endpoints:
 *   POST  /quotations/:id/submit            — Submit for approval
 *   POST  /quotations/:id/approve            — Manager approves
 *   POST  /quotations/:id/reject             — Manager rejects
 *   POST  /quotations/:id/request-revision   — Manager requests revision
 *   POST  /quotations/:id/create-revision    — Create new version from existing
 *   GET   /quotations/:id/approval-history   — Full approval audit trail
 */
const {
  pool, authenticate, logger,
  canApproveQuotation, actorName, logActivity,
  notifyUsers, notifyRoleUsers, getInquiryOwner,
  SALES_NOTIFY_ROLES, generateQuotationNumber,
} = require('./_helpers');

module.exports = function (router) {

  // ── POST /quotations/:id/submit ────────────────────────────────────────────
  router.post('/quotations/:id/submit', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const quotId = req.params.id;
      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM mes_quotations WHERE id = $1 FOR UPDATE', [quotId]);
      if (!existing.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Quotation not found' }); }

      const quot = existing.rows[0];
      if (!['draft', 'rejected'].includes(quot.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Only draft or rejected quotations can be submitted' });
      }

      await client.query('UPDATE mes_quotations SET status = $1, updated_at = NOW() WHERE id = $2', ['pending_approval', quotId]);
      await client.query(
        `INSERT INTO mes_quotation_approvals (quotation_id, action, actor_id, actor_name, notes) VALUES ($1, $2, $3, $4, $5)`,
        [quotId, 'submitted', req.user?.id, actorName(req.user), req.body.notes || null]
      );

      await logActivity(quot.inquiry_id, 'quotation_submitted', {
        quotation_id: quotId, quotation_number: quot.quotation_number,
      }, req.user, client);

      await client.query('COMMIT');

      // Notify all Sales_Manager users
      const inq = await pool.query('SELECT inquiry_number, customer_name FROM mes_presales_inquiries WHERE id = $1', [quot.inquiry_id]);
      const inqData = inq.rows[0] || {};
      notifyRoleUsers(['sales_manager', 'admin'], {
        type: 'quotation_pending_approval',
        title: 'Quotation Pending Approval',
        message: `${quot.quotation_number} for ${inqData.customer_name || 'N/A'} (${inqData.inquiry_number || ''}) — ${quot.currency || 'AED'} ${quot.total_price || ''}`,
        link: `/mes/presales/inquiries/${quot.inquiry_id}`,
      }).catch(() => {});

      res.json({ success: true, message: 'Quotation submitted for approval' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Quotation: submit error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally { client.release(); }
  });

  // ── POST /quotations/:id/approve ───────────────────────────────────────────
  router.post('/quotations/:id/approve', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canApproveQuotation(req.user)) return res.status(403).json({ success: false, error: 'Management role required' });

      const quotId = req.params.id;
      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM mes_quotations WHERE id = $1 FOR UPDATE', [quotId]);
      if (!existing.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Quotation not found' }); }
      if (existing.rows[0].status !== 'pending_approval') { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: 'Quotation is not pending approval' }); }

      const quot = existing.rows[0];
      await client.query(
        'UPDATE mes_quotations SET status = $1, approved_by = $2, approved_by_name = $3, approved_at = NOW(), updated_at = NOW() WHERE id = $4',
        ['approved', req.user?.id, actorName(req.user), quotId]
      );
      await client.query(
        'INSERT INTO mes_quotation_approvals (quotation_id, action, actor_id, actor_name, notes) VALUES ($1, $2, $3, $4, $5)',
        [quotId, 'approved', req.user?.id, actorName(req.user), req.body.notes || null]
      );
      await logActivity(quot.inquiry_id, 'quotation_approved', { quotation_id: quotId, quotation_number: quot.quotation_number, approved_by: actorName(req.user) }, req.user, client);
      await client.query('COMMIT');

      // Notify submitting rep
      if (quot.created_by) {
        notifyUsers([quot.created_by], { type: 'quotation_approved', title: 'Quotation Approved', message: `${quot.quotation_number} approved by ${actorName(req.user)}`, link: `/mes/presales/inquiries/${quot.inquiry_id}` }).catch(() => {});
      }

      res.json({ success: true, message: 'Quotation approved' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Quotation: approve error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally { client.release(); }
  });

  // ── POST /quotations/:id/reject ────────────────────────────────────────────
  router.post('/quotations/:id/reject', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canApproveQuotation(req.user)) return res.status(403).json({ success: false, error: 'Management role required' });

      const quotId = req.params.id;
      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM mes_quotations WHERE id = $1 FOR UPDATE', [quotId]);
      if (!existing.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Quotation not found' }); }
      if (existing.rows[0].status !== 'pending_approval') { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: 'Quotation is not pending approval' }); }

      const quot = existing.rows[0];
      await client.query('UPDATE mes_quotations SET status = $1, updated_at = NOW() WHERE id = $2', ['rejected', quotId]);
      await client.query(
        'INSERT INTO mes_quotation_approvals (quotation_id, action, actor_id, actor_name, notes) VALUES ($1, $2, $3, $4, $5)',
        [quotId, 'rejected', req.user?.id, actorName(req.user), req.body.notes || req.body.reason || null]
      );
      await logActivity(quot.inquiry_id, 'quotation_rejected', { quotation_id: quotId, quotation_number: quot.quotation_number, reason: req.body.notes || req.body.reason }, req.user, client);
      await client.query('COMMIT');

      if (quot.created_by) {
        notifyUsers([quot.created_by], { type: 'quotation_rejected', title: 'Quotation Rejected', message: `${quot.quotation_number} rejected: ${req.body.notes || req.body.reason || 'No reason given'}`, link: `/mes/presales/inquiries/${quot.inquiry_id}` }).catch(() => {});
      }

      res.json({ success: true, message: 'Quotation rejected' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Quotation: reject error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally { client.release(); }
  });

  // ── POST /quotations/:id/request-revision ──────────────────────────────────
  router.post('/quotations/:id/request-revision', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canApproveQuotation(req.user)) return res.status(403).json({ success: false, error: 'Management role required' });

      const quotId = req.params.id;
      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM mes_quotations WHERE id = $1 FOR UPDATE', [quotId]);
      if (!existing.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Quotation not found' }); }
      if (existing.rows[0].status !== 'pending_approval') { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: 'Quotation is not pending approval' }); }

      const quot = existing.rows[0];
      await client.query('UPDATE mes_quotations SET status = $1, updated_at = NOW() WHERE id = $2', ['draft', quotId]);
      await client.query(
        'INSERT INTO mes_quotation_approvals (quotation_id, action, actor_id, actor_name, notes) VALUES ($1, $2, $3, $4, $5)',
        [quotId, 'revision_requested', req.user?.id, actorName(req.user), req.body.notes || null]
      );
      await logActivity(quot.inquiry_id, 'quotation_revision_requested', { quotation_id: quotId, quotation_number: quot.quotation_number, notes: req.body.notes }, req.user, client);
      await client.query('COMMIT');

      if (quot.created_by) {
        notifyUsers([quot.created_by], { type: 'quotation_revision_requested', title: 'Revision Requested', message: `${quot.quotation_number}: ${req.body.notes || 'Please revise'}`, link: `/mes/presales/inquiries/${quot.inquiry_id}` }).catch(() => {});
      }

      res.json({ success: true, message: 'Revision requested' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Quotation: request-revision error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally { client.release(); }
  });

  // ── POST /quotations/:id/create-revision ────────────────────────────────────
  router.post('/quotations/:id/create-revision', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const quotId = req.params.id;
      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM mes_quotations WHERE id = $1', [quotId]);
      if (!existing.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Quotation not found' }); }

      const parent = existing.rows[0];
      const newNumber = await generateQuotationNumber(client);
      const versionNumber = (parent.version_number || 1) + 1;
      const { revised_price, counter_offer_amount, notes } = req.body;

      const result = await client.query(
        `INSERT INTO mes_quotations
          (quotation_number, inquiry_id, parent_quotation_id, version_number,
           unit_price, total_price, quantity, quantity_unit, currency,
           estimation_data, valid_until, payment_terms, delivery_terms, notes,
           counter_offer_amount, status, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'draft', $16, $17)
         RETURNING *`,
        [
          newNumber, parent.inquiry_id, parent.id, versionNumber,
          revised_price ? parseFloat(revised_price) : parent.unit_price,
          revised_price ? parseFloat(revised_price) : parent.total_price,
          parent.quantity, parent.quantity_unit, parent.currency,
          JSON.stringify(parent.estimation_data || {}),
          parent.valid_until, parent.payment_terms, parent.delivery_terms,
          notes || parent.notes,
          counter_offer_amount ? parseFloat(counter_offer_amount) : parent.counter_offer_amount,
          req.user?.id, actorName(req.user),
        ]
      );

      await logActivity(parent.inquiry_id, 'quotation_revision_created', {
        quotation_id: result.rows[0].id, quotation_number: newNumber,
        parent_quotation_id: parent.id, version_number: versionNumber,
      }, req.user, client);

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Quotation: create-revision error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally { client.release(); }
  });

  // ── GET /quotations/:id/approval-history ───────────────────────────────────
  router.get('/quotations/:id/approval-history', authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM mes_quotation_approvals WHERE quotation_id = $1 ORDER BY created_at DESC',
        [req.params.id]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES Quotation: approval-history error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /quotations/:id/customer-response ─────────────────────────────────
  router.post('/quotations/:id/customer-response', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const quotId = req.params.id;
      const { response, notes, counter_offer_amount } = req.body;

      if (!['accepted', 'rejected', 'counter_offer', 'no_response'].includes(response)) {
        return res.status(400).json({ success: false, error: 'Invalid response. Must be: accepted, rejected, counter_offer, no_response' });
      }

      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM mes_quotations WHERE id = $1 FOR UPDATE', [quotId]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      await client.query(
        `UPDATE mes_quotations SET
           customer_response = $1,
           customer_response_at = NOW(),
           customer_notes = $2,
           counter_offer_amount = $3,
           status = CASE
             WHEN $1 = 'accepted' THEN 'accepted'
             WHEN $1 = 'rejected' THEN 'rejected'
             WHEN $1 = 'counter_offer' THEN 'counter_offer'
             ELSE status
           END,
           updated_at = NOW()
         WHERE id = $4`,
        [response, notes || null, parseFloat(counter_offer_amount) || null, quotId]
      );

      // Auto-advance stage based on customer response
      const inquiryId = existing.rows[0].inquiry_id;
      if (response === 'accepted') {
        await client.query(
          `UPDATE mes_presales_inquiries SET inquiry_stage = 'price_accepted', stage_changed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND inquiry_stage IN ('quoted', 'negotiating')`,
          [inquiryId]
        );
      } else if (response === 'counter_offer') {
        await client.query(
          `UPDATE mes_presales_inquiries SET inquiry_stage = 'negotiating', stage_changed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND inquiry_stage = 'quoted'`,
          [inquiryId]
        );
      } else if (response === 'rejected') {
        await client.query(
          `UPDATE mes_presales_inquiries SET inquiry_stage = 'lost', status = 'lost', stage_changed_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [inquiryId]
        );
      }

      await logActivity(inquiryId, 'customer_response', {
        quotation_id: quotId,
        quotation_number: existing.rows[0].quotation_number,
        response,
        counter_offer_amount: counter_offer_amount || null,
        notes: notes || null,
      }, req.user, client);

      await client.query('COMMIT');

      logger.info(`MES Quotation: ${existing.rows[0].quotation_number} customer response: ${response}`);
      res.json({ success: true, message: `Customer response recorded: ${response}` });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Quotation: customer response error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });
};
