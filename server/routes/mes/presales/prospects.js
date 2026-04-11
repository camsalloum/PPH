/**
 * Presales Prospects — CRUD, approve/reject, standalone registration
 */
const {
  pool, authenticate, logger,
  notifyUsers, notifyRoleUsers,
  DIVISION,
  getSalesRepGroup, isAdminOrMgmt, checkInquiryOwnership, actorName, logActivity,
} = require('./_helpers');

module.exports = function (router) {

  // ── POST /inquiries/:id/prospect ───────────────────────────────────────────
  router.post('/inquiries/:id/prospect', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id } = req.params;

      const inqRes = await client.query(
        'SELECT * FROM mes_presales_inquiries WHERE id = $1 AND division = $2', [id, DIVISION]
      );
      if (inqRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }

      if (!isAdminOrMgmt(req.user)) {
        const repGroup = await getSalesRepGroup(req.user.id);
        if (!repGroup || repGroup.groupId !== inqRes.rows[0].sales_rep_group_id) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }

      const inq = inqRes.rows[0];
      if (inq.prospect_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Prospect already linked to this inquiry. Use PATCH /prospects/:id to update.' });
      }

      const { company_name, country, mobile_number, telephone_number, contact_name, contact_email } = req.body;
      if (!company_name) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Company name is required' });
      }

      const groupRes = await client.query('SELECT group_name FROM sales_rep_groups WHERE id = $1', [inq.sales_rep_group_id]);
      const repGroupName = groupRes.rows[0]?.group_name || null;

      const prospectRes = await client.query(
        `INSERT INTO fp_prospects
           (customer_name, country, mobile_number, telephone_number, contact_name, contact_email,
            sales_rep_group, division, source, approval_status, budget_year)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'inquiry','pending',
                 EXTRACT(YEAR FROM CURRENT_DATE)::integer)
         RETURNING *`,
        [company_name, country || null, mobile_number || null, telephone_number || null,
         contact_name || null, contact_email || null, repGroupName, DIVISION]
      );

      const newProspect = prospectRes.rows[0];

      await client.query(
        `UPDATE mes_presales_inquiries
         SET prospect_id = $1, status = 'customer_registered'
         WHERE id = $2 AND status IN ('new','in_progress')`,
        [newProspect.id, id]
      );

      await client.query('COMMIT');
      logActivity(parseInt(id), 'prospect_registered', { prospect_id: newProspect.id, company_name }, req.user);

      try {
        await notifyRoleUsers(
          ['admin', 'manager'],
          {
            type: 'prospect_pending_approval',
            title: `New prospect needs approval — ${company_name}`,
            message: `Submitted by ${actorName(req.user)}`,
            link: `/crm/inquiries/${id}`,
            referenceType: 'inquiry',
            referenceId: parseInt(id),
          },
          { excludeUserIds: [req.user?.id] }
        );
      } catch (notifyErr) {
        logger.warn('MES PreSales: prospect_registered notification failed', notifyErr.message);
      }
      res.status(201).json({ success: true, data: newProspect, message: 'Prospect created and linked to inquiry — pending manager approval' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error creating prospect', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── PATCH /prospects/:prospectId ───────────────────────────────────────────
  router.patch('/prospects/:prospectId', authenticate, async (req, res) => {
    try {
      const { prospectId } = req.params;

      const linkedInquiry = await pool.query(
        'SELECT id FROM mes_presales_inquiries WHERE prospect_id = $1', [parseInt(prospectId, 10)]
      );
      if (linkedInquiry.rows.length > 0) {
        const canAccess = await checkInquiryOwnership(req.user, linkedInquiry.rows[0].id);
        if (!canAccess) return res.status(403).json({ success: false, error: 'Access denied' });
      } else if (!isAdminOrMgmt(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const fields = req.body;
      const allowed = ['customer_name','country','mobile_number','telephone_number','contact_name','contact_email','notes'];
      const setClauses = [];
      const values = [];
      let p = 1;

      for (const key of allowed) {
        if (key in fields) {
          setClauses.push(`${key} = $${p++}`);
          values.push(fields[key]);
        }
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid fields to update' });
      }

      values.push(parseInt(prospectId));
      const result = await pool.query(
        `UPDATE fp_prospects SET ${setClauses.join(', ')} WHERE id = $${p} RETURNING *`, values
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Prospect not found' });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES PreSales: error updating prospect', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /prospects/:prospectId/approve ───────────────────────────────────
  router.patch('/prospects/:prospectId/approve', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Only admins can approve prospects' });
    }
    try {
      const { prospectId } = req.params;
      const approverName = req.user.email || `User ${req.user.id}`;

      const result = await pool.query(
        `UPDATE fp_prospects
         SET approval_status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2 AND division = $3
         RETURNING *`,
        [approverName, parseInt(prospectId), DIVISION]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Prospect not found' });
      }

      const advancedRes = await pool.query(
        `UPDATE mes_presales_inquiries SET status = 'qualified'
         WHERE prospect_id = $1 AND status = 'customer_registered'
         RETURNING id`,
        [parseInt(prospectId)]
      );

      if (advancedRes.rows.length > 0) {
        const inquiryId = advancedRes.rows[0].id;
        logActivity(inquiryId, 'prospect_approved', { prospect_id: parseInt(prospectId), approved_by: approverName }, req.user);
        try {
          const ownerRes = await pool.query(`SELECT created_by FROM mes_presales_inquiries WHERE id = $1`, [inquiryId]);
          const ownerId = ownerRes.rows[0]?.created_by || null;
          if (ownerId) {
            await notifyUsers(
              [ownerId],
              {
                type: 'prospect_approved',
                title: `Prospect approved — ${result.rows[0].company_name || result.rows[0].customer_name}`,
                message: `Approved by ${approverName}. Inquiry moved to Qualified.`,
                link: `/crm/inquiries/${inquiryId}`,
                referenceType: 'inquiry',
                referenceId: inquiryId,
              },
              { excludeUserIds: [req.user?.id] }
            );
          }
        } catch (notifyErr) {
          logger.warn('MES PreSales: prospect_approved notification failed', notifyErr.message);
        }
      }

      res.json({ success: true, data: result.rows[0], message: 'Prospect approved' });
    } catch (err) {
      logger.error('MES PreSales: error approving prospect', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /prospects/:prospectId/reject ────────────────────────────────────
  router.patch('/prospects/:prospectId/reject', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Only admins can reject prospects' });
    }
    try {
      const { prospectId } = req.params;
      const { rejection_reason } = req.body;

      const result = await pool.query(
        `UPDATE fp_prospects
         SET approval_status = 'rejected', rejection_reason = $1
         WHERE id = $2 AND division = $3
         RETURNING *`,
        [rejection_reason || null, parseInt(prospectId), DIVISION]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Prospect not found' });
      }

      const linkedInq = await pool.query(
        `SELECT id, created_by FROM mes_presales_inquiries WHERE prospect_id = $1`, [parseInt(prospectId)]
      );
      if (linkedInq.rows.length > 0) {
        const inquiryId = linkedInq.rows[0].id;
        logActivity(inquiryId, 'prospect_rejected', { prospect_id: parseInt(prospectId), rejection_reason }, req.user);
        try {
          const ownerId = linkedInq.rows[0].created_by || null;
          if (ownerId) {
            await notifyUsers(
              [ownerId],
              {
                type: 'prospect_rejected',
                title: `Prospect not approved — ${result.rows[0].customer_name}`,
                message: rejection_reason
                  ? `Reason: ${rejection_reason}`
                  : `Rejected by ${actorName(req.user)}`,
                link: `/crm/inquiries/${inquiryId}`,
                referenceType: 'inquiry',
                referenceId: inquiryId,
              },
              { excludeUserIds: [req.user?.id] }
            );
          }
        } catch (notifyErr) {
          logger.warn('MES PreSales: prospect_rejected notification failed', notifyErr.message);
        }
      }

      res.json({ success: true, data: result.rows[0], message: 'Prospect rejected' });
    } catch (err) {
      logger.error('MES PreSales: error rejecting prospect', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /register-prospect ────────────────────────────────────────────────
  router.post('/register-prospect', authenticate, async (req, res) => {
    try {
      const { company_name, country, mobile_number, telephone_number, contact_name, contact_email, sales_rep_group_name: adminGroupName, source } = req.body;
      if (!company_name || !company_name.trim()) {
        return res.status(400).json({ success: false, error: 'Company name is required' });
      }

      let repGroupName = null;
      if (!isAdminOrMgmt(req.user)) {
        const repGroup = await getSalesRepGroup(req.user.id);
        if (!repGroup) return res.status(403).json({ success: false, error: 'You are not registered as a sales rep' });
        repGroupName = repGroup.groupName;
      } else {
        repGroupName = adminGroupName || null;
      }

      const dup = await pool.query(
        `SELECT id, customer_name FROM fp_prospects
         WHERE UPPER(TRIM(customer_name)) = UPPER(TRIM($1)) AND UPPER(division) = $2 LIMIT 1`,
        [company_name.trim(), DIVISION]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: `A prospect named "${dup.rows[0].customer_name}" already exists`,
          existing_id: dup.rows[0].id,
        });
      }

      const result = await pool.query(
        `INSERT INTO fp_prospects
           (customer_name, country, mobile_number, telephone_number, contact_name, contact_email,
            sales_rep_group, division, source, approval_status, budget_year)
         VALUES ($1,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8,$9,$10,
                 EXTRACT(YEAR FROM CURRENT_DATE)::integer)
         RETURNING *`,
        [company_name.trim(), country || null, mobile_number || null, telephone_number || null,
         contact_name || null, contact_email || null, repGroupName, DIVISION, source || 'other', 'pending']
      );

      logger.info(`MES PreSales: registered new prospect "${company_name}" (id=${result.rows[0].id})`);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES PreSales: error registering prospect', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
