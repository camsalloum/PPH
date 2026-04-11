/**
 * Presales QC — submit analysis + auto-CSE generation + notifications
 * Split from qc.js for ≤300 line enforcement (Phase 6)
 */
const {
  pool, authenticate, logger,
  notifyRoleUsers, notifyUsers,
  DIVISION, QC_NOTIFY_ROLES,
  canAccessQCDashboard, normalizeQcOverallResult,
  actorName, logActivity, getInquiryOwner,
} = require('./_helpers');

module.exports = function (router) {

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
        try {
          const testParams = updatedAnalysis.test_parameters;
          if (Array.isArray(testParams)) {
            const solventParam = testParams.find(p =>
              p && typeof p.name === 'string' && /solvent.?retention/i.test(p.name)
            );
            if (solventParam) {
              const solventValue = parseFloat(solventParam.value || solventParam.result || 0);
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
