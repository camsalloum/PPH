/**
 * Presales Inquiries — core CRUD (list, create, detail, delete)
 * Status, stats, history → inquiries-status.js
 * Clearance, phase, kanban → inquiries-admin.js
 */
const {
  pool, authenticate, logger,
  notifyUsers, notifyRoleUsers,
  DIVISION,
  getSalesRepGroup, isAdminOrMgmt, actorName, logActivity,
} = require('./_helpers');

module.exports = function (router) {

  // ── GET /inquiries ─────────────────────────────────────────────────────────
  router.get('/inquiries', authenticate, async (req, res) => {
    try {
      const { status, priority, customer_type, rep_group_id, search, page = 1, limit = 50 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      let groupFilter = null;

      if (isAdminOrMgmt(req.user)) {
        if (rep_group_id && rep_group_id !== 'all') {
          groupFilter = parseInt(rep_group_id);
        }
      } else {
        const repGroup = await getSalesRepGroup(req.user.id);
        if (!repGroup) {
          return res.json({ success: true, data: { inquiries: [], total: 0 } });
        }
        groupFilter = repGroup.groupId;
      }

      const params = [DIVISION];
      const conditions = ['i.division = $1', 'i.deleted_at IS NULL'];
      let p = 2;

      if (groupFilter) {
        conditions.push(`i.sales_rep_group_id = $${p++}`);
        params.push(groupFilter);
      }
      if (status) {
        conditions.push(`i.status = $${p++}`);
        params.push(status);
      }
      if (priority) {
        conditions.push(`i.priority = $${p++}`);
        params.push(priority);
      }
      if (customer_type) {
        conditions.push(`i.customer_type = $${p++}`);
        params.push(customer_type);
      }
      if (search) {
        conditions.push(`(i.customer_name ILIKE $${p} OR i.inquiry_number ILIKE $${p})`);
        params.push(`%${search}%`);
        p++;
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await pool.query(
        `SELECT COUNT(*) FROM mes_presales_inquiries i ${where}`,
        params
      );
      const total = parseInt(countRes.rows[0].count);

      const dataRes = await pool.query(
        `SELECT
           i.*,
           srg.group_name            AS rep_group_display,
           p.id                      AS prospect_id_ref,
           p.approval_status         AS prospect_approval_status,
           p.customer_name           AS prospect_company_name
         FROM mes_presales_inquiries i
         LEFT JOIN sales_rep_groups srg ON srg.id = i.sales_rep_group_id
         LEFT JOIN fp_prospects p ON p.id = i.prospect_id
         ${where}
         ORDER BY i.created_at DESC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, parseInt(limit), offset]
      );

      res.json({
        success: true,
        data: {
          inquiries: dataRes.rows,
          total,
          page: parseInt(page),
          limit: parseInt(limit),
        },
      });
    } catch (err) {
      logger.error('MES PreSales: error fetching inquiries', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /inquiries ────────────────────────────────────────────────────────
  router.post('/inquiries', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        source, source_detail, customer_type, customer_id, customer_name, customer_country,
        product_groups = [], estimated_quantity, quantity_unit = 'KGS', priority = 'normal',
        notes, follow_up_date,
        sample_required = false, sample_type = null, sample_notes = null,
        sales_rep_group_id,
        prospect_id: existingProspectId,
        // CRM fields
        inquiry_type = 'sar',
        contact_name, contact_phone, contact_email, contact_whatsapp,
        estimated_value, expected_close_date,
      } = req.body;

      if (!source) return res.status(400).json({ success: false, error: 'Source is required' });
      if (!customer_type) return res.status(400).json({ success: false, error: 'Customer type is required' });
      if (!customer_name) return res.status(400).json({ success: false, error: 'Customer name is required' });

      let repGroupId = sales_rep_group_id;
      let repGroupName = null;

      if (!isAdminOrMgmt(req.user) || !repGroupId) {
        const repGroup = await getSalesRepGroup(req.user.id);
        if (!repGroup) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'You are not registered as a sales rep. Contact admin.' });
        }
        repGroupId = repGroup.groupId;
        repGroupName = repGroup.groupName;
      } else {
        const gr = await pool.query('SELECT group_name FROM sales_rep_groups WHERE id = $1', [repGroupId]);
        repGroupName = gr.rows[0]?.group_name || null;
      }

      const numRes = await client.query(`SELECT generate_inquiry_number($1) AS num`, [DIVISION]);
      const inquiryNumber = numRes.rows[0].num;

      const insertRes = await client.query(
        `INSERT INTO mes_presales_inquiries (
           inquiry_number, division,
           sales_rep_group_id, sales_rep_group_name,
           source, source_detail,
           customer_type, customer_id, customer_name, customer_country,
           product_groups, estimated_quantity, quantity_unit,
           priority, notes, follow_up_date, prospect_id,
           sample_required, sample_type, sample_notes,
           inquiry_type, contact_name, contact_phone, contact_email, contact_whatsapp,
           estimated_value, expected_close_date
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::text,$20::text,
           $21,$22,$23,$24,$25,$26,$27
         ) RETURNING *`,
        [
          inquiryNumber, DIVISION, repGroupId, repGroupName,
          source, source_detail || null,
          customer_type, customer_id || null, customer_name, customer_country || null,
          JSON.stringify(product_groups), estimated_quantity || null, quantity_unit,
          priority, notes || null, follow_up_date || null,
          existingProspectId || null,
          !!sample_required, sample_type || null, sample_notes || null,
          inquiry_type || 'sar',
          contact_name || null, contact_phone || null, contact_email || null, contact_whatsapp || null,
          estimated_value || null, expected_close_date || null,
        ]
      );

      let newProspectId = existingProspectId || null;
      if (!newProspectId && customer_type === 'new' && req.body.new_prospect) {
        const np = req.body.new_prospect;
        if (!np.company_name) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: 'company_name is required for new prospect' });
        }
        const prospectInsert = await client.query(
          `INSERT INTO fp_prospects
             (customer_name, country, mobile_number, telephone_number, contact_name, contact_email,
              sales_rep_group, division, source, approval_status, budget_year)
           VALUES ($1,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8,'inquiry','pending',
                   EXTRACT(YEAR FROM CURRENT_DATE)::integer)
           RETURNING id`,
          [np.company_name, np.country || null, np.mobile_number || null, np.telephone_number || null,
           np.contact_name || null, np.contact_email || null, repGroupName, DIVISION]
        );
        newProspectId = prospectInsert.rows[0].id;
        await client.query(
          `UPDATE mes_presales_inquiries SET prospect_id = $1 WHERE id = $2`,
          [newProspectId, insertRes.rows[0].id]
        );
        insertRes.rows[0].prospect_id = newProspectId;
      }

      // ── Save quotation line items (price-quotation inquiries) ───────────
      const quotation_items = req.body.quotation_items || [];
      if (inquiry_type === 'quotation' && quotation_items.length > 0) {
        for (let idx = 0; idx < quotation_items.length; idx++) {
          const qi = quotation_items[idx];
          if (!qi.product_group_name) continue;
          await client.query(
            `INSERT INTO mes_presales_inquiry_items
               (inquiry_id, product_group_id, product_group_name,
                width_mm, length_mm, thickness_um,
                quantity, quantity_unit, description, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              insertRes.rows[0].id,
              qi.product_group_id || null,
              qi.product_group_name,
              qi.width_mm || null,
              qi.length_mm || null,
              qi.thickness_um || null,
              qi.quantity || null,
              qi.quantity_unit || 'KGS',
              qi.description || null,
              idx,
            ]
          );
        }
      }

      // Lifecycle stage: SAR → sar_pending, quotation/general → new_inquiry
      const initialStage = inquiry_type === 'sar' ? 'sar_pending' : 'new_inquiry';
      await client.query(
        `UPDATE mes_presales_inquiries SET inquiry_stage = $1, stage_changed_at = NOW() WHERE id = $2`,
        [initialStage, insertRes.rows[0].id]
      );
      insertRes.rows[0].inquiry_stage = initialStage;

      await client.query('COMMIT');
      logger.info(`MES PreSales: inquiry created ${inquiryNumber}`);

      logActivity(insertRes.rows[0].id, 'inquiry_created', {
        inquiry_number: inquiryNumber, source, customer_type, customer_name, product_groups,
      }, req.user);

      // G1: notify sales coordinator / manager on new inquiry
      try {
        await notifyRoleUsers(
          ['sales_coordinator', 'sales_manager'],
          {
            type: 'inquiry_created',
            title: `New inquiry ${inquiryNumber}`,
            message: `${customer_name} — ${(product_groups || []).join(', ')}`,
            link: `/mes/presales/inquiries/${insertRes.rows[0].id}`,
            referenceType: 'inquiry',
            referenceId: insertRes.rows[0].id,
          },
          { excludeUserIds: [req.user?.id] }
        );
      } catch (ne) { logger.warn('Inquiry created notify error:', ne.message); }

      res.status(201).json({
        success: true,
        data: insertRes.rows[0],
        message: `Inquiry ${inquiryNumber} created successfully`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error creating inquiry', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── GET /inquiries/:id ─────────────────────────────────────────────────────
  router.get('/inquiries/:id', authenticate, async (req, res) => {
    try {
      const { id } = req.params;

      const inquiryRes = await pool.query(
        `SELECT i.*, srg.group_name AS rep_group_display
         FROM mes_presales_inquiries i
         LEFT JOIN sales_rep_groups srg ON srg.id = i.sales_rep_group_id
         WHERE i.id = $1 AND i.division = $2 AND i.deleted_at IS NULL`,
        [id, DIVISION]
      );

      if (inquiryRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }

      const inquiry = inquiryRes.rows[0];

      if (!isAdminOrMgmt(req.user)) {
        const repGroup = await getSalesRepGroup(req.user.id);
        if (!repGroup || repGroup.groupId !== inquiry.sales_rep_group_id) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }

      let prospect = null;
      if (inquiry.prospect_id) {
        const prospectRes = await pool.query(`SELECT * FROM fp_prospects WHERE id = $1`, [inquiry.prospect_id]);
        prospect = prospectRes.rows[0] || null;
      }

      const attachmentsRes = await pool.query(
        `SELECT * FROM inquiry_attachments WHERE inquiry_id = $1 ORDER BY created_at DESC`, [id]
      );
      const samplesRes = await pool.query(
        `SELECT * FROM mes_presales_samples WHERE inquiry_id = $1 ORDER BY created_at DESC`, [id]
      );
      const moqRes = await pool.query(
        `SELECT m.*, s.sample_number
         FROM mes_presales_moq_checks m
         LEFT JOIN mes_presales_samples s ON s.id = m.sample_id
         WHERE m.inquiry_id = $1 ORDER BY m.created_at ASC`, [id]
      );
      const materialRes = await pool.query(
        `SELECT * FROM mes_presales_material_checks WHERE inquiry_id = $1 ORDER BY created_at ASC`, [id]
      );
      const cseRes = await pool.query(
        `SELECT id, cse_number, sample_id, sample_number, overall_result,
                status, qc_manager_status, prod_manager_status, final_status,
                created_at, updated_at
         FROM mes_cse_reports
         WHERE inquiry_id = $1 ORDER BY created_at DESC`, [id]
      );

      // Quotation line items (price-quotation inquiries)
      const itemsRes = await pool.query(
        `SELECT * FROM mes_presales_inquiry_items WHERE inquiry_id = $1 ORDER BY sort_order, id`, [id]
      );

      res.json({
        success: true,
        data: {
          inquiry, prospect,
          attachments: attachmentsRes.rows,
          samples: samplesRes.rows,
          moq_checks: moqRes.rows,
          material_checks: materialRes.rows,
          cse_reports: cseRes.rows,
          inquiry_items: itemsRes.rows,
        },
      });
    } catch (err) {
      logger.error('MES PreSales: error fetching inquiry', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── DELETE /inquiries/:id ──────────────────────────────────────────────────
  router.delete('/inquiries/:id', authenticate, async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await pool.query(
        'SELECT * FROM mes_presales_inquiries WHERE id = $1 AND division = $2 AND deleted_at IS NULL', [id, DIVISION]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }

      const inq = existing.rows[0];

      if (!isAdminOrMgmt(req.user)) {
        const repGroup = await getSalesRepGroup(req.user.id);
        if (!repGroup || repGroup.groupId !== inq.sales_rep_group_id) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
        if (inq.status !== 'new') {
          return res.status(400).json({ success: false, error: 'Only inquiries with status "new" can be deleted by the rep.' });
        }
      }

      // Soft-delete: mark as deleted instead of permanently removing
      await pool.query(
        `UPDATE mes_presales_inquiries
         SET deleted_at = NOW(), deleted_by = $1, deleted_by_name = $2
         WHERE id = $3`,
        [req.user.id, actorName(req.user), id]
      );
      logActivity(id, 'inquiry_deleted', { deleted_by: actorName(req.user) }, req.user);
      res.json({ success: true, message: 'Inquiry moved to trash' });
    } catch (err) {
      logger.error('MES PreSales: error deleting inquiry', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
// Status, stats, history endpoints → inquiries-status.js
// Clearance, phase, kanban endpoints → inquiries-admin.js
