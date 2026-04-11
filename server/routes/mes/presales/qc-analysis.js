/**
 * Presales QC — analysis CRUD (batch-analyses, GET/POST/PATCH analyses)
 * Split from qc.js for ≤300 line enforcement (Phase 6)
 */
const {
  pool, authenticate, logger,
  DIVISION,
  canAccessQCDashboard, normalizeQcOverallResult,
  actorName, logActivity,
} = require('./_helpers');

module.exports = function (router) {

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

};
