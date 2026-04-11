/**
 * Presales CSE Reports — list, detail, approve/reject/revision, share, public, comments, revisions
 */
const {
  pool, crypto, authenticate, logger, logAudit,
  notifyUsers, notifyRoleUsers, sendCriticalEventEmail, authPool,
  DIVISION,
  isAdminOrMgmt, canAccessCSEWorkflow, canApproveQCStage, canApproveProductionStage,
  actorName, logActivity, insertCSERevision,
} = require('./_helpers');

module.exports = function (router) {

  // ── GET /cse ───────────────────────────────────────────────────────────────
  router.get('/cse', authenticate, async (req, res) => {
    try {
      if (!canAccessCSEWorkflow(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 200);
      const offset = (page - 1) * limit;

      const rawStatus = (req.query.status || '').toString();
      const statusList = rawStatus
        ? rawStatus.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const params = [];
      const conditions = [];
      let idx = 1;

      if (statusList.length > 0) {
        conditions.push(`c.status = ANY($${idx++}::text[])`);
        params.push(statusList);
      }
      if (req.query.inquiry_id) {
        conditions.push(`c.inquiry_id = $${idx++}`);
        params.push(parseInt(req.query.inquiry_id, 10));
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await pool.query(
        `SELECT COUNT(*) AS total FROM mes_cse_reports c ${whereClause}`, params
      );

      const listRes = await pool.query(
        `SELECT
           c.id, c.cse_number, c.sample_id, c.inquiry_id, c.analysis_id,
           c.customer_name, c.product_group, c.sample_number, c.inquiry_number,
           c.overall_result, c.status, c.final_status,
           c.created_by_name, c.created_at, c.updated_at
         FROM mes_cse_reports c
         ${whereClause}
         ORDER BY c.updated_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      );

      res.json({
        success: true,
        data: listRes.rows,
        pagination: { page, limit, total: parseInt(countRes.rows[0]?.total, 10) || 0 },
      });
    } catch (err) {
      logger.error('MES PreSales: error listing CSE reports', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /cse/:id ───────────────────────────────────────────────────────────
  router.get('/cse/:id', authenticate, async (req, res) => {
    try {
      if (!canAccessCSEWorkflow(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const cseId = parseInt(req.params.id, 10);
      if (!Number.isInteger(cseId) || cseId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid CSE id' });
      }

      const detailRes = await pool.query(
        `SELECT c.*,
           a.test_category, a.test_parameters,
           a.visual_inspection, a.print_quality,
           a.seal_strength_value, a.seal_strength_unit, a.seal_strength_status,
           a.observations AS analysis_observations,
           a.recommendation AS analysis_recommendation,
           a.analyzed_by_name, a.submitted_at AS analysis_submitted_at,
           s.status AS sample_status
         FROM mes_cse_reports c
         LEFT JOIN mes_qc_analyses a ON a.id = c.analysis_id
         LEFT JOIN mes_presales_samples s ON s.id = c.sample_id
         WHERE c.id = $1`,
        [cseId]
      );
      if (detailRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'CSE not found' });
      }

      res.json({ success: true, data: detailRes.rows[0] });
    } catch (err) {
      logger.error('MES PreSales: error loading CSE detail', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /cse/:id/approve ──────────────────────────────────────────────────
  router.post('/cse/:id/approve', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canAccessCSEWorkflow(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const cseId = parseInt(req.params.id, 10);
      if (!Number.isInteger(cseId) || cseId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid CSE id' });
      }

      const notes = req.body?.notes || null;

      await client.query('BEGIN');

      const cseRes = await client.query(`SELECT * FROM mes_cse_reports WHERE id = $1 FOR UPDATE`, [cseId]);
      if (cseRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'CSE not found' });
      }

      const cse = cseRes.rows[0];
      let updateRes;

      if (cse.status === 'pending_qc_manager') {
        if (!canApproveQCStage(req.user)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Only QC manager roles can approve at this stage' });
        }

        updateRes = await client.query(
          `UPDATE mes_cse_reports
           SET qc_manager_status = 'approved', qc_manager_notes = $1,
               qc_manager_user_id = $2, qc_manager_name = $3, qc_manager_acted_at = NOW(),
               status = 'pending_production', sla_due_at = NOW() + INTERVAL '24 hours', updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [notes, req.user?.id || null, actorName(req.user), cseId]
        );

        await logActivity(cse.inquiry_id, 'cse_qc_manager_approved', {
          cse_number: cse.cse_number, cse_id: cse.id,
        }, req.user, client);
      } else if (cse.status === 'pending_production') {
        if (!canApproveProductionStage(req.user)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Only production manager roles can approve at this stage' });
        }

        updateRes = await client.query(
          `UPDATE mes_cse_reports
           SET prod_manager_status = 'approved', prod_manager_notes = $1,
               prod_manager_user_id = $2, prod_manager_name = $3, prod_manager_acted_at = NOW(),
               status = 'approved', final_status = 'approved', completed_at = NOW(), updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [notes, req.user?.id || null, actorName(req.user), cseId]
        );

        await client.query(
          `UPDATE mes_presales_samples SET status = 'approved', updated_at = NOW() WHERE id = $1`,
          [cse.sample_id]
        );

        // Advance inquiry_stage when production manager gives final CSE approval
        await client.query(
          `UPDATE mes_presales_inquiries SET inquiry_stage = 'cse_approved', stage_changed_at = NOW() WHERE id = $1 AND inquiry_stage IN ('cse_pending', 'qc_in_progress')`,
          [cse.inquiry_id]
        );

        await logActivity(cse.inquiry_id, 'cse_production_approved', {
          cse_number: cse.cse_number, cse_id: cse.id,
        }, req.user, client);
      } else {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `CSE cannot be approved from status: ${cse.status}` });
      }

      await insertCSERevision(client, cseId, cse, 'approved', notes, req.user);
      logAudit(pool, 'mes_cse_reports', cseId, 'updated', cse, updateRes.rows[0], req.user);

      await client.query('COMMIT');

      try {
        if (cse.status === 'pending_qc_manager') {
          await notifyRoleUsers(
            ['production_manager', 'manager'],
            {
              type: 'cse_pending_production',
              title: `CSE pending production approval — ${cse.cse_number}`,
              message: `QC stage approved by ${actorName(req.user)}`,
              link: `/mes/qc/cse/${cse.id}`, referenceType: 'cse', referenceId: cse.id,
            },
            { excludeUserIds: [req.user?.id] }
          );
        } else if (cse.status === 'pending_production') {
          // ENH-08: Auto-generate share link on final approval
          let shareUrl = '';
          try {
            const shareToken = crypto.randomBytes(40).toString('hex');
            const shareExpiry = new Date();
            shareExpiry.setDate(shareExpiry.getDate() + 30); // 30-day default expiry
            await pool.query(
              `UPDATE mes_cse_reports
               SET public_token = COALESCE(public_token, $1),
                   public_token_exp = COALESCE(public_token_exp, $2),
                   public_shared_by = COALESCE(public_shared_by, $3),
                   public_shared_at = COALESCE(public_shared_at, NOW())
               WHERE id = $4 AND public_token IS NULL`,
              [shareToken, shareExpiry, req.user?.id || null, cseId]
            );
            // Re-read the token (may be existing if already shared)
            const tokenRow = await pool.query(
              `SELECT public_token FROM mes_cse_reports WHERE id = $1`, [cseId]
            );
            const finalToken = tokenRow.rows[0]?.public_token || shareToken;
            shareUrl = `${process.env.APP_URL || ''}/mes/public/cse/${finalToken}`;
          } catch (shareErr) {
            logger.warn('MES: auto-share token generation failed', shareErr.message);
          }

          const inqOwner = await pool.query(
            `SELECT created_by FROM mes_presales_inquiries WHERE id = $1`, [cse.inquiry_id]
          );
          const ownerId = inqOwner.rows[0]?.created_by || null;
          if (ownerId) {
            await notifyUsers(
              [ownerId],
              {
                type: 'cse_approved',
                title: `CSE approved — ${cse.cse_number}`,
                message: shareUrl
                  ? `Final approval completed by ${actorName(req.user)}. Share link: ${shareUrl}`
                  : `Final approval completed by ${actorName(req.user)}`,
                link: `/mes/qc/cse/${cse.id}`, referenceType: 'cse', referenceId: cse.id,
              },
              { excludeUserIds: [req.user?.id] }
            );
          }
        }
      } catch (notifyErr) {
        logger.warn('MES PreSales: CSE approval notification failed', notifyErr.message);
      }

      // G3/G4: send email for CSE approval events
      try {
        const appUrl = process.env.APP_URL || '';
        if (cse.status === 'pending_qc_manager') {
          // QC manager approved → email production manager
          const prodEmails = await authPool.query(
            `SELECT email FROM users WHERE role IN ('production_manager','manager') AND COALESCE(is_active,TRUE)=TRUE AND email IS NOT NULL`
          );
          const emails = prodEmails.rows.map(r => r.email).filter(Boolean);
          if (emails.length > 0) {
            await sendCriticalEventEmail({
              to: emails,
              eventType: 'cse_qc_approved',
              title: `CSE QC Approved — ${cse.cse_number}`,
              body: `<p>QC Manager <strong>${actorName(req.user)}</strong> has approved the CSE report.</p><p>Production Manager approval is now required.</p>`,
              ctaLabel: 'Review CSE',
              ctaUrl: `${appUrl}/mes/qc/cse/${cse.id}`,
            });
          }
        } else if (cse.status === 'pending_production') {
          // Production approved (final) → email sales rep
          const inqOwner2 = await pool.query(`SELECT created_by FROM mes_presales_inquiries WHERE id = $1`, [cse.inquiry_id]);
          const ownerUserId = inqOwner2.rows[0]?.created_by;
          if (ownerUserId) {
            const ownerEmail = await authPool.query(`SELECT email FROM users WHERE id = $1`, [ownerUserId]);
            const email = ownerEmail.rows[0]?.email;
            if (email) {
              await sendCriticalEventEmail({
                to: email,
                eventType: 'cse_approved',
                title: `CSE Fully Approved — ${cse.cse_number}`,
                body: `<p>The CSE report has received final approval from <strong>${actorName(req.user)}</strong>.</p><p>You may now proceed with estimation and quotation.</p>`,
                ctaLabel: 'View CSE Report',
                ctaUrl: `${appUrl}/mes/qc/cse/${cse.id}`,
                color: '#52c41a',
              });
            }
          }
        }
      } catch (emailErr) {
        logger.warn('MES PreSales: CSE approval email failed', emailErr.message);
      }

      res.json({ success: true, data: updateRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error approving CSE', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /cse/:id/reject ───────────────────────────────────────────────────
  router.post('/cse/:id/reject', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canAccessCSEWorkflow(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const cseId = parseInt(req.params.id, 10);
      if (!Number.isInteger(cseId) || cseId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid CSE id' });
      }

      const notes = req.body?.notes || null;

      await client.query('BEGIN');
      const cseRes = await client.query(`SELECT * FROM mes_cse_reports WHERE id = $1 FOR UPDATE`, [cseId]);
      if (cseRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'CSE not found' });
      }

      const cse = cseRes.rows[0];
      let updateRes;

      if (cse.status === 'pending_qc_manager') {
        if (!canApproveQCStage(req.user)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Only QC manager roles can reject at this stage' });
        }
        updateRes = await client.query(
          `UPDATE mes_cse_reports
           SET qc_manager_status = 'rejected', qc_manager_notes = $1,
               qc_manager_user_id = $2, qc_manager_name = $3, qc_manager_acted_at = NOW(),
               status = 'rejected', final_status = 'rejected', completed_at = NOW(), updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [notes, req.user?.id || null, actorName(req.user), cseId]
        );
      } else if (cse.status === 'pending_production') {
        if (!canApproveProductionStage(req.user)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Only production manager roles can reject at this stage' });
        }
        updateRes = await client.query(
          `UPDATE mes_cse_reports
           SET prod_manager_status = 'rejected', prod_manager_notes = $1,
               prod_manager_user_id = $2, prod_manager_name = $3, prod_manager_acted_at = NOW(),
               status = 'rejected', final_status = 'rejected', completed_at = NOW(), updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [notes, req.user?.id || null, actorName(req.user), cseId]
        );
      } else {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `CSE cannot be rejected from status: ${cse.status}` });
      }

      await client.query(
        `UPDATE mes_presales_samples SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
        [cse.sample_id]
      );

      await logActivity(cse.inquiry_id, 'cse_rejected', {
        cse_number: cse.cse_number, cse_id: cse.id, notes,
      }, req.user, client);

      await insertCSERevision(client, cseId, cse, 'rejected', notes, req.user);
      logAudit(pool, 'mes_cse_reports', cseId, 'updated', cse, updateRes.rows[0], req.user);

      await client.query('COMMIT');

      try {
        if (cse.created_by) {
          await notifyUsers(
            [cse.created_by],
            {
              type: 'cse_rejected',
              title: `CSE rejected — ${cse.cse_number}`,
              message: notes || `Rejected by ${actorName(req.user)}`,
              link: `/mes/qc/cse/${cse.id}`, referenceType: 'cse', referenceId: cse.id,
            },
            { excludeUserIds: [req.user?.id] }
          );
        }
      } catch (notifyErr) {
        logger.warn('MES PreSales: CSE reject notification failed', notifyErr.message);
      }

      // G5: email on CSE rejection
      try {
        if (cse.created_by) {
          const creatorEmail = await authPool.query(`SELECT email FROM users WHERE id = $1`, [cse.created_by]);
          const email = creatorEmail.rows[0]?.email;
          if (email) {
            const appUrl = process.env.APP_URL || '';
            await sendCriticalEventEmail({
              to: email,
              eventType: 'cse_rejected',
              title: `CSE Rejected — ${cse.cse_number}`,
              body: `<p>The CSE report was rejected by <strong>${actorName(req.user)}</strong>.</p>${notes ? `<p><em>Reason: ${notes}</em></p>` : ''}<p>Please review and resubmit if needed.</p>`,
              ctaLabel: 'View CSE Report',
              ctaUrl: `${appUrl}/mes/qc/cse/${cse.id}`,
              color: '#ff4d4f',
            });
          }
        }
      } catch (emailErr) {
        logger.warn('MES PreSales: CSE reject email failed', emailErr.message);
      }

      res.json({ success: true, data: updateRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error rejecting CSE', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /cse/:id/request-revision ─────────────────────────────────────────
  router.post('/cse/:id/request-revision', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canAccessCSEWorkflow(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const cseId = parseInt(req.params.id, 10);
      if (!Number.isInteger(cseId) || cseId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid CSE id' });
      }

      const notes = req.body?.notes || null;

      await client.query('BEGIN');
      const cseRes = await client.query(`SELECT * FROM mes_cse_reports WHERE id = $1 FOR UPDATE`, [cseId]);
      if (cseRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'CSE not found' });
      }

      const cse = cseRes.rows[0];
      let updateRes;

      if (cse.status === 'pending_qc_manager') {
        if (!canApproveQCStage(req.user)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Only QC manager roles can request revision at this stage' });
        }
        updateRes = await client.query(
          `UPDATE mes_cse_reports
           SET qc_manager_status = 'revision_requested', qc_manager_notes = $1,
               qc_manager_user_id = $2, qc_manager_name = $3, qc_manager_acted_at = NOW(),
               status = 'revision_requested', updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [notes, req.user?.id || null, actorName(req.user), cseId]
        );
      } else if (cse.status === 'pending_production') {
        if (!canApproveProductionStage(req.user)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Only production manager roles can request revision at this stage' });
        }
        updateRes = await client.query(
          `UPDATE mes_cse_reports
           SET prod_manager_status = 'revision_requested', prod_manager_notes = $1,
               prod_manager_user_id = $2, prod_manager_name = $3, prod_manager_acted_at = NOW(),
               status = 'revision_requested', updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [notes, req.user?.id || null, actorName(req.user), cseId]
        );
      } else {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `Revision cannot be requested from status: ${cse.status}` });
      }

      await client.query(
        `UPDATE mes_qc_analyses SET status = 'draft', updated_at = NOW() WHERE id = $1`, [cse.analysis_id]
      );
      await client.query(
        `UPDATE mes_presales_samples SET status = 'testing', updated_at = NOW() WHERE id = $1`, [cse.sample_id]
      );

      await logActivity(cse.inquiry_id, 'cse_revision_requested', {
        cse_number: cse.cse_number, cse_id: cse.id, notes,
      }, req.user, client);

      await insertCSERevision(client, cseId, cse, 'revision_requested', notes, req.user);
      logAudit(pool, 'mes_cse_reports', cseId, 'updated', cse, updateRes.rows[0], req.user);

      await client.query('COMMIT');

      try {
        if (cse.created_by) {
          await notifyUsers(
            [cse.created_by],
            {
              type: 'cse_revision_requested',
              title: `CSE revision requested — ${cse.cse_number}`,
              message: notes || `Revision requested by ${actorName(req.user)}`,
              link: `/mes/qc/samples/${cse.sample_id}`, referenceType: 'cse', referenceId: cse.id,
            },
            { excludeUserIds: [req.user?.id] }
          );
        }
      } catch (notifyErr) {
        logger.warn('MES PreSales: CSE revision notification failed', notifyErr.message);
      }

      res.json({ success: true, data: updateRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error requesting CSE revision', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /cse/:id/share ────────────────────────────────────────────────────
  router.post('/cse/:id/share', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const cseId = parseInt(req.params.id, 10);
      const expiryDays = parseInt(req.body?.expiry_days) || 30;
      const token = crypto.randomBytes(40).toString('hex');
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + expiryDays);

      const result = await pool.query(
        `UPDATE mes_cse_reports
         SET public_token = $1, public_token_exp = $2, public_shared_by = $3, public_shared_at = NOW()
         WHERE id = $4
         RETURNING id, cse_number, public_token, public_token_exp`,
        [token, expiry, req.user?.id || null, cseId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'CSE not found' });
      }
      const shareUrl = `${process.env.APP_URL || ''}/mes/public/cse/${token}`;
      res.json({ success: true, data: { ...result.rows[0], share_url: shareUrl } });
    } catch (err) {
      logger.error('MES: error generating CSE share link', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── DELETE /cse/:id/share ──────────────────────────────────────────────────
  router.delete('/cse/:id/share', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      await pool.query(
        `UPDATE mes_cse_reports
         SET public_token = NULL, public_token_exp = NULL, public_shared_by = NULL, public_shared_at = NULL
         WHERE id = $1`,
        [req.params.id]
      );
      res.json({ success: true });
    } catch (err) {
      logger.error('MES: error revoking CSE share link', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /public/cse/:token (NO AUTH) ───────────────────────────────────────
  router.get('/public/cse/:token', async (req, res) => {
    try {
      const { token } = req.params;
      if (!token || token.length < 20) {
        return res.status(400).json({ success: false, error: 'Invalid token' });
      }
      const result = await pool.query(
        `SELECT
           c.id, c.cse_number, c.status, c.overall_result,
           c.customer_name, c.product_group, c.sample_number, c.inquiry_number,
           c.test_summary, c.observations, c.recommendation,
           c.qc_manager_status, c.qc_manager_name,
           c.prod_manager_status, c.prod_manager_name,
           c.analysis_submitted_at, c.completed_at,
           c.public_token_exp,
           a.test_parameters, a.test_category,
           a.observations AS analysis_observations,
           a.recommendation AS analysis_recommendation,
           a.overall_result AS analysis_result,
           a.analyzed_by_name
         FROM mes_cse_reports c
         LEFT JOIN mes_qc_analyses a ON a.id = c.analysis_id
         WHERE c.public_token = $1
           AND (c.public_token_exp IS NULL OR c.public_token_exp > NOW())`,
        [token]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Share link not found or expired' });
      }
      const row = result.rows[0];
      if (!row.test_parameters && row.test_summary?.test_parameters) {
        row.test_parameters = row.test_summary.test_parameters;
      }
      delete row.test_summary;
      res.json({ success: true, data: row });
    } catch (err) {
      logger.error('MES: error serving public CSE', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /cse/:id/comments ──────────────────────────────────────────────────
  router.get('/cse/:id/comments', authenticate, async (req, res) => {
    try {
      const cseId = parseInt(req.params.id, 10);
      if (!Number.isInteger(cseId) || cseId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid CSE id' });
      }
      const result = await pool.query(
        `SELECT c.* FROM mes_cse_comments c
         WHERE c.cse_id = $1 AND ($2 OR c.is_internal = FALSE)
         ORDER BY c.created_at ASC`,
        [cseId, isAdminOrMgmt(req.user)]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES: error fetching CSE comments', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /cse/:id/comments ─────────────────────────────────────────────────
  router.post('/cse/:id/comments', authenticate, async (req, res) => {
    try {
      const cseId = parseInt(req.params.id, 10);
      if (!Number.isInteger(cseId) || cseId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid CSE id' });
      }
      const { comment, is_internal, parent_comment_id } = req.body;
      if (!comment || !comment.trim()) {
        return res.status(400).json({ success: false, error: 'comment is required' });
      }
      const internal = is_internal === true && isAdminOrMgmt(req.user);

      const result = await pool.query(
        `INSERT INTO mes_cse_comments (cse_id, user_id, user_name, user_role, comment, is_internal, parent_comment_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [cseId, req.user?.id || null, actorName(req.user), req.user?.role || null,
         comment.trim(), internal, parent_comment_id || null]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES: error adding CSE comment', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── DELETE /cse/:id/comments/:commentId ────────────────────────────────────
  router.delete('/cse/:id/comments/:commentId', authenticate, async (req, res) => {
    try {
      const { commentId } = req.params;
      const row = await pool.query(`SELECT * FROM mes_cse_comments WHERE id = $1`, [commentId]);
      if (row.rows.length === 0) return res.status(404).json({ success: false, error: 'Comment not found' });
      const c = row.rows[0];
      if (c.user_id !== req.user?.id && !isAdminOrMgmt(req.user)) {
        return res.status(403).json({ success: false, error: 'Cannot delete another user\'s comment' });
      }
      await pool.query(`DELETE FROM mes_cse_comments WHERE id = $1`, [commentId]);
      res.json({ success: true });
    } catch (err) {
      logger.error('MES: error deleting CSE comment', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /cse/:id/revisions ─────────────────────────────────────────────────
  router.get('/cse/:id/revisions', authenticate, async (req, res) => {
    try {
      const cseId = parseInt(req.params.id, 10);
      if (!Number.isInteger(cseId) || cseId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid CSE id' });
      }
      const result = await pool.query(
        `SELECT * FROM mes_cse_revisions WHERE cse_id = $1 ORDER BY created_at ASC`, [cseId]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES: error fetching CSE revisions', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
