/**
 * Presales Proforma Invoices — PI generation, sending, PO confirmation, order handoff
 *
 * Endpoints:
 *   POST   /proforma-invoices                     — Create PI
 *   GET    /proforma-invoices?inquiry_id=N         — List PIs for an inquiry
 *   POST   /proforma-invoices/:id/send             — Mark PI as sent to customer
 *   POST   /proforma-invoices/:id/confirm          — Customer confirms (PO received)
 *   POST   /proforma-invoices/:id/cancel           — Cancel PI
 *
 * Also handles order → production → dispatch → delivery stage hooks:
 *   POST   /orders/:inquiryId/start-production     — Advance to in_production
 *   POST   /orders/:inquiryId/ready-dispatch       — Mark ready for dispatch
 *   POST   /orders/:inquiryId/deliver              — Mark as delivered
 *   POST   /orders/:inquiryId/close                — Close inquiry lifecycle
 */
const {
  pool, authenticate, logger,
  DIVISION,
  isAdminOrMgmt, checkInquiryOwnership,
  actorName, logActivity,
  notifyRoleUsers, notifyUsers,
  getInquiryOwner,
  SALES_NOTIFY_ROLES,
} = require('./_helpers');

// ── PI number generator ─────────────────────────────────────────────────────
async function generatePINumber(client) {
  const year = new Date().getFullYear();
  const prefix = `PI-FP-${year}-`;
  const res = await client.query(
    `SELECT pi_number FROM mes_proforma_invoices
     WHERE pi_number LIKE $1
     ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );
  let seq = 1;
  if (res.rows.length > 0) {
    const last = res.rows[0].pi_number;
    const num = parseInt(last.replace(prefix, ''), 10);
    if (!isNaN(num)) seq = num + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

module.exports = function (router) {

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFORMA INVOICES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /proforma-invoices ────────────────────────────────────────────────
  router.post('/proforma-invoices', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const { inquiry_id, quotation_id, amount, currency, payment_terms, notes } = req.body;

      if (!inquiry_id) {
        return res.status(400).json({ success: false, error: 'inquiry_id is required' });
      }

      const hasAccess = await checkInquiryOwnership(req.user, inquiry_id);
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      await client.query('BEGIN');

      const piNumber = await generatePINumber(client);

      // If amount not provided, pull from quotation
      let piAmount = parseFloat(amount) || null;
      let piCurrency = currency || 'AED';
      if (!piAmount && quotation_id) {
        const quotRes = await client.query('SELECT total_price, currency FROM mes_quotations WHERE id = $1', [quotation_id]);
        if (quotRes.rows.length > 0) {
          piAmount = parseFloat(quotRes.rows[0].total_price) || null;
          piCurrency = quotRes.rows[0].currency || piCurrency;
        }
      }

      const result = await client.query(
        `INSERT INTO mes_proforma_invoices
          (pi_number, inquiry_id, quotation_id, amount, currency,
           payment_terms, notes, status, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9)
         RETURNING *`,
        [
          piNumber, inquiry_id,
          quotation_id ? parseInt(quotation_id, 10) : null,
          piAmount, piCurrency,
          payment_terms || null,
          notes || null,
          req.user?.id || null,
          actorName(req.user),
        ]
      );

      await logActivity(inquiry_id, 'pi_created', {
        pi_id: result.rows[0].id,
        pi_number: piNumber,
        amount: piAmount,
        currency: piCurrency,
      }, req.user, client);

      await client.query('COMMIT');

      logger.info(`MES PI: ${piNumber} created by ${actorName(req.user)}`);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PI: create error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── GET /proforma-invoices ─────────────────────────────────────────────────
  router.get('/proforma-invoices', authenticate, async (req, res) => {
    try {
      const { inquiry_id } = req.query;
      const conditions = [];
      const params = [];
      let idx = 1;

      if (inquiry_id) {
        conditions.push(`pi.inquiry_id = $${idx++}`);
        params.push(parseInt(inquiry_id, 10));
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT pi.*, i.inquiry_number, i.customer_name,
                q.quotation_number
         FROM mes_proforma_invoices pi
         LEFT JOIN mes_presales_inquiries i ON i.id = pi.inquiry_id
         LEFT JOIN mes_quotations q ON q.id = pi.quotation_id
         ${where}
         ORDER BY pi.created_at DESC`,
        params
      );

      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES PI: list error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /proforma-invoices/:id/send ───────────────────────────────────────
  router.post('/proforma-invoices/:id/send', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const piId = req.params.id;
      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM mes_proforma_invoices WHERE id = $1 FOR UPDATE', [piId]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'PI not found' });
      }
      if (existing.rows[0].status !== 'draft') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'PI must be in draft to send' });
      }

      await client.query(
        `UPDATE mes_proforma_invoices SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [piId]
      );

      // Auto-advance stage → pi_sent
      await client.query(
        `UPDATE mes_presales_inquiries SET inquiry_stage = 'pi_sent', stage_changed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND inquiry_stage IN ('sample_approved', 'price_accepted')`,
        [existing.rows[0].inquiry_id]
      );

      await logActivity(existing.rows[0].inquiry_id, 'pi_sent', {
        pi_id: piId,
        pi_number: existing.rows[0].pi_number,
      }, req.user, client);

      await client.query('COMMIT');

      logger.info(`MES PI: ${existing.rows[0].pi_number} sent by ${actorName(req.user)}`);
      res.json({ success: true, message: 'PI sent to customer' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PI: send error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /proforma-invoices/:id/confirm ────────────────────────────────────
  router.post('/proforma-invoices/:id/confirm', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const piId = req.params.id;
      const { customer_po_number, customer_po_date } = req.body;

      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM mes_proforma_invoices WHERE id = $1 FOR UPDATE', [piId]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'PI not found' });
      }

      await client.query(
        `UPDATE mes_proforma_invoices SET
           status = 'confirmed',
           confirmed_at = NOW(),
           customer_po_number = COALESCE($1, customer_po_number),
           customer_po_date = COALESCE($2, customer_po_date),
           updated_at = NOW()
         WHERE id = $3`,
        [customer_po_number || null, customer_po_date || null, piId]
      );

      // Auto-advance stage → order_confirmed
      const inquiryId = existing.rows[0].inquiry_id;
      await client.query(
        `UPDATE mes_presales_inquiries SET inquiry_stage = 'order_confirmed', stage_changed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND inquiry_stage = 'pi_sent'`,
        [inquiryId]
      );

      await logActivity(inquiryId, 'order_confirmed', {
        pi_id: piId,
        pi_number: existing.rows[0].pi_number,
        customer_po_number: customer_po_number || null,
      }, req.user, client);

      await client.query('COMMIT');

      // Notify production
      try {
        const inqRes = await pool.query('SELECT inquiry_number FROM mes_presales_inquiries WHERE id = $1', [inquiryId]);
        await notifyRoleUsers(
          ['production_manager', 'manager'],
          {
            type: 'order_confirmed',
            title: 'Order Confirmed',
            message: `Order confirmed for ${inqRes.rows[0]?.inquiry_number || inquiryId}. PO: ${customer_po_number || 'N/A'}`,
            link: `/mes/presales/inquiries/${inquiryId}`,
            referenceType: 'inquiry',
            referenceId: parseInt(inquiryId),
          }
        );
      } catch (ne) { logger.warn('Order confirm notify error:', ne.message); }

      logger.info(`MES PI: ${existing.rows[0].pi_number} confirmed, PO: ${customer_po_number}`);
      res.json({ success: true, message: 'Order confirmed' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PI: confirm error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /proforma-invoices/:id/cancel ─────────────────────────────────────
  router.post('/proforma-invoices/:id/cancel', authenticate, async (req, res) => {
    try {
      const piId = req.params.id;
      const existing = await pool.query('SELECT * FROM mes_proforma_invoices WHERE id = $1', [piId]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'PI not found' });
      }

      await pool.query(
        `UPDATE mes_proforma_invoices SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [piId]
      );

      await logActivity(existing.rows[0].inquiry_id, 'pi_cancelled', {
        pi_id: piId, pi_number: existing.rows[0].pi_number,
      }, req.user);

      res.json({ success: true, message: 'PI cancelled' });
    } catch (err) {
      logger.error('MES PI: cancel error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Order / production / dispatch / delivery stage hooks → orders.js
};
