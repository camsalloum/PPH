/**
 * Presales Procurement — Purchase Requisitions, Supplier POs, Stock Receipts
 *
 * Endpoints:
 *   POST   /purchase-requisitions               — raise PR (from BOM or manual)
 *   GET    /purchase-requisitions                — list PRs (filter: job_card_id, status)
 *   POST   /purchase-requisitions/:id/approve    — manager approves PR
 *   POST   /purchase-requisitions/:id/reject     — manager rejects PR
 *   POST   /supplier-purchase-orders             — create SPO from approved PR
 *   GET    /supplier-purchase-orders             — list SPOs (filter: pr_id, status)
 *   POST   /supplier-purchase-orders/:id/approve — manager approves SPO
 *   POST   /supplier-purchase-orders/:id/send    — mark SPO as sent to supplier
 *   POST   /stock-receipts                       — record goods receipt
 *   GET    /stock-receipts                       — list receipts (filter: spo_id, job_card_id)
 *   GET    /procurement/dashboard                — management overview stats
 */

const {
  pool, authenticate, logger,
  isAdminOrMgmt, logActivity, actorName, notifyUsers, notifyRoleUsers,
} = require('./_helpers');

const DIVISION = 'FP';

// ─── Role helpers ────────────────────────────────────────────────────────────
function canManageProcurement(user) {
  return ['admin', 'manager', 'procurement', 'stores_keeper', 'production_manager', 'sales_manager'].includes(user?.role);
}
function canApproveProcurement(user) {
  return ['admin', 'manager', 'production_manager', 'sales_manager'].includes(user?.role);
}
function canReceiveStock(user) {
  return ['admin', 'stores_keeper', 'procurement', 'manager'].includes(user?.role);
}

// ─── Sequence generators ────────────────────────────────────────────────────
async function generatePRNumber(client) {
  await client.query("CREATE SEQUENCE IF NOT EXISTS pr_fp_seq START 1");
  const year = new Date().getFullYear();
  const prefix = `PR-FP-${year}-`;
  const seqVal = await client.query('SELECT last_value, is_called FROM pr_fp_seq');
  if (!seqVal.rows[0].is_called) {
    const max = await client.query(
      'SELECT pr_number FROM mes_purchase_requisitions WHERE pr_number LIKE $1 ORDER BY id DESC LIMIT 1', [`${prefix}%`]);
    if (max.rows.length) {
      const num = parseInt(max.rows[0].pr_number.replace(prefix, ''), 10);
      if (!isNaN(num) && num > 0) await client.query("SELECT setval('pr_fp_seq', $1)", [num]);
    }
  }
  const r = await client.query("SELECT nextval('pr_fp_seq') AS seq");
  return `${prefix}${String(r.rows[0].seq).padStart(5, '0')}`;
}

async function generateSPONumber(client) {
  await client.query("CREATE SEQUENCE IF NOT EXISTS spo_fp_seq START 1");
  const year = new Date().getFullYear();
  const prefix = `SPO-FP-${year}-`;
  const seqVal = await client.query('SELECT last_value, is_called FROM spo_fp_seq');
  if (!seqVal.rows[0].is_called) {
    const max = await client.query(
      'SELECT po_number FROM mes_supplier_purchase_orders WHERE po_number LIKE $1 ORDER BY id DESC LIMIT 1', [`${prefix}%`]);
    if (max.rows.length) {
      const num = parseInt(max.rows[0].po_number.replace(prefix, ''), 10);
      if (!isNaN(num) && num > 0) await client.query("SELECT setval('spo_fp_seq', $1)", [num]);
    }
  }
  const r = await client.query("SELECT nextval('spo_fp_seq') AS seq");
  return `${prefix}${String(r.rows[0].seq).padStart(5, '0')}`;
}

module.exports = function (router) {

  // ═══════════════════════════════════════════════════════════════════════════
  //  PURCHASE REQUISITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /purchase-requisitions
  router.post('/purchase-requisitions', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canManageProcurement(req.user))
        return res.status(403).json({ success: false, error: 'Insufficient role for procurement' });

      const { job_card_id, inquiry_id, material_details, notes } = req.body;
      if (!job_card_id) return res.status(400).json({ success: false, error: 'job_card_id is required' });
      if (!material_details || !Array.isArray(material_details) || !material_details.length)
        return res.status(400).json({ success: false, error: 'material_details array is required' });

      await client.query('BEGIN');

      // Verify job card exists
      const jc = await client.query(
        'SELECT id, inquiry_id, job_number FROM mes_job_cards WHERE id = $1 AND division = $2',
        [job_card_id, DIVISION]
      );
      if (!jc.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Job card not found' }); }

      const totalAmount = material_details.reduce((s, m) => s + (Number(m.estimated_cost) || 0), 0);
      const prNumber = await generatePRNumber(client);

      const result = await client.query(
        `INSERT INTO mes_purchase_requisitions
          (pr_number, job_card_id, inquiry_id, material_details, total_amount, notes, status, requested_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'pending', $7)
         RETURNING *`,
        [prNumber, job_card_id, inquiry_id || jc.rows[0].inquiry_id,
         JSON.stringify(material_details), totalAmount, notes || null, req.user?.id]);

      // Update job card material_status
      await client.query(
        `UPDATE mes_job_cards
         SET material_status = 'partially_ordered', updated_at = NOW()
         WHERE id = $1 AND division = $2 AND material_status = 'pending'`,
        [job_card_id, DIVISION]);

      await logActivity(client, jc.rows[0].inquiry_id, req.user?.id,
        `Purchase requisition ${prNumber} raised`, 'pr_created', { pr_id: result.rows[0].id });

      await client.query('COMMIT');

      // Notify management
      notifyRoleUsers(['admin', 'manager', 'production_manager'],
        {
          type: 'pr_created',
          title: 'Purchase Requisition Needs Approval',
          message: `New PR ${prNumber} needs approval for Job ${jc.rows[0].job_number}`,
          referenceType: 'pr',
          referenceId: result.rows[0].id,
        })
        .catch(err => logger.warn('PR notification failed:', err.message));

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Error creating PR:', err);
      res.status(500).json({ success: false, error: 'Failed to create purchase requisition' });
    } finally { client.release(); }
  });

  // GET /purchase-requisitions
  router.get('/purchase-requisitions', authenticate, async (req, res) => {
    try {
      const { job_card_id, inquiry_id, status } = req.query;
      let sql = `SELECT pr.*, jc.job_number, jc.customer_name
                 FROM mes_purchase_requisitions pr
                 LEFT JOIN mes_job_cards jc ON pr.job_card_id = jc.id AND jc.division = '${DIVISION}'
                 WHERE 1=1`;
      const params = [];
      if (job_card_id) { params.push(job_card_id); sql += ` AND pr.job_card_id = $${params.length}`; }
      if (inquiry_id) { params.push(inquiry_id); sql += ` AND pr.inquiry_id = $${params.length}`; }
      if (status) { params.push(status); sql += ` AND pr.status = $${params.length}`; }
      sql += ' ORDER BY pr.created_at DESC';
      const result = await pool.query(sql, params);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('Error listing PRs:', err);
      res.status(500).json({ success: false, error: 'Failed to list purchase requisitions' });
    }
  });

  // POST /purchase-requisitions/:id/approve
  router.post('/purchase-requisitions/:id/approve', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canApproveProcurement(req.user))
        return res.status(403).json({ success: false, error: 'Insufficient role to approve PR' });

      await client.query('BEGIN');
      const pr = await client.query(
        'SELECT * FROM mes_purchase_requisitions WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!pr.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'PR not found' }); }
      if (pr.rows[0].status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `PR is ${pr.rows[0].status}, cannot approve` });
      }

      await client.query(
        `UPDATE mes_purchase_requisitions SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [req.user?.id, req.params.id]);

      await logActivity(client, pr.rows[0].inquiry_id, req.user?.id,
        `PR ${pr.rows[0].pr_number} approved by ${actorName(req.user)}`, 'pr_approved');

      await client.query('COMMIT');

      notifyRoleUsers(['procurement', 'stores_keeper'],
        {
          type: 'pr_approved',
          title: 'PR Approved — Ready for Supplier PO',
          message: `PR ${pr.rows[0].pr_number} approved — ready for supplier PO`,
          referenceType: 'pr',
          referenceId: pr.rows[0].id,
        })
        .catch(err => logger.warn('PR approval notification failed:', err.message));

      res.json({ success: true, data: { ...pr.rows[0], status: 'approved', approved_by: req.user?.id } });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Error approving PR:', err);
      res.status(500).json({ success: false, error: 'Failed to approve PR' });
    } finally { client.release(); }
  });

  // POST /purchase-requisitions/:id/reject
  router.post('/purchase-requisitions/:id/reject', authenticate, async (req, res) => {
    try {
      if (!canApproveProcurement(req.user))
        return res.status(403).json({ success: false, error: 'Insufficient role to reject PR' });

      const { reason } = req.body;
      const result = await pool.query(
        `UPDATE mes_purchase_requisitions SET status = 'rejected', notes = COALESCE(notes,'') || E'\nRejected: ' || $1, updated_at = NOW()
         WHERE id = $2 AND status = 'pending' RETURNING *`,
        [reason || 'No reason provided', req.params.id]);
      if (!result.rows.length)
        return res.status(404).json({ success: false, error: 'PR not found or not pending' });

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('Error rejecting PR:', err);
      res.status(500).json({ success: false, error: 'Failed to reject PR' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  SUPPLIER PURCHASE ORDERS
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /supplier-purchase-orders
  router.post('/supplier-purchase-orders', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canManageProcurement(req.user))
        return res.status(403).json({ success: false, error: 'Insufficient role for supplier PO' });

      const { pr_id, supplier_name, supplier_contact, supplier_email,
              line_items, currency, expected_delivery, notes } = req.body;
      if (!pr_id) return res.status(400).json({ success: false, error: 'pr_id is required' });
      if (!supplier_name) return res.status(400).json({ success: false, error: 'supplier_name is required' });
      if (!line_items || !Array.isArray(line_items) || !line_items.length)
        return res.status(400).json({ success: false, error: 'line_items array is required' });

      await client.query('BEGIN');

      // Verify PR is approved
      const pr = await client.query('SELECT * FROM mes_purchase_requisitions WHERE id = $1', [pr_id]);
      if (!pr.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'PR not found' }); }
      if (pr.rows[0].status !== 'approved') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `PR must be approved (current: ${pr.rows[0].status})` });
      }

      const totalAmount = line_items.reduce((s, li) => s + ((Number(li.quantity) || 0) * (Number(li.unit_price) || 0)), 0);
      const poNumber = await generateSPONumber(client);

      const result = await client.query(
        `INSERT INTO mes_supplier_purchase_orders
          (po_number, pr_id, supplier_name, supplier_contact, supplier_email,
           line_items, total_amount, currency, expected_delivery, notes, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,'draft',$11)
         RETURNING *`,
        [poNumber, pr_id, supplier_name, supplier_contact || null, supplier_email || null,
         JSON.stringify(line_items), totalAmount, currency || 'AED',
         expected_delivery || null, notes || null, req.user?.id]);

      // Update job card material_status
      await client.query(
        `UPDATE mes_job_cards SET material_status = 'ordered', updated_at = NOW()
         WHERE id = $1 AND division = $2 AND material_status IN ('pending','partially_ordered')`,
        [pr.rows[0].job_card_id, DIVISION]);

      await logActivity(client, pr.rows[0].inquiry_id, req.user?.id,
        `Supplier PO ${poNumber} created for ${supplier_name}`, 'spo_created', { spo_id: result.rows[0].id });

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Error creating SPO:', err);
      res.status(500).json({ success: false, error: 'Failed to create supplier PO' });
    } finally { client.release(); }
  });

  // GET /supplier-purchase-orders
  router.get('/supplier-purchase-orders', authenticate, async (req, res) => {
    try {
      const { pr_id, status } = req.query;
      let sql = `SELECT spo.*, pr.pr_number, pr.job_card_id, jc.job_number, jc.customer_name
                 FROM mes_supplier_purchase_orders spo
                 LEFT JOIN mes_purchase_requisitions pr ON spo.pr_id = pr.id
                 LEFT JOIN mes_job_cards jc ON pr.job_card_id = jc.id AND jc.division = '${DIVISION}'
                 WHERE 1=1`;
      const params = [];
      if (pr_id) { params.push(pr_id); sql += ` AND spo.pr_id = $${params.length}`; }
      if (status) { params.push(status); sql += ` AND spo.status = $${params.length}`; }
      sql += ' ORDER BY spo.created_at DESC';
      const result = await pool.query(sql, params);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('Error listing SPOs:', err);
      res.status(500).json({ success: false, error: 'Failed to list supplier POs' });
    }
  });

  // POST /supplier-purchase-orders/:id/approve
  router.post('/supplier-purchase-orders/:id/approve', authenticate, async (req, res) => {
    try {
      if (!canApproveProcurement(req.user))
        return res.status(403).json({ success: false, error: 'Insufficient role to approve SPO' });

      const result = await pool.query(
        `UPDATE mes_supplier_purchase_orders
         SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND status = 'draft' RETURNING *`,
        [req.user?.id, req.params.id]);
      if (!result.rows.length)
        return res.status(404).json({ success: false, error: 'SPO not found or not in draft' });

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('Error approving SPO:', err);
      res.status(500).json({ success: false, error: 'Failed to approve SPO' });
    }
  });

  // POST /supplier-purchase-orders/:id/send
  router.post('/supplier-purchase-orders/:id/send', authenticate, async (req, res) => {
    try {
      if (!canManageProcurement(req.user))
        return res.status(403).json({ success: false, error: 'Insufficient role' });

      const result = await pool.query(
        `UPDATE mes_supplier_purchase_orders
         SET status = 'sent', sent_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'approved' RETURNING *`,
        [req.params.id]);
      if (!result.rows.length)
        return res.status(404).json({ success: false, error: 'SPO not found or not approved' });

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('Error sending SPO:', err);
      res.status(500).json({ success: false, error: 'Failed to mark SPO as sent' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  STOCK RECEIPTS
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /stock-receipts
  router.post('/stock-receipts', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canReceiveStock(req.user))
        return res.status(403).json({ success: false, error: 'Insufficient role for stock receipt' });

      const { spo_id, received_quantities, quality_notes } = req.body;
      if (!spo_id) return res.status(400).json({ success: false, error: 'spo_id is required' });
      if (!received_quantities || !Array.isArray(received_quantities) || !received_quantities.length)
        return res.status(400).json({ success: false, error: 'received_quantities array is required' });

      await client.query('BEGIN');

      const spo = await client.query(
        `SELECT spo.*, pr.job_card_id, pr.inquiry_id
         FROM mes_supplier_purchase_orders spo
         JOIN mes_purchase_requisitions pr ON spo.pr_id = pr.id
         WHERE spo.id = $1`, [spo_id]);
      if (!spo.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'SPO not found' }); }
      if (!['sent', 'partially_received'].includes(spo.rows[0].status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `SPO must be sent or partially received (current: ${spo.rows[0].status})` });
      }

      const receipt = await client.query(
        `INSERT INTO mes_stock_receipts (spo_id, job_card_id, received_quantities, quality_notes, received_by)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         RETURNING *`,
        [spo_id, spo.rows[0].job_card_id, JSON.stringify(received_quantities),
         quality_notes || null, req.user?.id]);

      // Determine if all lines are fully received
      const lineItems = spo.rows[0].line_items || [];
      const allReceipts = await client.query(
        'SELECT received_quantities FROM mes_stock_receipts WHERE spo_id = $1', [spo_id]);
      const totalReceived = {};
      for (const row of allReceipts.rows) {
        for (const rq of (row.received_quantities || [])) {
          totalReceived[rq.material || rq.name] = (totalReceived[rq.material || rq.name] || 0) + (Number(rq.quantity) || 0);
        }
      }
      const allFulfilled = lineItems.every(li => {
        const key = li.material || li.name;
        return (totalReceived[key] || 0) >= (Number(li.quantity) || 0);
      });

      // Update SPO status
      await client.query(
        `UPDATE mes_supplier_purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
        [allFulfilled ? 'received' : 'partially_received', spo_id]);

      // If all fulfilled, check if ALL SPOs for this job card are received
      if (allFulfilled && spo.rows[0].job_card_id) {
        const openSPOs = await client.query(
          `SELECT spo.id FROM mes_supplier_purchase_orders spo
           JOIN mes_purchase_requisitions pr ON spo.pr_id = pr.id
           WHERE pr.job_card_id = $1 AND spo.status NOT IN ('received','cancelled')`,
          [spo.rows[0].job_card_id]);

        if (openSPOs.rows.length === 0) {
          // All materials available
          await client.query(
            `UPDATE mes_job_cards
             SET material_status = 'available', updated_at = NOW()
             WHERE id = $1 AND division = $2`,
            [spo.rows[0].job_card_id, DIVISION]);

          await logActivity(client, spo.rows[0].inquiry_id, req.user?.id,
            'All materials received — job card confirmed', 'materials_available');

          notifyRoleUsers(['admin', 'manager', 'production_manager'],
            {
              type: 'materials_available',
              title: 'All Materials Received',
              message: `All materials received for Job Card — ready for production`,
              referenceType: 'job_card',
              referenceId: spo.rows[0].job_card_id,
            })
            .catch(err => logger.warn('Materials notification failed:', err.message));
        }
      }

      await logActivity(client, spo.rows[0].inquiry_id, req.user?.id,
        `Stock receipt recorded for SPO ${spo.rows[0].po_number}`, 'stock_received',
        { receipt_id: receipt.rows[0].id, all_fulfilled: allFulfilled });

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: receipt.rows[0], all_fulfilled: allFulfilled });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Error creating stock receipt:', err);
      res.status(500).json({ success: false, error: 'Failed to record stock receipt' });
    } finally { client.release(); }
  });

  // GET /stock-receipts
  router.get('/stock-receipts', authenticate, async (req, res) => {
    try {
      const { spo_id, job_card_id } = req.query;
      let sql = `SELECT sr.*, spo.po_number, spo.supplier_name
                 FROM mes_stock_receipts sr
                 LEFT JOIN mes_supplier_purchase_orders spo ON sr.spo_id = spo.id
                 WHERE 1=1`;
      const params = [];
      if (spo_id) { params.push(spo_id); sql += ` AND sr.spo_id = $${params.length}`; }
      if (job_card_id) { params.push(job_card_id); sql += ` AND sr.job_card_id = $${params.length}`; }
      sql += ' ORDER BY sr.received_at DESC';
      const result = await pool.query(sql, params);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('Error listing receipts:', err);
      res.status(500).json({ success: false, error: 'Failed to list stock receipts' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  PROCUREMENT DASHBOARD (management only)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/procurement/dashboard', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user))
        return res.status(403).json({ success: false, error: 'Management access required' });

      const [prs, spos, overdue, recent] = await Promise.all([
        pool.query(`SELECT status, COUNT(*)::int AS count FROM mes_purchase_requisitions GROUP BY status`),
        pool.query(`SELECT status, COUNT(*)::int AS count FROM mes_supplier_purchase_orders GROUP BY status`),
        pool.query(`SELECT COUNT(*)::int AS count FROM mes_supplier_purchase_orders
                    WHERE status = 'sent' AND expected_delivery < NOW()`),
        pool.query(`SELECT sr.*, spo.po_number, spo.supplier_name
                    FROM mes_stock_receipts sr
                    JOIN mes_supplier_purchase_orders spo ON sr.spo_id = spo.id
                    ORDER BY sr.received_at DESC LIMIT 10`),
      ]);

      const prCounts = {};
      prs.rows.forEach(r => { prCounts[r.status] = r.count; });
      const spoCounts = {};
      spos.rows.forEach(r => { spoCounts[r.status] = r.count; });

      res.json({
        success: true,
        data: {
          prs: prCounts,
          spos: spoCounts,
          overdue_deliveries: overdue.rows[0].count,
          recent_receipts: recent.rows,
        },
      });
    } catch (err) {
      logger.error('Error fetching procurement dashboard:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch procurement dashboard' });
    }
  });

};
