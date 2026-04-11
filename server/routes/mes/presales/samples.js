/**
 * Presales Samples — registration, status, QC submission/recall, result, scan
 */
const {
  pool, authenticate, logger,
  notifyQCSamplesReceived, notifyRoleUsers,
  DIVISION, QC_NOTIFY_ROLES,
  checkInquiryOwnership, canAccessQCDashboard, isAdminOrMgmt,
  actorName, logActivity,
} = require('./_helpers');

module.exports = function (router) {

  // ── POST /inquiries/:id/samples ────────────────────────────────────────────
  router.post('/inquiries/:id/samples', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const {
        product_group, description = null, sample_type = 'physical',
      } = req.body;

      if (!product_group) {
        return res.status(400).json({ success: false, error: 'product_group is required' });
      }

      const inq = await client.query(
        'SELECT id, inquiry_number, customer_name FROM mes_presales_inquiries WHERE id = $1 AND division = $2',
        [id, DIVISION]
      );
      if (inq.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }

      const canAccess = await checkInquiryOwnership(req.user, id);
      if (!canAccess) {
        client.release();
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      await client.query('BEGIN');

      const numRes = await client.query(`SELECT generate_sample_number($1) AS num`, [DIVISION]);
      const sampleNumber = numRes.rows[0].num;

      const insertRes = await client.query(
        `INSERT INTO mes_presales_samples (
          inquiry_id, sample_number, product_group, customer_name,
          description, sample_type,
          created_by, created_by_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          id, sampleNumber, product_group, inq.rows[0].customer_name,
          description, sample_type,
          req.user?.id || null, actorName(req.user),
        ]
      );

      await client.query('COMMIT');

      logActivity(parseInt(id), 'sample_registered', {
        sample_number: sampleNumber, product_group, sample_type,
      }, req.user);

      logger.info(`MES PreSales: sample ${sampleNumber} registered for inquiry #${id}`);
      res.status(201).json({ success: true, data: insertRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error registering sample', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── GET /inquiries/:id/samples ─────────────────────────────────────────────
  router.get('/inquiries/:id/samples', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const canAccess = await checkInquiryOwnership(req.user, id);
      if (!canAccess) return res.status(403).json({ success: false, error: 'Access denied' });
      const result = await pool.query(
        `SELECT * FROM mes_presales_samples WHERE inquiry_id = $1 ORDER BY created_at DESC`, [id]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES PreSales: error listing samples', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── DELETE /samples/:sampleId ──────────────────────────────────────────────
  router.delete('/samples/:sampleId', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { sampleId } = req.params;

      const sampleRes = await client.query(
        'SELECT s.*, i.division FROM mes_presales_samples s JOIN mes_presales_inquiries i ON i.id = s.inquiry_id WHERE s.id = $1',
        [sampleId]
      );
      if (sampleRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Sample not found' });
      }
      const sample = sampleRes.rows[0];
      if (sample.division !== DIVISION) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Sample not found' });
      }

      const canAccess = await checkInquiryOwnership(req.user, sample.inquiry_id);
      if (!canAccess) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      if (sample.status !== 'registered') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Can only delete samples that have not been submitted to QC yet' });
      }

      await client.query('DELETE FROM inquiry_attachments WHERE sample_id = $1', [sampleId]);
      await client.query('DELETE FROM mes_presales_samples WHERE id = $1', [sampleId]);

      // Clean up any pending notifications for this deleted sample
      await client.query(
        `DELETE FROM mes_notifications
         WHERE (reference_type = 'sample' AND reference_id::text = $1::text)
            OR (type IN ('lab_result_pending', 'sla_breach') AND message ILIKE $2)`,
        [sampleId, `%${sample.sample_number}%`]
      ).catch(() => {});

      await client.query(
        `INSERT INTO mes_presales_activity_log (inquiry_id, user_id, action, details)
         VALUES ($1, $2, 'sample_deleted', $3)`,
        [sample.inquiry_id, req.user.id, JSON.stringify({ sample_number: sample.sample_number, product_group: sample.product_group })]
      );

      await client.query('COMMIT');
      res.json({ success: true, message: 'Sample deleted' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error deleting sample', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── PATCH /samples/:sampleId/status ────────────────────────────────────────
  router.patch('/samples/:sampleId/status', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const sampleId = parseInt(req.params.sampleId, 10);
      if (isNaN(sampleId)) {
        return res.status(400).json({ success: false, error: 'Invalid sample ID' });
      }
      const { status } = req.body;

      const VALID = ['registered', 'sent_to_qc', 'received_by_qc', 'testing', 'tested', 'approved', 'rejected'];
      if (!VALID.includes(status)) {
        return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID.join(', ')}` });
      }

      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT * FROM mes_presales_samples WHERE id = $1 FOR UPDATE', [sampleId]
      );
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Sample not found' });
      }

      const sample = existing.rows[0];
      const oldStatus = sample.status;

      const params = [status, sampleId];
      let extra = '';
      if (status === 'received_by_qc') {
        extra = `, received_by_qc_user = $3, received_by_qc_name = $4, received_at = NOW()`;
        params.push(req.user?.id || null, actorName(req.user));
      } else if (status === 'sent_to_qc') {
        extra = `, sent_to_qc_at = NOW()`;
      } else if (status === 'testing') {
        extra = `, qc_started_at = NOW()`;
      } else if (['tested', 'approved', 'rejected'].includes(status)) {
        extra = `, qc_completed_at = NOW()`;
      }

      const updated = await client.query(
        `UPDATE mes_presales_samples SET status = $1 ${extra} WHERE id = $2 RETURNING *`, params
      );

      // H-002: SLA deadlines
      const SLA_HOURS = { sent_to_qc: 4, received_by_qc: 24, testing: 24 };
      if (SLA_HOURS[status]) {
        await client.query(
          `UPDATE mes_presales_samples
           SET sla_due_at = NOW() + ($1 || ' hours')::INTERVAL, sla_stage = $2
           WHERE id = $3`,
          [SLA_HOURS[status], status, sampleId]
        );
      } else {
        await client.query(
          `UPDATE mes_presales_samples SET sla_due_at = NULL, sla_stage = NULL WHERE id = $1`,
          [sampleId]
        );
      }

      await client.query(
        `INSERT INTO mes_presales_activity_log (inquiry_id, user_id, action, details)
         VALUES ($1, $2, 'sample_status_changed', $3)`,
        [sample.inquiry_id, req.user?.id, JSON.stringify({ sample_number: sample.sample_number, from: oldStatus, to: status })]
      );

      await client.query('COMMIT');

      logActivity(sample.inquiry_id, 'sample_status_changed', {
        sample_number: sample.sample_number, from: oldStatus, to: status,
      }, req.user);

      if (status === 'sent_to_qc') {
        pool.query(`UPDATE mes_presales_inquiries SET presales_phase = 'sample_qc', inquiry_stage = 'qc_in_progress', stage_changed_at = NOW() WHERE id = $1 AND presales_phase = 'inquiry'`, [sample.inquiry_id]).catch(() => {});
        // Notifications are NOT sent here — they fire only from the batch /submit-to-qc endpoint
        // to avoid duplicate email + in-app notifications when individual samples are patched.
      }

      res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('MES PreSales: error updating sample status', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /inquiries/:id/submit-to-qc ──────────────────────────────────────
  router.post('/inquiries/:id/submit-to-qc', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const inq = await client.query(
        `SELECT * FROM mes_presales_inquiries WHERE id = $1 AND division = $2`, [id, DIVISION]
      );
      if (inq.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }

      const registeredSamples = await client.query(
        `SELECT * FROM mes_presales_samples WHERE inquiry_id = $1 AND status = 'registered'`, [id]
      );
      if (registeredSamples.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'No registered samples to submit. Register at least one sample first.' });
      }

      await client.query('BEGIN');

      await client.query(
        `UPDATE mes_presales_samples SET status = 'sent_to_qc', sent_to_qc_at = NOW() WHERE inquiry_id = $1 AND status = 'registered'`, [id]
      );
      await client.query(
        `UPDATE mes_presales_inquiries
         SET status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END,
             presales_phase = 'sample_qc',
             inquiry_stage = 'qc_in_progress',
             stage_changed_at = NOW()
         WHERE id = $1`, [id]
      );

      await client.query('COMMIT');

      logActivity(parseInt(id), 'submitted_to_qc', {
        sample_count: registeredSamples.rows.length,
        samples: registeredSamples.rows.map(s => s.sample_number),
      }, req.user);

      (async () => {
        try {
          const allSamples = await pool.query(
            `SELECT * FROM mes_presales_samples WHERE inquiry_id = $1 AND status = 'sent_to_qc'`, [id]
          );
          const allAttachments = await pool.query(
            'SELECT * FROM inquiry_attachments WHERE inquiry_id = $1', [id]
          );
          await notifyQCSamplesReceived({
            inquiry: inq.rows[0], samples: allSamples.rows, attachments: allAttachments.rows,
            senderName: actorName(req.user),
            appUrl: process.env.APP_URL || `${req.protocol}://${req.get('host')}`,
          });

          await notifyRoleUsers(
            QC_NOTIFY_ROLES,
            {
              type: 'sar_submitted',
              title: `New SAR submitted — ${inq.rows[0]?.inquiry_number}`,
              message: `${allSamples.rows.length} sample(s) sent to QC by ${actorName(req.user)}`,
              link: '/mes/qc', referenceType: 'inquiry', referenceId: parseInt(id, 10),
            },
            { excludeUserIds: [req.user?.id] }
          );
        } catch (emailErr) {
          logger.error('MES PreSales: failed to send QC notifications on batch submit', emailErr);
        }
      })();

      logger.info(`MES PreSales: ${registeredSamples.rows.length} samples batch-submitted to QC for inquiry #${id}`);
      res.json({ success: true, data: { submitted_count: registeredSamples.rows.length } });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error batch-submitting to QC', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /inquiries/:id/recall ─────────────────────────────────────────────
  router.post('/inquiries/:id/recall', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const advancedCount = await client.query(
        `SELECT COUNT(*) FROM mes_presales_samples
         WHERE inquiry_id = $1 AND status NOT IN ('registered', 'sent_to_qc')`, [id]
      );
      if (parseInt(advancedCount.rows[0].count, 10) > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot recall — QC has already started processing some samples. Contact QC Lab to coordinate.',
        });
      }

      await client.query('BEGIN');

      const recalled = await client.query(
        `UPDATE mes_presales_samples SET status = 'registered'
         WHERE inquiry_id = $1 AND status = 'sent_to_qc' RETURNING *`, [id]
      );

      await client.query(
        `UPDATE mes_presales_inquiries SET presales_phase = 'inquiry', inquiry_stage = 'sar_pending', stage_changed_at = NOW() WHERE id = $1`, [id]
      );

      await client.query('COMMIT');

      logActivity(parseInt(id), 'samples_recalled', {
        sample_count: recalled.rows.length,
        samples: recalled.rows.map(s => s.sample_number),
      }, req.user);

      // Notify QC roles that samples have been recalled
      try {
        const inqRes = await pool.query(
          `SELECT inquiry_number FROM mes_presales_inquiries WHERE id = $1`, [id]
        );
        const inqNumber = inqRes.rows[0]?.inquiry_number || `#${id}`;
        await notifyRoleUsers(
          QC_NOTIFY_ROLES,
          {
            type: 'samples_recalled',
            title: `Samples recalled — ${inqNumber}`,
            message: `${recalled.rows.length} sample(s) recalled from QC by ${actorName(req.user)}`,
            link: '/mes/qc', referenceType: 'inquiry', referenceId: parseInt(id, 10),
          },
          { excludeUserIds: [req.user?.id] }
        );
      } catch (notifyErr) {
        logger.warn('MES PreSales: recall notification failed', notifyErr.message);
      }

      logger.info(`MES PreSales: ${recalled.rows.length} samples recalled from QC for inquiry #${id}`);
      res.json({ success: true, data: { recalled_count: recalled.rows.length } });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error recalling samples', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── PATCH /samples/:sampleId/qc-result (DEPRECATED — use QC analysis → CSE flow instead) ──
  router.patch('/samples/:sampleId/qc-result', authenticate, async (req, res) => {
    if (!canAccessQCDashboard(req.user)) {
      return res.status(403).json({ success: false, error: 'QC role required' });
    }

    // Guard: this legacy endpoint bypasses the analysis → CSE → approval chain.
    // Require admin role to use it; normal QC workflow should go through /qc/analyses/:id/submit.
    if (!isAdminOrMgmt(req.user)) {
      logger.warn(`MES PreSales: legacy qc-result endpoint blocked for user ${req.user?.id} (role: ${req.user?.role}). Use /qc/analyses/:id/submit instead.`);
      return res.status(403).json({
        success: false,
        error: 'Direct QC result submission is deprecated. Please use the full analysis form which generates a CSE report.',
      });
    }
    logger.warn(`MES PreSales: legacy qc-result endpoint used by admin ${req.user?.id} for sample ${req.params.sampleId}`);

    try {
      const { sampleId } = req.params;
      const { qc_result, qc_notes } = req.body;

      if (!['pass', 'fail', 'conditional'].includes(qc_result)) {
        return res.status(400).json({ success: false, error: 'qc_result must be pass, fail, or conditional' });
      }

      const existing = await pool.query('SELECT * FROM mes_presales_samples WHERE id = $1', [sampleId]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Sample not found' });
      }

      const sample = existing.rows[0];
      const newStatus = qc_result === 'pass' ? 'approved' : qc_result === 'fail' ? 'rejected' : 'tested';

      const updated = await pool.query(
        `UPDATE mes_presales_samples
         SET qc_result = $1, qc_notes = $2, status = $3, qc_completed_at = NOW()
         WHERE id = $4 RETURNING *`,
        [qc_result, qc_notes || null, newStatus, sampleId]
      );

      logActivity(sample.inquiry_id, 'qc_result_submitted', {
        sample_number: sample.sample_number, result: qc_result, notes: qc_notes,
      }, req.user);

      if (['approved', 'rejected', 'tested'].includes(newStatus)) {
        const pendingSamples = await pool.query(
          `SELECT COUNT(*) FROM mes_presales_samples
           WHERE inquiry_id = $1 AND status NOT IN ('approved','rejected','tested')`,
          [sample.inquiry_id]
        );
        if (parseInt(pendingSamples.rows[0].count, 10) === 0) {
          pool.query(
            `UPDATE mes_presales_inquiries SET presales_phase = 'clearance' WHERE id = $1 AND presales_phase = 'sample_qc'`,
            [sample.inquiry_id]
          ).catch(() => {});
        }
      }

      res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
      logger.error('MES PreSales: error submitting QC result', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /samples/by-number/:sampleNumber ───────────────────────────────────
  router.get('/samples/by-number/:sampleNumber', authenticate, async (req, res) => {
    try {
      const { sampleNumber } = req.params;
      const result = await pool.query(
        `SELECT s.*, i.inquiry_number, i.status AS inquiry_status,
                i.product_groups, i.customer_country, i.notes AS inquiry_notes
         FROM mes_presales_samples s
         JOIN mes_presales_inquiries i ON i.id = s.inquiry_id
         WHERE s.sample_number = $1`,
        [sampleNumber]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Sample not found' });
      }

      const sample = result.rows[0];
      const tdsRes = await pool.query(
        `SELECT * FROM inquiry_attachments
         WHERE inquiry_id = $1 AND attachment_type IN ('tds', 'specification')
         ORDER BY created_at DESC`,
        [sample.inquiry_id]
      );

      res.json({ success: true, data: { sample, tds_attachments: tdsRes.rows } });
    } catch (err) {
      logger.error('MES PreSales: error looking up sample by number', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /samples/:sampleId/disposition ───────────────────────────────────
  // P5-3d: Set sample disposition (retain / return / dispose)
  router.patch('/samples/:sampleId/disposition', authenticate, async (req, res) => {
    if (!canAccessQCDashboard(req.user)) {
      return res.status(403).json({ success: false, error: 'QC role required' });
    }
    try {
      const { sampleId } = req.params;
      const { disposition } = req.body;

      const VALID_DISPOSITIONS = ['retain', 'return', 'dispose'];
      if (!VALID_DISPOSITIONS.includes(disposition)) {
        return res.status(400).json({ success: false, error: `disposition must be one of: ${VALID_DISPOSITIONS.join(', ')}` });
      }

      const existing = await pool.query('SELECT * FROM mes_presales_samples WHERE id = $1', [sampleId]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Sample not found' });
      }

      const updated = await pool.query(
        `UPDATE mes_presales_samples SET disposition = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [disposition, sampleId]
      );

      logActivity(existing.rows[0].inquiry_id, 'sample_disposition_set', {
        sample_number: existing.rows[0].sample_number, disposition,
      }, req.user);

      res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
      logger.error('MES PreSales: error setting sample disposition', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
