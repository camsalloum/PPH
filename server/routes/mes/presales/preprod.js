/**
 * Presales Pre-production Samples — Request, track, send, customer approval
 *
 * Endpoints:
 *   POST   /preprod-samples                        — Request a pre-prod sample
 *   GET    /preprod-samples?inquiry_id=N            — List pre-prod samples for an inquiry
 *   PATCH  /preprod-samples/:id/status              — Update status (production-ready, sent, etc.)
 *   POST   /preprod-samples/:id/customer-response   — Record customer approval/rejection
 */
const {
  pool, authenticate, logger,
  DIVISION,
  isAdminOrMgmt, checkInquiryOwnership,
  actorName, logActivity,
  notifyRoleUsers,
  SALES_NOTIFY_ROLES,
} = require('./_helpers');

// ── Sample number generator ─────────────────────────────────────────────────
async function generateSampleNumber(client, inquiryId) {
  const res = await client.query(
    `SELECT COUNT(*) AS cnt FROM mes_preprod_samples WHERE inquiry_id = $1`,
    [inquiryId]
  );
  const seq = parseInt(res.rows[0].cnt, 10) + 1;
  return `PPS-${inquiryId}-${String(seq).padStart(2, '0')}`;
}

module.exports = function (router) {

  // ── POST /preprod-samples ──────────────────────────────────────────────────
  router.post('/preprod-samples', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const { inquiry_id, quotation_id, production_notes } = req.body;

      if (!inquiry_id) {
        return res.status(400).json({ success: false, error: 'inquiry_id is required' });
      }

      const hasAccess = await checkInquiryOwnership(req.user, inquiry_id);
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      await client.query('BEGIN');

      const sampleNumber = await generateSampleNumber(client, inquiry_id);

      const result = await client.query(
        `INSERT INTO mes_preprod_samples
          (inquiry_id, quotation_id, sample_number, status,
           production_notes, requested_by, requested_by_name)
         VALUES ($1, $2, $3, 'requested', $4, $5, $6)
         RETURNING *`,
        [
          inquiry_id,
          quotation_id ? parseInt(quotation_id, 10) : null,
          sampleNumber,
          production_notes || null,
          req.user?.id || null,
          actorName(req.user),
        ]
      );

      // Auto-advance stage → preprod_sample
      await client.query(
        `UPDATE mes_presales_inquiries
         SET inquiry_stage = 'preprod_sample', stage_changed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND inquiry_stage = 'price_accepted'`,
        [inquiry_id]
      );

      await logActivity(inquiry_id, 'preprod_sample_requested', {
        sample_id: result.rows[0].id,
        sample_number: sampleNumber,
      }, req.user, client);

      await client.query('COMMIT');

      // Notify production roles
      try {
        const inqRes = await pool.query('SELECT inquiry_number FROM mes_presales_inquiries WHERE id = $1', [inquiry_id]);
        const inqNum = inqRes.rows[0]?.inquiry_number || inquiry_id;
        await notifyRoleUsers(
          ['production_manager', 'manager'],
          {
            type: 'preprod_sample',
            title: 'Pre-prod Sample Requested',
            message: `Pre-production sample requested for ${inqNum}`,
            link: `/mes/presales/inquiries/${inquiry_id}`,
            referenceType: 'inquiry',
            referenceId: parseInt(inquiry_id),
          }
        );
      } catch (notifyErr) {
        logger.warn('Preprod notify error:', notifyErr.message);
      }

      logger.info(`MES Preprod: ${sampleNumber} requested by ${actorName(req.user)}`);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Preprod: create error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── GET /preprod-samples ───────────────────────────────────────────────────
  router.get('/preprod-samples', authenticate, async (req, res) => {
    try {
      const { inquiry_id } = req.query;
      const conditions = [];
      const params = [];
      let idx = 1;

      if (inquiry_id) {
        conditions.push(`ps.inquiry_id = $${idx++}`);
        params.push(parseInt(inquiry_id, 10));
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT ps.*, i.inquiry_number, i.customer_name,
                q.quotation_number
         FROM mes_preprod_samples ps
         LEFT JOIN mes_presales_inquiries i ON i.id = ps.inquiry_id
         LEFT JOIN mes_quotations q ON q.id = ps.quotation_id
         ${where}
         ORDER BY ps.created_at DESC`,
        params
      );

      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES Preprod: list error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /preprod-samples/:id/status ──────────────────────────────────────
  router.patch('/preprod-samples/:id/status', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const sampleId = req.params.id;
      const { status, tracking_number, production_notes } = req.body;

      const validStatuses = ['in_production', 'ready', 'sent_to_customer', 'customer_testing'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: `Invalid status. Must be: ${validStatuses.join(', ')}` });
      }

      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM mes_preprod_samples WHERE id = $1 FOR UPDATE', [sampleId]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Pre-prod sample not found' });
      }

      const updates = [`status = $1`, `updated_at = NOW()`];
      const params = [status];
      let idx = 2;

      // Set timestamp fields based on status
      if (status === 'in_production') {
        updates.push(`production_started_at = COALESCE(production_started_at, NOW())`);
      } else if (status === 'ready') {
        updates.push(`ready_at = NOW()`);
      } else if (status === 'sent_to_customer') {
        updates.push(`sent_at = NOW()`);
        if (tracking_number) {
          updates.push(`tracking_number = $${idx++}`);
          params.push(tracking_number);
        }
      }

      if (production_notes) {
        updates.push(`production_notes = $${idx++}`);
        params.push(production_notes);
      }

      params.push(sampleId);
      await client.query(
        `UPDATE mes_preprod_samples SET ${updates.join(', ')} WHERE id = $${idx}`,
        params
      );

      // Auto-advance inquiry stage
      const inquiryId = existing.rows[0].inquiry_id;
      if (status === 'sent_to_customer') {
        await client.query(
          `UPDATE mes_presales_inquiries SET inquiry_stage = 'preprod_sent', stage_changed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND inquiry_stage = 'preprod_sample'`,
          [inquiryId]
        );
      }

      await logActivity(inquiryId, 'preprod_status_changed', {
        sample_id: sampleId,
        sample_number: existing.rows[0].sample_number,
        from: existing.rows[0].status,
        to: status,
      }, req.user, client);

      await client.query('COMMIT');

      res.json({ success: true, message: `Pre-prod sample status updated to ${status}` });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Preprod: status update error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /preprod-samples/:id/customer-response ────────────────────────────
  router.post('/preprod-samples/:id/customer-response', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const sampleId = req.params.id;
      const { response, feedback } = req.body;

      if (!['approved', 'rejected', 'revision_needed'].includes(response)) {
        return res.status(400).json({ success: false, error: 'Invalid response. Must be: approved, rejected, revision_needed' });
      }

      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM mes_preprod_samples WHERE id = $1 FOR UPDATE', [sampleId]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Pre-prod sample not found' });
      }

      await client.query(
        `UPDATE mes_preprod_samples SET
           status = $1, customer_response_at = NOW(),
           customer_feedback = $2, updated_at = NOW()
         WHERE id = $3`,
        [response, feedback || null, sampleId]
      );

      const inquiryId = existing.rows[0].inquiry_id;

      if (response === 'approved') {
        // Auto-advance stage → sample_approved
        await client.query(
          `UPDATE mes_presales_inquiries SET inquiry_stage = 'sample_approved', stage_changed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND inquiry_stage IN ('preprod_sent', 'preprod_sample')`,
          [inquiryId]
        );
      } else if (response === 'revision_needed') {
        // Reset to preprod_sample for new sample
        await client.query(
          `UPDATE mes_presales_inquiries SET inquiry_stage = 'preprod_sample', stage_changed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND inquiry_stage = 'preprod_sent'`,
          [inquiryId]
        );
      }

      await logActivity(inquiryId, 'preprod_customer_response', {
        sample_id: sampleId,
        sample_number: existing.rows[0].sample_number,
        response,
        feedback: feedback || null,
      }, req.user, client);

      await client.query('COMMIT');

      logger.info(`MES Preprod: ${existing.rows[0].sample_number} customer response: ${response}`);
      res.json({ success: true, message: `Customer response recorded: ${response}` });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Preprod: customer response error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });
};
