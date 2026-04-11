/**
 * Presales Orders — production, dispatch, delivery, close stage hooks
 * Split from proforma.js for ≤300 line enforcement (Phase 6)
 *
 * Phase 5.21: PO Validation Gate — auto-checks PO vs approved quotation before production
 * Phase 5.22: Full Registration Gate — verifies customer data completeness before production
 */
const {
  pool, authenticate, logger,
  DIVISION,
  actorName, logActivity,
  notifyUsers, notifyRoleUsers, sendCriticalEventEmail, authPool,
} = require('./_helpers');

// ── Phase 5.21: PO Validation Gate ──────────────────────────────────────────
async function validatePOvsQuotation(client, inquiryId) {
  const mismatches = [];
  const poRes = await client.query(
    `SELECT po_number, po_quantity, po_unit_price, po_total_value, payment_terms
     FROM mes_customer_purchase_orders WHERE inquiry_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [inquiryId]
  );
  if (poRes.rows.length === 0) {
    mismatches.push({ field: 'po', message: 'No Purchase Order found for this inquiry' });
    return mismatches;
  }
  const po = poRes.rows[0];

  const quotRes = await client.query(
    `SELECT q.quantity, q.unit_price, q.total_price, q.payment_terms, q.estimation_data
     FROM mes_quotations q
     WHERE q.inquiry_id = $1 AND q.status = 'approved'
     ORDER BY q.updated_at DESC LIMIT 1`,
    [inquiryId]
  );
  if (quotRes.rows.length === 0) {
    mismatches.push({ field: 'quotation', message: 'No approved quotation found' });
    return mismatches;
  }
  const quot = quotRes.rows[0];

  if (po.po_quantity && quot.quantity && Math.abs(po.po_quantity - quot.quantity) / quot.quantity > 0.05) {
    mismatches.push({ field: 'quantity', message: `PO qty ${po.po_quantity} differs from quoted ${quot.quantity} by >5%` });
  }
  if (po.po_unit_price && quot.unit_price && Math.abs(po.po_unit_price - quot.unit_price) / quot.unit_price > 0.02) {
    mismatches.push({ field: 'unit_price', message: `PO price ${po.po_unit_price} differs from quoted ${quot.unit_price} by >2%` });
  }
  if (po.payment_terms && quot.payment_terms && po.payment_terms !== quot.payment_terms) {
    mismatches.push({ field: 'payment_terms', message: `PO terms "${po.payment_terms}" ≠ quoted "${quot.payment_terms}"` });
  }
  return mismatches;
}

// ── Phase 5.22: Full Registration Gate ──────────────────────────────────────
async function validateCustomerRegistration(client, inquiryId) {
  const gaps = [];
  const inqRes = await client.query(
    `SELECT customer_name, customer_type, customer_id FROM mes_presales_inquiries WHERE id = $1`,
    [inquiryId]
  );
  if (inqRes.rows.length === 0) return [{ field: 'inquiry', message: 'Inquiry not found' }];
  const inq = inqRes.rows[0];

  if (!inq.customer_id) {
    gaps.push({ field: 'customer_id', message: 'No linked CRM customer record' });
    return gaps;
  }

  const custRes = await client.query(
    `SELECT customer_name, tax_id, address_line1, city, country, payment_terms, credit_limit
     FROM customer_master WHERE id = $1`,
    [inq.customer_id]
  );
  if (custRes.rows.length === 0) {
    gaps.push({ field: 'customer', message: 'CRM customer record not found' });
    return gaps;
  }
  const cust = custRes.rows[0];

  if (!cust.tax_id) gaps.push({ field: 'tax_id', message: 'Tax Registration ID missing' });
  if (!cust.address_line1) gaps.push({ field: 'address', message: 'Customer address incomplete' });
  if (!cust.country) gaps.push({ field: 'country', message: 'Country not set' });
  if (!cust.payment_terms) gaps.push({ field: 'payment_terms', message: 'Payment terms not defined' });
  if (cust.credit_limit == null) gaps.push({ field: 'credit_limit', message: 'Credit limit not set' });

  return gaps;
}

module.exports = function (router) {

  // ── POST /orders/:inquiryId/start-production ───────────────────────────────
  router.post('/orders/:inquiryId/start-production', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const inquiryId = req.params.inquiryId;
      const { job_order_ref, notes, acknowledge_mismatches, acknowledge_registration_gaps } = req.body;

      await client.query('BEGIN');

      const inq = await client.query(
        `SELECT id, inquiry_number, inquiry_stage FROM mes_presales_inquiries WHERE id = $1 AND division = $2 FOR UPDATE`,
        [inquiryId, DIVISION]
      );
      if (inq.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }
      if (inq.rows[0].inquiry_stage !== 'order_confirmed') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Inquiry must be at order_confirmed stage' });
      }

      // Phase 5.21: PO Validation Gate
      const poMismatches = await validatePOvsQuotation(client, inquiryId);
      if (poMismatches.length > 0 && !acknowledge_mismatches) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          success: false,
          gate: 'po_validation',
          mismatches: poMismatches,
          error: 'PO validation failed — mismatches found. Send acknowledge_mismatches: true to proceed.',
        });
      }

      // Phase 5.22: Full Registration Gate
      const regGaps = await validateCustomerRegistration(client, inquiryId);
      if (regGaps.length > 0 && !acknowledge_registration_gaps) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          success: false,
          gate: 'customer_registration',
          gaps: regGaps,
          error: 'Customer registration incomplete. Send acknowledge_registration_gaps: true to proceed.',
        });
      }

      await client.query(
        `UPDATE mes_presales_inquiries SET inquiry_stage = 'in_production', stage_changed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [inquiryId]
      );

      await logActivity(inquiryId, 'production_started', {
        job_order_ref: job_order_ref || null,
        notes: notes || null,
        po_mismatches_acknowledged: poMismatches.length > 0 ? poMismatches : undefined,
        registration_gaps_acknowledged: regGaps.length > 0 ? regGaps : undefined,
      }, req.user, client);

      await client.query('COMMIT');

      logger.info(`MES Order: ${inq.rows[0].inquiry_number} → in_production by ${actorName(req.user)}`);
      res.json({ success: true, message: 'Production started' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Order: start-production error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /orders/:inquiryId/ready-dispatch ─────────────────────────────────
  router.post('/orders/:inquiryId/ready-dispatch', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const inquiryId = req.params.inquiryId;
      const { notes } = req.body;

      await client.query('BEGIN');

      const inq = await client.query(
        `SELECT id, inquiry_number, inquiry_stage, created_by FROM mes_presales_inquiries WHERE id = $1 AND division = $2 FOR UPDATE`,
        [inquiryId, DIVISION]
      );
      if (inq.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }
      if (inq.rows[0].inquiry_stage !== 'in_production') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Inquiry must be in_production' });
      }

      await client.query(
        `UPDATE mes_presales_inquiries SET inquiry_stage = 'ready_dispatch', stage_changed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [inquiryId]
      );

      await logActivity(inquiryId, 'ready_for_dispatch', { notes: notes || null }, req.user, client);
      await client.query('COMMIT');

      // Notify sales rep + logistics
      try {
        if (inq.rows[0].created_by) {
          await notifyUsers(
            [inq.rows[0].created_by],
            {
              type: 'ready_dispatch',
              title: 'Ready for Dispatch',
              message: `${inq.rows[0].inquiry_number} is ready for dispatch`,
              link: `/mes/presales/inquiries/${inquiryId}`,
              referenceType: 'inquiry',
              referenceId: parseInt(inquiryId),
            }
          );
        }
        // G10: also notify logistics role
        await notifyRoleUsers(
          ['logistics', 'warehouse'],
          {
            type: 'ready_dispatch',
            title: 'Ready for Dispatch',
            message: `${inq.rows[0].inquiry_number} is ready for dispatch`,
            link: `/mes/presales/inquiries/${inquiryId}`,
            referenceType: 'inquiry',
            referenceId: parseInt(inquiryId),
          },
          { excludeUserIds: [req.user?.id] }
        );
      } catch (ne) { logger.warn('Ready dispatch notify error:', ne.message); }

      res.json({ success: true, message: 'Marked ready for dispatch' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Order: ready-dispatch error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /orders/:inquiryId/deliver ────────────────────────────────────────
  router.post('/orders/:inquiryId/deliver', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const inquiryId = req.params.inquiryId;
      const { tracking_number, delivery_date, notes } = req.body;

      await client.query('BEGIN');

      const inq = await client.query(
        `SELECT id, inquiry_number, inquiry_stage FROM mes_presales_inquiries WHERE id = $1 AND division = $2 FOR UPDATE`,
        [inquiryId, DIVISION]
      );
      if (inq.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }
      if (inq.rows[0].inquiry_stage !== 'ready_dispatch') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Inquiry must be at ready_dispatch stage' });
      }

      await client.query(
        `UPDATE mes_presales_inquiries SET inquiry_stage = 'delivered', stage_changed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [inquiryId]
      );

      await logActivity(inquiryId, 'delivered', {
        tracking_number: tracking_number || null,
        delivery_date: delivery_date || null,
        notes: notes || null,
      }, req.user, client);

      await client.query('COMMIT');

      // G11: notify sales rep + accounts on delivery
      try {
        const owner = await pool.query(`SELECT created_by FROM mes_presales_inquiries WHERE id = $1`, [inquiryId]);
        const ownerId = owner.rows[0]?.created_by;
        if (ownerId) {
          await notifyUsers([ownerId], {
            type: 'delivered',
            title: 'Order Delivered',
            message: `${inq.rows[0].inquiry_number} has been delivered${tracking_number ? ` (tracking: ${tracking_number})` : ''}`,
            link: `/mes/presales/inquiries/${inquiryId}`,
            referenceType: 'inquiry',
            referenceId: parseInt(inquiryId),
          });
        }
        await notifyRoleUsers(
          ['accounts', 'finance'],
          {
            type: 'delivered',
            title: 'Order Delivered',
            message: `${inq.rows[0].inquiry_number} delivered — ready for invoicing`,
            link: `/mes/presales/inquiries/${inquiryId}`,
            referenceType: 'inquiry',
            referenceId: parseInt(inquiryId),
          },
          { excludeUserIds: [req.user?.id] }
        );
      } catch (ne) { logger.warn('Delivery notify error:', ne.message); }

      logger.info(`MES Order: ${inq.rows[0].inquiry_number} → delivered by ${actorName(req.user)}`);
      res.json({ success: true, message: 'Marked as delivered' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Order: deliver error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /orders/:inquiryId/close ──────────────────────────────────────────
  router.post('/orders/:inquiryId/close', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const inquiryId = req.params.inquiryId;
      const { feedback, notes } = req.body;

      await client.query('BEGIN');

      const inq = await client.query(
        `SELECT id, inquiry_number, inquiry_stage FROM mes_presales_inquiries WHERE id = $1 AND division = $2 FOR UPDATE`,
        [inquiryId, DIVISION]
      );
      if (inq.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }
      if (inq.rows[0].inquiry_stage !== 'delivered') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Inquiry must be at delivered stage' });
      }

      await client.query(
        `UPDATE mes_presales_inquiries SET inquiry_stage = 'closed', status = 'converted', stage_changed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [inquiryId]
      );

      await logActivity(inquiryId, 'inquiry_closed', {
        feedback: feedback || null,
        notes: notes || null,
      }, req.user, client);

      await client.query('COMMIT');

      logger.info(`MES Order: ${inq.rows[0].inquiry_number} → closed by ${actorName(req.user)}`);
      res.json({ success: true, message: 'Inquiry lifecycle closed' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Order: close error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });
};
