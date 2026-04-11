/**
 * Presales QC — inbox, stats, batch-receive, analyses CRUD, submit
 */
const {
  pool, authenticate, logger, logAudit,
  notifyRoleUsers, notifyUsers,
  DIVISION, QC_NOTIFY_ROLES,
  canAccessQCDashboard, normalizeQcOverallResult,
  actorName, logActivity, getInquiryOwner,
} = require('./_helpers');

module.exports = function (router) {

  // ── GET /qc/inbox ──────────────────────────────────────────────────────────
  router.get('/qc/inbox', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const allowedStatuses = ['sent_to_qc', 'received_by_qc', 'testing', 'tested', 'approved', 'rejected'];
      const rawStatuses = (req.query.status || 'sent_to_qc')
        .toString().split(',').map(s => s.trim()).filter(Boolean);
      const statuses = rawStatuses.filter(s => allowedStatuses.includes(s));
      if (statuses.length === 0) {
        return res.status(400).json({ success: false, error: `Invalid status filter. Allowed: ${allowedStatuses.join(', ')}` });
      }

      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const offset = (page - 1) * limit;

      const totalRes = await pool.query(
        `SELECT COUNT(*) AS total FROM mes_presales_samples s
         JOIN mes_presales_inquiries i ON i.id = s.inquiry_id
         WHERE s.status = ANY($1::text[]) AND i.division = $2`,
        [statuses, DIVISION]
      );

      const listRes = await pool.query(
        `SELECT
           s.id, s.sample_number,
           i.id AS inquiry_id, i.inquiry_number, i.customer_name, i.customer_country, i.priority,
           s.product_group, s.sample_type, s.description, s.status,
           s.created_at, s.created_by_name, s.received_at, s.received_by_qc_name,
           CASE WHEN s.status IN ('sent_to_qc','received_by_qc','testing','tested','approved','rejected') THEN s.updated_at ELSE NULL END AS submitted_at,
           COALESCE(att.attachment_count, 0) AS attachment_count,
           NULL::text AS cse_status
         FROM mes_presales_samples s
         JOIN mes_presales_inquiries i ON i.id = s.inquiry_id
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS attachment_count
           FROM inquiry_attachments a
           WHERE a.inquiry_id = s.inquiry_id AND (a.sample_id = s.id OR a.sample_id IS NULL)
         ) att ON TRUE
         WHERE s.status = ANY($1::text[]) AND i.division = $2
         ORDER BY
           CASE i.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
           s.updated_at DESC
         LIMIT $3 OFFSET $4`,
        [statuses, DIVISION, limit, offset]
      );

      res.json({
        success: true,
        data: listRes.rows,
        pagination: { page, limit, total: parseInt(totalRes.rows[0].total, 10) || 0 },
      });
    } catch (err) {
      logger.error('MES PreSales: error fetching QC inbox', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /qc/stats ──────────────────────────────────────────────────────────
  router.get('/qc/stats', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const statsRes = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'sent_to_qc') AS pending_receipt,
           COUNT(*) FILTER (WHERE status = 'received_by_qc') AS received,
           COUNT(*) FILTER (WHERE status = 'testing') AS testing,
           COUNT(*) FILTER (WHERE status IN ('tested','approved','rejected') AND DATE(updated_at) = CURRENT_DATE) AS completed_today,
           COUNT(*) FILTER (WHERE status IN ('tested','approved','rejected') AND updated_at >= NOW() - INTERVAL '7 days') AS completed_this_week
         FROM mes_presales_samples`
      );
      res.json({ success: true, data: statsRes.rows[0] || {} });
    } catch (err) {
      logger.error('MES PreSales: error fetching QC stats', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /qc/batch-receive ─────────────────────────────────────────────────
  router.post('/qc/batch-receive', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const sampleIds = Array.isArray(req.body?.sample_ids)
        ? req.body.sample_ids.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id) && id > 0)
        : [];
      if (sampleIds.length === 0) {
        return res.status(400).json({ success: false, error: 'sample_ids must be a non-empty array of numbers' });
      }

      await client.query('BEGIN');

      const updateRes = await client.query(
        `UPDATE mes_presales_samples
         SET status = 'received_by_qc',
             received_by_qc_user = $1, received_by_qc_name = $2,
             received_at = NOW(), updated_at = NOW()
         WHERE id = ANY($3::int[]) AND status = 'sent_to_qc'
         RETURNING id, inquiry_id, sample_number`,
        [req.user?.id || null, actorName(req.user), sampleIds]
      );

      const byInquiry = updateRes.rows.reduce((acc, s) => {
        if (!acc[s.inquiry_id]) acc[s.inquiry_id] = [];
        acc[s.inquiry_id].push(s.sample_number);
        return acc;
      }, {});

      for (const inquiryId of Object.keys(byInquiry).map(id => parseInt(id, 10))) {
        await logActivity(inquiryId, 'qc_batch_received', {
          sample_count: byInquiry[inquiryId]?.length || 0,
          samples: byInquiry[inquiryId] || [],
        }, req.user, client);

        // Advance inquiry_stage so the sales rep sees "QC Received" on their board
        await client.query(
          `UPDATE mes_presales_inquiries SET inquiry_stage = 'qc_received', stage_changed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND inquiry_stage = 'qc_in_progress'`,
          [inquiryId]
        );
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        data: { received_count: updateRes.rows.length, sample_ids: updateRes.rows.map(r => r.id) },
      });

      // Notify the Sales rep(s) who created each inquiry that QC received their samples
      (async () => {
        try {
          for (const inquiryId of Object.keys(byInquiry).map(id => parseInt(id, 10))) {
            const owner = await getInquiryOwner(inquiryId);
            if (owner?.created_by) {
              await notifyUsers(
                [owner.created_by],
                {
                  type: 'sar_received_by_qc',
                  title: `QC received your samples — ${owner.inquiry_number}`,
                  message: `${byInquiry[inquiryId]?.length || 0} sample(s) received by ${actorName(req.user)}`,
                  link: `/mes/inquiries/${inquiryId}`,
                  referenceType: 'inquiry',
                  referenceId: inquiryId,
                },
              );
            }
          }
        } catch (notifyErr) {
          logger.warn('MES PreSales: QC-receive sales notification failed', notifyErr.message);
        }
      })();
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error in QC batch receive', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /qc/batch-analyses ────────────────────────────────────────────────
  router.post('/qc/batch-analyses', authenticate, async (req, res) => {
    if (!canAccessQCDashboard(req.user)) {
      return res.status(403).json({ success: false, error: 'QC access required' });
    }

    const { sample_ids, test_category = 'physical', test_parameters = [] } = req.body || {};
    const ids = Array.isArray(sample_ids)
      ? sample_ids.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id) && id > 0)
      : [];

    if (ids.length < 2) {
      return res.status(400).json({ success: false, error: 'At least 2 sample_ids required for batch analysis' });
    }
    if (!Array.isArray(test_parameters) || test_parameters.length === 0) {
      return res.status(400).json({ success: false, error: 'test_parameters must be a non-empty array' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sampleRes = await client.query(
        `SELECT s.id, s.sample_number, s.inquiry_id, s.product_group, s.status
         FROM mes_presales_samples s WHERE s.id = ANY($1::int[])`,
        [ids]
      );

      if (sampleRes.rows.length !== ids.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'One or more sample IDs not found' });
      }

      const DIV = process.env.DIVISION || 'FP';
      const analystName = actorName(req.user);
      const created = [];

      for (const sample of sampleRes.rows) {
        const perSampleParams = test_parameters.map(p => ({
          name: p.name || '', spec: p.spec || '',
          result: p.results?.[sample.id] ?? '',
          unit: p.unit || '', method: p.method || '',
          min_value: p.min_value ?? null, max_value: p.max_value ?? null,
          acceptance_formula: p.acceptance_formula || '',
          status: p.results?.[sample.id] ? 'pass' : 'pending',
        }));

        const existingDraft = await client.query(
          `SELECT id FROM mes_qc_analyses WHERE sample_id = $1 AND status = 'draft' ORDER BY created_at DESC LIMIT 1`,
          [sample.id]
        );

        let analysisRow;
        if (existingDraft.rows.length > 0) {
          const upd = await client.query(
            `UPDATE mes_qc_analyses
             SET test_category = $1, test_parameters = $2, analyzed_by = $3, analyzed_by_name = $4, updated_at = NOW()
             WHERE id = $5 RETURNING id`,
            [test_category, JSON.stringify(perSampleParams), req.user?.id || null, analystName, existingDraft.rows[0].id]
          );
          analysisRow = upd.rows[0];
        } else {
          const ins = await client.query(
            `INSERT INTO mes_qc_analyses
               (sample_id, inquiry_id, test_category, test_parameters, analyzed_by, analyzed_by_name, status, division)
             VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7) RETURNING id`,
            [sample.id, sample.inquiry_id, test_category, JSON.stringify(perSampleParams),
             req.user?.id || null, analystName, DIV]
          );
          analysisRow = ins.rows[0];
        }

        created.push({ sample_id: sample.id, sample_number: sample.sample_number, analysis_id: analysisRow.id });
      }

      await client.query('COMMIT');
      res.json({ success: true, data: { created_count: created.length, analyses: created } });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES: error creating batch analyses', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── GET /qc/analyses/:sampleId ─────────────────────────────────────────────
  router.get('/qc/analyses/:sampleId', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const sampleId = parseInt(req.params.sampleId, 10);
      if (!Number.isInteger(sampleId) || sampleId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid sample id' });
      }

      const sampleRes = await pool.query(
        `SELECT s.*, i.inquiry_number, i.customer_name, i.customer_country, i.priority, i.status AS inquiry_status
         FROM mes_presales_samples s
         JOIN mes_presales_inquiries i ON i.id = s.inquiry_id
         WHERE s.id = $1`,
        [sampleId]
      );
      if (sampleRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Sample not found' });
      }

      const sample = sampleRes.rows[0];
      const analysisRes = await pool.query(
        `SELECT * FROM mes_qc_analyses WHERE sample_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [sampleId]
      );
      const attachmentsRes = await pool.query(
        `SELECT id, file_name, file_path, file_size, attachment_type, created_at, sample_id
         FROM inquiry_attachments
         WHERE inquiry_id = $1 AND (sample_id = $2 OR sample_id IS NULL)
         ORDER BY created_at DESC`,
        [sample.inquiry_id, sampleId]
      );

      res.json({
        success: true,
        data: { sample, analysis: analysisRes.rows[0] || null, attachments: attachmentsRes.rows || [] },
      });
    } catch (err) {
      logger.error('MES PreSales: error fetching QC analysis by sample', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /qc/analyses ─────────────────────────────────────────────────────
  router.post('/qc/analyses', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const sampleId = parseInt(req.body?.sample_id, 10);
      if (!Number.isInteger(sampleId) || sampleId <= 0) {
        return res.status(400).json({ success: false, error: 'sample_id is required' });
      }

      const sampleRes = await client.query(
        `SELECT s.id, s.inquiry_id, s.sample_number, i.inquiry_number
         FROM mes_presales_samples s
         JOIN mes_presales_inquiries i ON i.id = s.inquiry_id
         WHERE s.id = $1`,
        [sampleId]
      );
      if (sampleRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Sample not found' });
      }

      const sample = sampleRes.rows[0];
      const {
        test_category = null, test_parameters = [],
        visual_inspection = null, print_quality = null,
        seal_strength_value = null, seal_strength_unit = null, seal_strength_status = null,
        observations = null, overall_result = null, recommendation = null,
      } = req.body;

      const normalizedResult = normalizeQcOverallResult(overall_result);
      if (overall_result && !normalizedResult) {
        return res.status(400).json({ success: false, error: 'overall_result must be pass, fail, or conditional' });
      }

      await client.query('BEGIN');

      const existingDraft = await client.query(
        `SELECT id FROM mes_qc_analyses WHERE sample_id = $1 AND status = 'draft' ORDER BY updated_at DESC LIMIT 1`,
        [sampleId]
      );

      let analysisRow;
      if (existingDraft.rows.length > 0) {
        const updateRes = await client.query(
          `UPDATE mes_qc_analyses
           SET test_category = $1, test_parameters = $2::jsonb,
               visual_inspection = $3, print_quality = $4,
               seal_strength_value = $5, seal_strength_unit = $6, seal_strength_status = $7,
               observations = $8, overall_result = $9, recommendation = $10,
               analyzed_by = $11, analyzed_by_name = $12,
               started_at = COALESCE(started_at, NOW()), updated_at = NOW()
           WHERE id = $13
           RETURNING *`,
          [
            test_category, JSON.stringify(Array.isArray(test_parameters) ? test_parameters : []),
            visual_inspection, print_quality,
            seal_strength_value, seal_strength_unit, seal_strength_status,
            observations, normalizedResult, recommendation,
            req.user?.id || null, actorName(req.user),
            existingDraft.rows[0].id,
          ]
        );
        analysisRow = updateRes.rows[0];
      } else {
        const insertRes = await client.query(
          `INSERT INTO mes_qc_analyses (
             sample_id, inquiry_id, test_category, test_parameters,
             visual_inspection, print_quality,
             seal_strength_value, seal_strength_unit, seal_strength_status,
             observations, overall_result, recommendation,
             status, analyzed_by, analyzed_by_name, started_at
           )
           VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,'draft',$13,$14,NOW())
           RETURNING *`,
          [
            sampleId, sample.inquiry_id, test_category,
            JSON.stringify(Array.isArray(test_parameters) ? test_parameters : []),
            visual_inspection, print_quality,
            seal_strength_value, seal_strength_unit, seal_strength_status,
            observations, normalizedResult, recommendation,
            req.user?.id || null, actorName(req.user),
          ]
        );
        analysisRow = insertRes.rows[0];
      }

      await logActivity(sample.inquiry_id, 'qc_analysis_saved', {
        sample_number: sample.sample_number, analysis_id: analysisRow.id, status: analysisRow.status,
      }, req.user, client);

      await client.query('COMMIT');
      res.json({ success: true, data: analysisRow });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error saving QC analysis draft', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── PATCH /qc/analyses/:id ─────────────────────────────────────────────────
  router.patch('/qc/analyses/:id', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const analysisId = parseInt(req.params.id, 10);
      if (!Number.isInteger(analysisId) || analysisId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid analysis id' });
      }

      const fields = [
        'test_category', 'visual_inspection', 'print_quality',
        'seal_strength_value', 'seal_strength_unit', 'seal_strength_status',
        'observations', 'recommendation',
      ];

      const sets = [];
      const values = [];
      let idx = 1;

      for (const field of fields) {
        if (req.body[field] !== undefined) {
          sets.push(`${field} = $${idx++}`);
          values.push(req.body[field]);
        }
      }

      if (req.body.test_parameters !== undefined) {
        sets.push(`test_parameters = $${idx++}::jsonb`);
        values.push(JSON.stringify(Array.isArray(req.body.test_parameters) ? req.body.test_parameters : []));
      }

      if (req.body.overall_result !== undefined) {
        const nr = normalizeQcOverallResult(req.body.overall_result);
        if (!nr) return res.status(400).json({ success: false, error: 'overall_result must be pass, fail, or conditional' });
        sets.push(`overall_result = $${idx++}`);
        values.push(nr);
      }

      if (sets.length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      sets.push(`analyzed_by = $${idx++}`);
      values.push(req.user?.id || null);
      sets.push(`analyzed_by_name = $${idx++}`);
      values.push(actorName(req.user));
      sets.push(`updated_at = NOW()`);
      values.push(analysisId);

      await client.query('BEGIN');

      const updateRes = await client.query(
        `UPDATE mes_qc_analyses SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (updateRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Analysis not found' });
      }

      const updated = updateRes.rows[0];
      await logActivity(updated.inquiry_id, 'qc_analysis_updated', {
        sample_id: updated.sample_id, analysis_id: updated.id, status: updated.status,
      }, req.user, client);

      await client.query('COMMIT');
      res.json({ success: true, data: updated });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error updating QC analysis', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── POST /qc/analyses/:id/submit ───────────────────────────────────────────
  router.post('/qc/analyses/:id/submit', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const analysisId = parseInt(req.params.id, 10);
      if (!Number.isInteger(analysisId) || analysisId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid analysis id' });
      }

      await client.query('BEGIN');

      const analysisRes = await client.query(
        `SELECT a.*, s.id AS sample_id, s.sample_number, s.inquiry_id
         FROM mes_qc_analyses a
         JOIN mes_presales_samples s ON s.id = a.sample_id
         WHERE a.id = $1 FOR UPDATE`,
        [analysisId]
      );
      if (analysisRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Analysis not found' });
      }

      const current = analysisRes.rows[0];
      const submitResult = req.body.overall_result !== undefined
        ? normalizeQcOverallResult(req.body.overall_result)
        : normalizeQcOverallResult(current.overall_result);

      if (!submitResult) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'overall_result is required for submit' });
      }

      const updatedAnalysisRes = await client.query(
        `UPDATE mes_qc_analyses
         SET test_category = COALESCE($1, test_category),
             test_parameters = COALESCE($2::jsonb, test_parameters),
             visual_inspection = COALESCE($3, visual_inspection),
             print_quality = COALESCE($4, print_quality),
             seal_strength_value = COALESCE($5, seal_strength_value),
             seal_strength_unit = COALESCE($6, seal_strength_unit),
             seal_strength_status = COALESCE($7, seal_strength_status),
             observations = COALESCE($8, observations),
             overall_result = $9,
             recommendation = COALESCE($10, recommendation),
             status = 'submitted',
             analyzed_by = $11, analyzed_by_name = $12,
             submitted_at = NOW(), updated_at = NOW()
         WHERE id = $13
         RETURNING *`,
        [
          req.body.test_category,
          req.body.test_parameters !== undefined
            ? JSON.stringify(Array.isArray(req.body.test_parameters) ? req.body.test_parameters : [])
            : null,
          req.body.visual_inspection, req.body.print_quality,
          req.body.seal_strength_value, req.body.seal_strength_unit, req.body.seal_strength_status,
          req.body.observations, submitResult, req.body.recommendation,
          req.user?.id || null, actorName(req.user), analysisId,
        ]
      );

      const updatedAnalysis = updatedAnalysisRes.rows[0];

      await client.query(
        `UPDATE mes_presales_samples
         SET status = 'tested', qc_result = $1, qc_notes = $2, qc_completed_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [submitResult, updatedAnalysis.observations || null, current.sample_id]
      );

      await logActivity(current.inquiry_id, 'qc_result_submitted', {
        sample_number: current.sample_number, result: submitResult,
        notes: updatedAnalysis.observations || null, analysis_id: updatedAnalysis.id,
      }, req.user, client);

      let cseReport = null;
      const existingCseRes = await client.query(
        `SELECT * FROM mes_cse_reports WHERE analysis_id = $1 LIMIT 1`, [updatedAnalysis.id]
      );

      if (existingCseRes.rows.length > 0) {
        cseReport = existingCseRes.rows[0];
      } else {
        const cseNoRes = await client.query(`SELECT generate_cse_number($1) AS cse_number`, [DIVISION]);
        const cseNumber = cseNoRes.rows[0]?.cse_number;

        const inquiryRes = await client.query(
          `SELECT inquiry_number, customer_name FROM mes_presales_inquiries WHERE id = $1`,
          [current.inquiry_id]
        );
        const inquiry = inquiryRes.rows[0] || {};

        const cseInsertRes = await client.query(
          `INSERT INTO mes_cse_reports (
             cse_number, sample_id, inquiry_id, analysis_id,
             customer_name, product_group, sample_number, inquiry_number,
             test_summary, overall_result, observations, recommendation,
             status, created_by, created_by_name
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,'pending_qc_manager',$13,$14)
           RETURNING *`,
          [
            cseNumber, current.sample_id, current.inquiry_id, updatedAnalysis.id,
            inquiry.customer_name || null, current.product_group || null,
            current.sample_number, inquiry.inquiry_number || null,
            JSON.stringify({
              test_category: updatedAnalysis.test_category,
              test_parameters: updatedAnalysis.test_parameters,
              visual_inspection: updatedAnalysis.visual_inspection,
              print_quality: updatedAnalysis.print_quality,
              seal_strength_value: updatedAnalysis.seal_strength_value,
              seal_strength_unit: updatedAnalysis.seal_strength_unit,
              seal_strength_status: updatedAnalysis.seal_strength_status,
            }),
            submitResult, updatedAnalysis.observations || null,
            updatedAnalysis.recommendation || null,
            req.user?.id || null, actorName(req.user),
          ]
        );

        cseReport = cseInsertRes.rows[0];

        await client.query(
          `UPDATE mes_cse_reports SET sla_due_at = NOW() + INTERVAL '24 hours' WHERE id = $1`,
          [cseReport.id]
        );

        // ── P5-3b: Solvent retention auto-warning ────────────────────────
        // If solvent_retention > 10 mg/m² and product is food-contact, flag safety warning on CSE
        try {
          const testParams = updatedAnalysis.test_parameters;
          if (Array.isArray(testParams)) {
            const solventParam = testParams.find(p =>
              p && typeof p.name === 'string' && /solvent.?retention/i.test(p.name)
            );
            if (solventParam) {
              const solventValue = parseFloat(solventParam.value || solventParam.result || 0);
              // Check if food-contact (from inquiry product details or product_group)
              const inquiryFoodRes = await client.query(
                `SELECT product_details FROM mes_presales_inquiries WHERE id = $1`, [current.inquiry_id]
              );
              const prodDetails = inquiryFoodRes.rows[0]?.product_details;
              const isFoodContact = prodDetails && typeof prodDetails === 'object'
                ? (prodDetails.food_contact === true || prodDetails.application === 'food' ||
                   /food/i.test(prodDetails.end_use || '') || /food/i.test(prodDetails.application || ''))
                : false;

              if (solventValue > 10) {
                await client.query(
                  `UPDATE mes_cse_reports SET has_safety_warning = TRUE,
                   observations = COALESCE(observations, '') || E'\n⚠️ SOLVENT RETENTION WARNING: ' || $1 || ' mg/m² (limit: 10 mg/m²)' || CASE WHEN $2 THEN ' — FOOD CONTACT PRODUCT' ELSE '' END
                   WHERE id = $3`,
                  [String(solventValue), isFoodContact, cseReport.id]
                );
                cseReport.has_safety_warning = true;
                logger.info(`QC: Solvent retention warning flagged on CSE ${cseReport.cse_number}: ${solventValue} mg/m²`);
              }
            }
          }
        } catch (solventErr) {
          logger.warn('QC: Solvent retention check failed (non-fatal)', solventErr.message);
        }

        await logActivity(current.inquiry_id, 'cse_generated', {
          sample_number: current.sample_number, cse_number: cseReport.cse_number, cse_id: cseReport.id,
        }, req.user, client);
      }

      // Advance inquiry_stage to cse_pending when CSE is generated
      await client.query(
        `UPDATE mes_presales_inquiries SET inquiry_stage = 'cse_pending', stage_changed_at = NOW() WHERE id = $1 AND inquiry_stage IN ('qc_in_progress', 'qc_received', 'sar_pending')`,
        [current.inquiry_id]
      );

      const pendingSamples = await client.query(
        `SELECT COUNT(*) AS count FROM mes_presales_samples
         WHERE inquiry_id = $1 AND status NOT IN ('tested','approved','rejected')`,
        [current.inquiry_id]
      );
      if (parseInt(pendingSamples.rows[0].count, 10) === 0) {
        await client.query(
          `UPDATE mes_presales_inquiries SET presales_phase = 'clearance' WHERE id = $1 AND presales_phase = 'sample_qc'`,
          [current.inquiry_id]
        );
      }

      await client.query('COMMIT');

      try {
        await notifyRoleUsers(
          QC_NOTIFY_ROLES,
          {
            type: 'cse_pending_approval',
            title: `CSE ready for QC review — ${cseReport.cse_number}`,
            message: `Sample ${current.sample_number} submitted by ${actorName(req.user)}`,
            link: `/mes/qc/cse/${cseReport.id}`,
            referenceType: 'cse', referenceId: cseReport.id,
          },
          { excludeUserIds: [req.user?.id] }
        );
      } catch (notifyErr) {
        logger.warn('MES PreSales: CSE QC-approval notification failed', notifyErr.message);
      }

      // Notify the Sales rep who created the inquiry that QC testing is complete
      try {
        const owner = await getInquiryOwner(current.inquiry_id);
        if (owner?.created_by) {
          await notifyUsers(
            [owner.created_by],
            {
              type: 'qc_testing_complete',
              title: `QC testing complete — ${current.sample_number}`,
              message: `Sample tested by ${actorName(req.user)}. CSE report: ${cseReport.cse_number}`,
              link: `/mes/inquiries/${current.inquiry_id}`,
              referenceType: 'inquiry',
              referenceId: current.inquiry_id,
            },
          );
        }
      } catch (notifyErr) {
        logger.warn('MES PreSales: QC-complete sales notification failed', notifyErr.message);
      }

      res.json({ success: true, data: { analysis: updatedAnalysis, cse: cseReport } });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error submitting QC analysis', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

};
