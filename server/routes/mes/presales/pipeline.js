/**
 * Presales Pipeline — "My Pipeline" view for sales reps & managers
 * Lifecycle stage tracking, action-required flags, stage stats
 */
const {
  pool, authenticate, logger,
  DIVISION,
  isAdminOrMgmt, getSalesRepGroup,
  canAccessQCDashboard,
  actorName, logActivity,
} = require('./_helpers');

// ── Stage metadata (order, labels, color hints) ─────────────────────────────
const STAGES = [
  { key: 'new_inquiry',      label: 'New Inquiry',          group: 'action',     order: 0  },
  { key: 'sar_pending',      label: 'SAR Pending',          group: 'waiting',    order: 1  },
  { key: 'qc_in_progress',   label: 'QC In Progress',       group: 'waiting',    order: 2  },
  { key: 'qc_received',      label: 'QC Received',          group: 'waiting',    order: 2.5 },
  { key: 'cse_pending',      label: 'CSE Pending',          group: 'waiting',    order: 3  },
  { key: 'cse_approved',     label: 'CSE Approved',         group: 'action',     order: 4  },
  { key: 'estimation',       label: 'Estimation',           group: 'action',     order: 5  },
  { key: 'quoted',           label: 'Quoted',               group: 'in_progress', order: 6  },
  { key: 'negotiating',      label: 'Negotiating',          group: 'in_progress', order: 7  },
  { key: 'price_accepted',   label: 'Price Accepted',       group: 'action',     order: 8  },
  { key: 'preprod_sample',   label: 'Pre-prod Sample',      group: 'in_progress', order: 9  },
  { key: 'preprod_sent',     label: 'Sample Sent',          group: 'in_progress', order: 10 },
  { key: 'sample_approved',  label: 'Sample Approved',      group: 'action',     order: 11 },
  { key: 'pi_sent',          label: 'PI Sent',              group: 'in_progress', order: 12 },
  { key: 'order_confirmed',  label: 'Order Confirmed',      group: 'completed',  order: 13 },
  { key: 'in_production',    label: 'In Production',        group: 'in_progress', order: 14 },
  { key: 'ready_dispatch',   label: 'Ready for Dispatch',   group: 'action',     order: 15 },
  { key: 'delivered',        label: 'Delivered',            group: 'completed',  order: 16 },
  { key: 'closed',           label: 'Closed',              group: 'completed',  order: 17 },
  { key: 'lost',             label: 'Lost',                group: 'completed',  order: 18 },
  { key: 'on_hold',          label: 'On Hold',             group: 'in_progress', order: 19 },
];

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

// Stages where sales rep needs to take action
const ACTION_STAGES = STAGES.filter(s => s.group === 'action').map(s => s.key);

// Map each inquiry_stage to its correct kanban status (BUG-11 fix)
const STAGE_TO_STATUS = {
  new_inquiry:     'new',
  sar_pending:     'in_progress',
  qc_in_progress:  'in_progress',
  qc_received:     'in_progress',
  cse_pending:     'in_progress',
  cse_approved:    'in_progress',
  estimation:      'in_progress',
  quoted:          'in_progress',
  negotiating:     'in_progress',
  price_accepted:  'in_progress',
  preprod_sample:  'in_progress',
  preprod_sent:    'in_progress',
  sample_approved: 'in_progress',
  pi_sent:         'in_progress',
  order_confirmed: 'converted',
  in_production:   'converted',
  ready_dispatch:  'converted',
  delivered:       'converted',
  closed:          'converted',
  lost:            'lost',
  on_hold:         'on_hold',
};

// Valid manual transitions (from → allowed targets)
// 'lost' and 'on_hold' are allowed from every active (non-terminal) stage
const MANUAL_TRANSITIONS = {
  new_inquiry:     ['sar_pending', 'estimation', 'lost', 'on_hold'],
  sar_pending:     ['new_inquiry', 'lost', 'on_hold'],
  cse_approved:    ['estimation', 'lost', 'on_hold'],
  estimation:      ['quoted', 'lost', 'on_hold'],
  quoted:          ['negotiating', 'price_accepted', 'lost', 'on_hold'],
  negotiating:     ['price_accepted', 'lost', 'on_hold'],
  price_accepted:  ['preprod_sample', 'pi_sent', 'lost', 'on_hold'],
  preprod_sample:  ['lost', 'on_hold'],
  preprod_sent:    ['sample_approved', 'lost', 'on_hold'],
  sample_approved: ['pi_sent', 'lost', 'on_hold'],
  pi_sent:         ['order_confirmed', 'lost', 'on_hold'],
  order_confirmed: ['in_production', 'lost', 'on_hold'],
  in_production:   ['ready_dispatch', 'lost', 'on_hold'],
  ready_dispatch:  ['delivered', 'lost', 'on_hold'],
  delivered:       ['closed'],
  on_hold:         ['new_inquiry', 'sar_pending', 'estimation', 'quoted', 'negotiating'],
};

module.exports = function (router) {

  // ── GET /pipeline ──────────────────────────────────────────────────────────
  // Returns all active inquiries for the user's scope, with stage info & action flags
  router.get('/pipeline', authenticate, async (req, res) => {
    try {
      const user = req.user;
      const isAdmin = isAdminOrMgmt(user);
      const isQC = canAccessQCDashboard(user);

      // Determine scope filter
      let scopeCondition = '';
      const params = [DIVISION];
      let idx = 2;

      if (!isAdmin && !isQC) {
        const group = await getSalesRepGroup(user.id);
        if (!group) {
          return res.json({ success: true, data: [], stages: STAGES, stats: {} });
        }
        scopeCondition = `AND i.sales_rep_group_id = $${idx++}`;
        params.push(group.groupId);
      }

      // Optional stage filter
      const stageFilter = req.query.stage;
      let stageCondition = '';
      if (stageFilter) {
        const stages = stageFilter.split(',').map(s => s.trim()).filter(Boolean);
        if (stages.length > 0) {
          stageCondition = `AND i.inquiry_stage = ANY($${idx++}::text[])`;
          params.push(stages);
        }
      }

      // Exclude closed/lost/delivered by default unless ?include_closed=true
      let closedCondition = '';
      if (req.query.include_closed !== 'true') {
        closedCondition = `AND COALESCE(i.inquiry_stage, 'sar_pending') NOT IN ('closed', 'delivered')`;
      }

      const result = await pool.query(
        `SELECT
           i.id, i.inquiry_number, i.customer_name, i.customer_country,
           i.priority, i.status, i.presales_phase,
           COALESCE(i.inquiry_stage, 'sar_pending') AS inquiry_stage,
           i.product_groups, i.sales_rep_group_name,
           i.created_at, i.updated_at,
           -- Latest activity
           (SELECT action FROM mes_presales_activity_log
            WHERE inquiry_id = i.id ORDER BY created_at DESC LIMIT 1) AS last_action,
           (SELECT created_at FROM mes_presales_activity_log
            WHERE inquiry_id = i.id ORDER BY created_at DESC LIMIT 1) AS last_activity_at,
           -- Sample counts
           COALESCE(sc.total_samples, 0) AS total_samples,
           COALESCE(sc.tested_samples, 0) AS tested_samples,
           -- CSE counts
           COALESCE(cc.total_cse, 0) AS total_cse,
           COALESCE(cc.approved_cse, 0) AS approved_cse,
           -- Quotation info
           q.id AS quotation_id, q.quotation_number, q.status AS quotation_status,
           q.total_price AS quotation_amount,
           -- Days in current stage (uses stage_changed_at, falls back to updated_at)
           EXTRACT(DAY FROM NOW() - COALESCE(i.stage_changed_at, i.updated_at))::int AS days_in_stage
         FROM mes_presales_inquiries i
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS total_samples,
                  COUNT(*) FILTER (WHERE status IN ('tested','approved','rejected')) AS tested_samples
           FROM mes_presales_samples WHERE inquiry_id = i.id
         ) sc ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS total_cse,
                  COUNT(*) FILTER (WHERE final_status = 'approved') AS approved_cse
           FROM mes_cse_reports WHERE inquiry_id = i.id
         ) cc ON TRUE
         LEFT JOIN LATERAL (
           SELECT id, quotation_number, status, total_price
           FROM mes_quotations WHERE inquiry_id = i.id
           ORDER BY created_at DESC LIMIT 1
         ) q ON TRUE
         WHERE i.division = $1
           AND i.deleted_at IS NULL
           ${scopeCondition}
           ${stageCondition}
           ${closedCondition}
         ORDER BY
           CASE i.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
           i.updated_at DESC`,
        params
      );

      // Compute action_required flag for each inquiry
      const data = result.rows.map(row => ({
        ...row,
        stage_meta: STAGE_MAP[row.inquiry_stage] || { label: row.inquiry_stage, group: 'in_progress', order: 99 },
        action_required: ACTION_STAGES.includes(row.inquiry_stage),
      }));

      res.json({ success: true, data, stages: STAGES });
    } catch (err) {
      logger.error('MES Pipeline: error fetching pipeline', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /pipeline/stats ────────────────────────────────────────────────────
  // Summary counts per stage
  router.get('/pipeline/stats', authenticate, async (req, res) => {
    try {
      const user = req.user;
      const isAdmin = isAdminOrMgmt(user);
      const isQC = canAccessQCDashboard(user);

      let scopeCondition = '';
      const params = [DIVISION];
      let idx = 2;

      if (!isAdmin && !isQC) {
        const group = await getSalesRepGroup(user.id);
        if (!group) {
          return res.json({ success: true, data: { stages: {}, total: 0, action_required: 0 } });
        }
        scopeCondition = `AND i.sales_rep_group_id = $${idx++}`;
        params.push(group.groupId);
      }

      const result = await pool.query(
        `SELECT
           COALESCE(i.inquiry_stage, 'sar_pending') AS stage,
           COUNT(*) AS count
         FROM mes_presales_inquiries i
         WHERE i.division = $1
           AND i.deleted_at IS NULL
           AND COALESCE(i.inquiry_stage, 'sar_pending') NOT IN ('closed', 'delivered')
           ${scopeCondition}
         GROUP BY COALESCE(i.inquiry_stage, 'sar_pending')
         ORDER BY COUNT(*) DESC`,
        params
      );

      const stages = {};
      let total = 0;
      let actionRequired = 0;
      for (const row of result.rows) {
        const count = parseInt(row.count, 10);
        stages[row.stage] = count;
        total += count;
        if (ACTION_STAGES.includes(row.stage)) actionRequired += count;
      }

      res.json({ success: true, data: { stages, total, action_required: actionRequired } });
    } catch (err) {
      logger.error('MES Pipeline: error fetching stats', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /pipeline/:id/stage ──────────────────────────────────────────────
  // Manual stage advancement for stages that aren't auto-advanced (estimation, quoted, etc.)
  router.patch('/pipeline/:id/stage', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const inquiryId = parseInt(req.params.id, 10);
      const { stage, notes } = req.body;

      if (!stage) {
        return res.status(400).json({ success: false, error: 'stage is required' });
      }
      if (!STAGE_MAP[stage]) {
        return res.status(400).json({ success: false, error: `Invalid stage: ${stage}` });
      }

      await client.query('BEGIN');

      const inqRes = await client.query(
        `SELECT id, inquiry_number, inquiry_stage, status FROM mes_presales_inquiries WHERE id = $1 AND division = $2 FOR UPDATE`,
        [inquiryId, DIVISION]
      );
      if (inqRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }

      const inquiry = inqRes.rows[0];
      const currentStage = inquiry.inquiry_stage || 'sar_pending';

      // Validate transition
      const allowed = MANUAL_TRANSITIONS[currentStage];
      if (!allowed || !allowed.includes(stage)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Cannot transition from "${currentStage}" to "${stage}". Allowed: ${(allowed || []).join(', ') || 'none (auto-managed stage)'}`,
        });
      }

      // Guard: cannot move to 'lost' if there are active quotations
      if (stage === 'lost') {
        const activeQuots = await client.query(
          `SELECT COUNT(*) FROM mes_quotations WHERE inquiry_id = $1 AND status NOT IN ('rejected', 'lost', 'cancelled')`,
          [inquiryId]
        );
        if (parseInt(activeQuots.rows[0].count) > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: `Cannot mark as lost — there are ${activeQuots.rows[0].count} active quotation(s). Cancel or reject them first.`,
          });
        }
      }

      // Auto-sync status to match the new stage (BUG-11 fix)
      const derivedStatus = STAGE_TO_STATUS[stage] || 'in_progress';
      await client.query(
        `UPDATE mes_presales_inquiries
         SET inquiry_stage = $1, stage_changed_at = NOW(), status = $3, updated_at = NOW()
         WHERE id = $2`,
        [stage, inquiryId, derivedStatus]
      );

      await logActivity(inquiryId, 'stage_changed', {
        from: currentStage,
        to: stage,
        notes: notes || null,
      }, req.user, client);

      await client.query('COMMIT');

      logger.info(`MES Pipeline: inquiry #${inquiry.inquiry_number} stage ${currentStage} → ${stage} by ${actorName(req.user)}`);
      res.json({ success: true, data: { inquiry_id: inquiryId, from: currentStage, to: stage } });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES Pipeline: error advancing stage', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ── GET /pipeline/stages ───────────────────────────────────────────────────
  // Returns stage metadata (for frontend rendering)
  router.get('/pipeline/stages', authenticate, (req, res) => {
    res.json({ success: true, data: STAGES });
  });
};
