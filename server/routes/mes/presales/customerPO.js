/**
 * Presales Customer PO Capture
 * POST /customer-po  GET /customer-po  GET /customer-po/:id
 */
const {
  pool, authenticate, logger,
  checkInquiryOwnership, logActivity, notifyRoleUsers,
} = require('./_helpers');
const { syncDealFromInquiry } = require('../../../services/dealSyncService');

module.exports = function (router) {

  // ── POST /customer-po ──────────────────────────────────────────────────────
  router.post('/customer-po', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const { po_number, po_date, quotation_id, inquiry_id, po_value,
              currency, delivery_address, requested_delivery_date, po_document_path } = req.body;
      if (!po_number || !po_date || !quotation_id || !inquiry_id)
        return res.status(400).json({ success: false, error: 'po_number, po_date, quotation_id, and inquiry_id are required' });

      const allowed = await checkInquiryOwnership(req.user, inquiry_id);
      if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });

      await client.query('BEGIN');
      const inqRes = await client.query(
        'SELECT id, inquiry_number, customer_name, inquiry_stage FROM mes_presales_inquiries WHERE id = $1 FOR UPDATE', [inquiry_id]);
      if (!inqRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Inquiry not found' }); }
      const inq = inqRes.rows[0];
      if (!['price_accepted', 'sample_approved'].includes(inq.inquiry_stage)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `Inquiry must be at price_accepted or sample_approved (current: ${inq.inquiry_stage})` });
      }

      // ±5% deviation check (warn, don't block)
      let deviation_warning = null;
      if (po_value) {
        const qr = await client.query('SELECT total_price FROM mes_quotations WHERE id = $1', [quotation_id]);
        const qt = Number(qr.rows[0]?.total_price);
        if (qt > 0) {
          const dev = Math.abs(Number(po_value) - qt) / qt;
          if (dev > 0.05) deviation_warning = `PO value deviates ${(dev * 100).toFixed(1)}% from quotation total (${qt})`;
        }
      }

      const poRes = await client.query(
        `INSERT INTO mes_customer_purchase_orders
          (po_number,po_date,inquiry_id,quotation_id,po_value,currency,delivery_address,requested_delivery_date,po_document_path,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [po_number, po_date, inquiry_id, quotation_id, po_value || null,
         currency || 'AED', delivery_address || null, requested_delivery_date || null,
         po_document_path || null, req.user?.id]);

      // Store PO document as inquiry attachment
      if (po_document_path) {
        await client.query(
          `INSERT INTO mes_presales_attachments (inquiry_id,file_name,file_path,file_type,uploaded_by) VALUES ($1,$2,$3,'purchase_order',$4)`,
          [inquiry_id, `PO-${po_number}`, po_document_path, req.user?.id]);
      }

      // Advance inquiry → order_confirmed
      await client.query(
        `UPDATE mes_presales_inquiries SET inquiry_stage='order_confirmed', stage_changed_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND inquiry_stage IN ('price_accepted','sample_approved')`, [inquiry_id]);

      // Sync linked CRM deal (best-effort)
      try { await syncDealFromInquiry(inquiry_id, 'order_confirmed', client); }
      catch (e) { logger.warn(`PO: deal sync failed for inquiry ${inquiry_id}`, e); }

      await logActivity(inquiry_id, 'customer_po_captured', {
        po_id: poRes.rows[0].id, po_number, po_value, quotation_id,
      }, req.user, client);
      await client.query('COMMIT');

      notifyRoleUsers(['sales_manager', 'production_manager', 'manager'], {
        type: 'customer_po_captured', title: 'Customer PO Received',
        message: `PO ${po_number} for ${inq.customer_name || 'N/A'} (${inq.inquiry_number}) — ${currency || 'AED'} ${po_value || ''}`,
        link: `/mes/presales/inquiries/${inquiry_id}`,
      }).catch(() => {});

      res.status(201).json({ success: true, data: poRes.rows[0], deviation_warning });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES CustomerPO: create error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally { client.release(); }
  });

  // ── GET /customer-po ───────────────────────────────────────────────────────
  router.get('/customer-po', authenticate, async (req, res) => {
    try {
      const { inquiry_id } = req.query;
      if (!inquiry_id) return res.status(400).json({ success: false, error: 'inquiry_id query param required' });
      const allowed = await checkInquiryOwnership(req.user, inquiry_id);
      if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
      const result = await pool.query(
        'SELECT * FROM mes_customer_purchase_orders WHERE inquiry_id = $1 ORDER BY created_at DESC', [inquiry_id]);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES CustomerPO: list error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /customer-po/:id ───────────────────────────────────────────────────
  router.get('/customer-po/:id', authenticate, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM mes_customer_purchase_orders WHERE id = $1', [req.params.id]);
      if (!result.rows.length) return res.status(404).json({ success: false, error: 'PO not found' });
      const po = result.rows[0];
      const allowed = await checkInquiryOwnership(req.user, po.inquiry_id);
      if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
      res.json({ success: true, data: po });
    } catch (err) {
      logger.error('MES CustomerPO: detail error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });
};
