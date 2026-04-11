/**
 * Presales Job Cards — CRUD + approve endpoints
 * POST /job-cards  GET /job-cards  GET /job-cards/:id  PATCH /job-cards/:id  POST /job-cards/:id/approve
 */
const {
  pool, authenticate, logger,
  isAdminOrMgmt, getSalesRepGroup, canApproveProductionStage,
  checkInquiryOwnership, logActivity, notifyUsers, notifyRoleUsers, actorName,
} = require('./_helpers');
const { syncDealFromInquiry } = require('../../../services/dealSyncService');

const DIVISION = 'FP';

function canCreateJobCard(user) {
  return ['admin', 'manager', 'sales_manager', 'production_manager'].includes(user?.role);
}

async function generateJobNumber(client) {
  await client.query("CREATE SEQUENCE IF NOT EXISTS jc_fp_seq START 1");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('jc_fp_seq'))");
  const year = new Date().getFullYear();
  const prefix = `JC-FP-${year}-`;
  const seqVal = await client.query('SELECT last_value, is_called FROM jc_fp_seq');
  if (!seqVal.rows[0].is_called) {
    const maxRes = await client.query(
      'SELECT job_number FROM mes_job_cards WHERE job_number LIKE $1 AND division = $2 ORDER BY id DESC LIMIT 1',
      [`${prefix}%`, DIVISION]
    );
    if (maxRes.rows.length > 0) {
      const num = parseInt(maxRes.rows[0].job_number.replace(prefix, ''), 10);
      if (!isNaN(num) && num > 0) await client.query("SELECT setval('jc_fp_seq', $1)", [num]);
    }
  }
  const nextRes = await client.query("SELECT nextval('jc_fp_seq') AS seq");
  return `${prefix}${String(nextRes.rows[0].seq).padStart(5, '0')}`;
}

module.exports = function (router) {

  // ── POST /job-cards ────────────────────────────────────────────────────────
  router.post('/job-cards', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canCreateJobCard(req.user))
        return res.status(403).json({ success: false, error: 'Only management/production roles can create job cards' });

      const { inquiry_id, product_specs, quantity, quantity_unit,
              required_delivery_date, material_requirements } = req.body;
      if (!inquiry_id) return res.status(400).json({ success: false, error: 'inquiry_id is required' });

      await client.query('BEGIN');
      const inqRes = await client.query(
        `SELECT id, inquiry_number, customer_id, customer_name, inquiry_stage
         FROM mes_presales_inquiries WHERE id = $1 FOR UPDATE`, [inquiry_id]);
      if (!inqRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Inquiry not found' }); }
      const inq = inqRes.rows[0];
      if (inq.inquiry_stage !== 'order_confirmed') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `Inquiry must be at order_confirmed (current: ${inq.inquiry_stage})` });
      }

      // Check no existing job card
      const existing = await client.query('SELECT id FROM mes_job_cards WHERE inquiry_id = $1 AND division = $2', [inquiry_id, DIVISION]);
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Job card already exists for this inquiry' });
      }

      // Auto-populate from CSE + quotation + PO if not provided
      let specs = product_specs || null;
      let qty = quantity || null;
      let deliveryDate = required_delivery_date || null;
      let bom = material_requirements || [];

      if (!specs) {
        const cseRes = await client.query(
          `SELECT test_summary FROM mes_cse_reports WHERE inquiry_id = $1 AND final_status = 'approved' ORDER BY created_at DESC LIMIT 1`,
          [inquiry_id]);
        if (cseRes.rows.length) specs = cseRes.rows[0].test_summary;
      }
      if (!qty) {
        const qRes = await client.query(
          `SELECT quantity FROM mes_quotations WHERE inquiry_id = $1 AND status = 'approved' ORDER BY created_at DESC LIMIT 1`,
          [inquiry_id]);
        if (qRes.rows.length) qty = qRes.rows[0].quantity;
      }
      if (!deliveryDate) {
        const poRes = await client.query(
          `SELECT requested_delivery_date FROM mes_customer_purchase_orders WHERE inquiry_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [inquiry_id]);
        if (poRes.rows.length) deliveryDate = poRes.rows[0].requested_delivery_date;
      }

      const jobNumber = await generateJobNumber(client);
      const jcRes = await client.query(
        `INSERT INTO mes_job_cards
          (job_number, inquiry_id, customer_id, customer_name, product_specs,
           quantity, quantity_unit, required_delivery_date, material_requirements,
           material_status, status, division, created_by)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,'pending','draft',$10,$11)
         RETURNING *`,
        [jobNumber, inquiry_id, inq.customer_id, inq.customer_name,
         JSON.stringify(specs || {}), qty, quantity_unit || 'kg',
         deliveryDate, JSON.stringify(bom), DIVISION, req.user?.id]);

      await logActivity(inquiry_id, 'job_card_created', {
        job_card_id: jcRes.rows[0].id, job_number: jobNumber,
      }, req.user, client);
      await client.query('COMMIT');

      notifyRoleUsers(['production_manager', 'manager', 'sales_rep', 'sales_manager'], {
        type: 'job_card_created', title: 'Job Card Created',
        message: `${jobNumber} for ${inq.customer_name} (${inq.inquiry_number})`,
        link: `/mes/presales/inquiries/${inquiry_id}`,
      }).catch(() => {});

      res.status(201).json({ success: true, data: jcRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES JobCards: create error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally { client.release(); }
  });

  // ── GET /job-cards ─────────────────────────────────────────────────────────
  router.get('/job-cards', authenticate, async (req, res) => {
    try {
      const isAdmin = isAdminOrMgmt(req.user);
      const params = [DIVISION];
      let idx = 2;
      let scopeJoin = '';
      let scopeWhere = '';

      if (!isAdmin) {
        const group = await getSalesRepGroup(req.user.id);
        if (!group) return res.json({ success: true, data: [] });
        scopeJoin = 'JOIN mes_presales_inquiries i ON i.id = jc.inquiry_id';
        scopeWhere = `AND i.sales_rep_group_id = $${idx++}`;
        params.push(group.groupId);
      }

      let statusFilter = '';
      if (req.query.status) { statusFilter = `AND jc.status = $${idx++}`; params.push(req.query.status); }
      let dateFrom = '';
      if (req.query.from) { dateFrom = `AND jc.created_at >= $${idx++}`; params.push(req.query.from); }
      let dateTo = '';
      if (req.query.to) { dateTo = `AND jc.created_at <= $${idx++}`; params.push(req.query.to); }
      let inquiryFilter = '';
      if (req.query.inquiry_id !== undefined) {
        const inquiryId = parseInt(req.query.inquiry_id, 10);
        if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid inquiry_id' });
        }
        inquiryFilter = `AND jc.inquiry_id = $${idx++}`;
        params.push(inquiryId);
      }

      const result = await pool.query(
        `SELECT jc.*, i.inquiry_number, i.inquiry_stage
         FROM mes_job_cards jc
         ${isAdmin ? 'LEFT JOIN mes_presales_inquiries i ON i.id = jc.inquiry_id' : scopeJoin}
        WHERE jc.division = $1 ${scopeWhere} ${statusFilter} ${dateFrom} ${dateTo} ${inquiryFilter}
         ORDER BY jc.created_at DESC`, params);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES JobCards: list error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /job-cards/:id ─────────────────────────────────────────────────────
  router.get('/job-cards/:id', authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT jc.*, i.inquiry_number, i.inquiry_stage, i.customer_country
         FROM mes_job_cards jc
         LEFT JOIN mes_presales_inquiries i ON i.id = jc.inquiry_id
        WHERE jc.id = $1 AND jc.division = $2`, [req.params.id, DIVISION]);
      if (!result.rows.length) return res.status(404).json({ success: false, error: 'Job card not found' });
      const jc = result.rows[0];
      const allowed = await checkInquiryOwnership(req.user, jc.inquiry_id);
      if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
      res.json({ success: true, data: jc });
    } catch (err) {
      logger.error('MES JobCards: detail error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /job-cards/:id ───────────────────────────────────────────────────
  router.patch('/job-cards/:id', authenticate, async (req, res) => {
    try {
      if (!canCreateJobCard(req.user))
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });

      const jcRes = await pool.query(
        'SELECT id, status, inquiry_id FROM mes_job_cards WHERE id = $1 AND division = $2',
        [req.params.id, DIVISION]
      );
      if (!jcRes.rows.length) return res.status(404).json({ success: false, error: 'Job card not found' });
      if (jcRes.rows[0].status !== 'draft')
        return res.status(400).json({ success: false, error: 'Only draft job cards can be edited' });

      const { product_specs, quantity, quantity_unit, required_delivery_date, material_requirements } = req.body;
      const sets = []; const params = []; let idx = 1;
      if (product_specs !== undefined) { sets.push(`product_specs = $${idx++}::jsonb`); params.push(JSON.stringify(product_specs)); }
      if (quantity !== undefined) { sets.push(`quantity = $${idx++}`); params.push(quantity); }
      if (quantity_unit !== undefined) { sets.push(`quantity_unit = $${idx++}`); params.push(quantity_unit); }
      if (required_delivery_date !== undefined) { sets.push(`required_delivery_date = $${idx++}`); params.push(required_delivery_date); }
      if (material_requirements !== undefined) { sets.push(`material_requirements = $${idx++}::jsonb`); params.push(JSON.stringify(material_requirements)); }
      if (!sets.length) return res.status(400).json({ success: false, error: 'No fields to update' });

      sets.push(`updated_at = NOW()`);
      params.push(req.params.id);
      params.push(DIVISION);
      const result = await pool.query(
        `UPDATE mes_job_cards SET ${sets.join(', ')} WHERE id = $${idx} AND division = $${idx + 1} RETURNING *`, params);
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES JobCards: update error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /job-cards/:id/approve ────────────────────────────────────────────
  router.post('/job-cards/:id/approve', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canCreateJobCard(req.user))
        return res.status(403).json({ success: false, error: 'Only management/production roles can approve job cards' });

      await client.query('BEGIN');
      const jcRes = await client.query(
        'SELECT * FROM mes_job_cards WHERE id = $1 AND division = $2 FOR UPDATE', [req.params.id, DIVISION]);
      if (!jcRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Job card not found' }); }
      const jc = jcRes.rows[0];
      if (jc.status !== 'draft') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `Job card must be draft to approve (current: ${jc.status})` });
      }

      await client.query(
        `UPDATE mes_job_cards SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND division = $3`, [req.user?.id, req.params.id, DIVISION]);

      // ── Create MES production job (mes_job_tracker + 17 phase records) ────
      let mesJob = null;
      try {
        const numRes = await client.query(`SELECT generate_job_number('FP') AS num`);
        const mesJobNumber = numRes.rows[0].num;

        const mesJobRes = await client.query(
          `INSERT INTO mes_job_tracker
             (job_number, division, inquiry_id, customer_name, customer_country,
              current_phase, overall_status, assigned_dept, priority)
           VALUES ($1, 'FP', $2, $3, $4, 1, 'active', 'sales', 'normal')
           RETURNING *`,
          [mesJobNumber, jc.inquiry_id, jc.customer_name, jc.customer_country || null]
        );
        mesJob = mesJobRes.rows[0];

        // Create phase records for all 17 workflow phases
        const phaseRes = await client.query(
          `SELECT phase_number, departments FROM mes_workflow_phases ORDER BY phase_number`
        );
        for (const phase of phaseRes.rows) {
          const isFirst = phase.phase_number === 1;
          await client.query(
            `INSERT INTO mes_job_phases (job_id, phase_number, status, owned_by_dept, started_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [mesJob.id, phase.phase_number, isFirst ? 'active' : 'pending',
             isFirst ? phase.departments[0] : null, isFirst ? new Date() : null]
          );
        }

        // Activity log for MES job creation
        await client.query(
          `INSERT INTO mes_job_activity_log (job_id, phase_number, action, to_dept, performed_by_id, performed_by, details)
           VALUES ($1, 1, 'job_created', 'sales', $2, $3, $4)`,
          [mesJob.id, req.user?.id, actorName(req.user), `MES job ${mesJobNumber} created from job card ${jc.job_number}`]
        );

        // Link mes_job_tracker back to inquiry
        await client.query(
          `UPDATE mes_presales_inquiries SET converted_to_so = $1 WHERE id = $2`,
          [mesJobNumber, jc.inquiry_id]
        );
      } catch (mesErr) {
        logger.warn(`JobCard approve: MES job creation failed for JC ${jc.job_number}`, mesErr);
        // Non-fatal — approval still proceeds
      }

      // Advance inquiry → in_production
      await client.query(
        `UPDATE mes_presales_inquiries SET inquiry_stage = 'in_production', stage_changed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND inquiry_stage = 'order_confirmed'`, [jc.inquiry_id]);

      // Sync deal (best-effort)
      try { await syncDealFromInquiry(jc.inquiry_id, 'in_production', client); }
      catch (e) { logger.warn(`JobCard approve: deal sync failed for inquiry ${jc.inquiry_id}`, e); }

      await logActivity(jc.inquiry_id, 'job_card_approved', {
        job_card_id: jc.id, job_number: jc.job_number, approved_by: actorName(req.user),
      }, req.user, client);
      await client.query('COMMIT');

      notifyRoleUsers(['production_manager', 'manager', 'sales_rep', 'sales_manager'], {
        type: 'job_card_approved', title: 'Job Card Approved',
        message: `${jc.job_number} approved by ${actorName(req.user)} — production can begin`,
        link: `/mes/presales/inquiries/${jc.inquiry_id}`,
      }).catch(() => {});

      res.json({ success: true, data: { ...jc, status: 'approved', approved_by: req.user?.id } });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES JobCards: approve error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally { client.release(); }
  });

};
