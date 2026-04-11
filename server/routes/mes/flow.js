/**
 * MES Workflow Flow Engine — Routes
 *
 * Handles the phase-to-phase handoff mechanism for jobs moving through
 * the 17-phase manufacturing workflow.
 *
 * Routes:
 *   POST   /jobs                          — Create a new job (from inquiry or standalone)
 *   GET    /jobs                          — List jobs (filtered by dept, phase, status)
 *   GET    /jobs/:id                      — Full job detail (tracker + all phases + activity log)
 *   POST   /jobs/:id/advance              — Advance job to next phase (handoff to next dept)
 *   POST   /jobs/:id/phases/:phase/complete — Mark a specific phase as complete
 *   POST   /jobs/:id/phases/:phase/assign   — Assign phase to specific user/dept
 *   PATCH  /jobs/:id/status               — Change overall job status (on_hold, cancel, resume)
 *   POST   /jobs/:id/comment              — Add a comment to the activity log
 *   POST   /jobs/:id/attachments          — Upload attachment for a phase
 *   GET    /jobs/:id/attachments          — List attachments
 *   GET    /jobs/:id/activity             — Get activity log
 *   GET    /phases                        — List all 17 phases (reference)
 *   GET    /dashboard                     — Dept-level dashboard (my tasks, counts per phase)
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const logger = require('../../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const DIVISION = 'FP';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Role → department mapping (extend as needed)
const ROLE_DEPT_MAP = {
  admin:             null,   // admin sees everything
  manager:           null,
  sales_manager:     'sales',
  sales_coordinator: 'sales',
  sales_rep:         'sales',
  quality_control:   'qc',
  qc_manager:        'qc',
  qc_lab:            'qc',
  qc_inspector:      'qc',
  rd_engineer:       'qc',
  lab_technician:    'qc',
  prepress_manager:  'prepress',
  prepress_designer: 'prepress',
  estimation:        'estimation',
  procurement:       'procurement',
  production_manager:'production',
  production_planner:'production',
  production_op:     'production',
  production_operator:'production',
  operator:          'production',
  ink_head:          'inkhead',
  maintenance:       'maintenance',
  accounts_manager:  'accounts',
  accountant:        'accounts',
  accounts:          'accounts',
  logistics_manager: 'logistics',
  stores_keeper:     'logistics',
  store_keeper:      'logistics',
  warehouse_manager: 'logistics',
  logistics:         'logistics',
};

const isAdminOrMgmt = (user) =>
  ['admin', 'manager', 'sales_manager', 'sales_coordinator'].includes(user?.role);

const getUserDept = (user) => ROLE_DEPT_MAP[user?.role] || null;

// ── Multer setup for attachments ─────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../../uploads/mes-attachments');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname);
    cb(null, `mes-${uniqueSuffix}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /pdf|doc|docx|xls|xlsx|csv|png|jpg|jpeg|gif|svg|webp|eml|msg|zip|rar|tif|tiff|ai|eps|psd/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    cb(null, allowed.test(ext));
  },
});


// ═════════════════════════════════════════════════════════════════════════════
// GET /phases — reference list
// ═════════════════════════════════════════════════════════════════════════════
router.get('/phases', authenticate, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM mes_workflow_phases ORDER BY phase_number`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('MES Flow: error fetching phases', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// POST /jobs — Create a new job
// ═════════════════════════════════════════════════════════════════════════════
router.post('/jobs', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      inquiry_id,
      prospect_id,
      customer_name,
      customer_country,
      priority = 'normal',
      assigned_group_id,
      assigned_group_name,
    } = req.body;

    if (!customer_name) {
      return res.status(400).json({ success: false, error: 'customer_name is required' });
    }

    // Generate job number
    const numRes = await client.query(`SELECT generate_job_number($1) AS num`, [DIVISION]);
    const jobNumber = numRes.rows[0].num;

    // Resolve department assignment
    let groupId = assigned_group_id || null;
    let groupName = assigned_group_name || null;
    if (!isAdminOrMgmt(req.user) && !groupId) {
      // Sales rep: auto-assign to their group
      const repRes = await pool.query(
        `SELECT srg.id, srg.group_name
         FROM sales_rep_group_members srgm
         JOIN sales_rep_groups srg ON srg.id = srgm.group_id
         WHERE srgm.user_id = $1 LIMIT 1`,
        [req.user.id]
      );
      if (repRes.rows.length > 0) {
        groupId = repRes.rows[0].id;
        groupName = repRes.rows[0].group_name;
      }
    }

    // Insert tracker
    const jobRes = await client.query(
      `INSERT INTO mes_job_tracker
         (job_number, division, inquiry_id, prospect_id, customer_name, customer_country,
          current_phase, overall_status, assigned_dept, assigned_group_id, assigned_group_name, priority)
       VALUES ($1,$2,$3,$4,$5,$6, 1, 'active', 'sales', $7, $8, $9)
       RETURNING *`,
      [
        jobNumber, DIVISION,
        inquiry_id || null,
        prospect_id || null,
        customer_name,
        customer_country || null,
        groupId, groupName,
        priority,
      ]
    );
    const job = jobRes.rows[0];

    // Create phase records for all 17 phases (pending) + activate phase 1
    const phaseRes = await client.query(
      `SELECT phase_number, departments FROM mes_workflow_phases ORDER BY phase_number`
    );
    for (const phase of phaseRes.rows) {
      const isFirst = phase.phase_number === 1;
      await client.query(
        `INSERT INTO mes_job_phases (job_id, phase_number, status, owned_by_dept, started_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          job.id,
          phase.phase_number,
          isFirst ? 'active' : 'pending',
          isFirst ? phase.departments[0] : null,
          isFirst ? new Date() : null,
        ]
      );
    }

    // Initial activity log entry
    await client.query(
      `INSERT INTO mes_job_activity_log (job_id, phase_number, action, to_dept, performed_by_id, performed_by, details)
       VALUES ($1, 1, 'job_created', 'sales', $2, $3, $4)`,
      [job.id, req.user.id, req.user.name || req.user.email, `Job ${jobNumber} created`]
    );

    // Link back to inquiry if provided
    if (inquiry_id) {
      await client.query(
        `UPDATE mes_presales_inquiries SET converted_to_so = $1 WHERE id = $2`,
        [jobNumber, inquiry_id]
      );
    }

    await client.query('COMMIT');
    logger.info(`MES Flow: job created ${jobNumber} (id=${job.id})`);
    res.status(201).json({ success: true, data: job });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES Flow: error creating job', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// GET /jobs — List jobs
// ═════════════════════════════════════════════════════════════════════════════
router.get('/jobs', authenticate, async (req, res) => {
  try {
    const { status, phase, dept, priority, search, page = 1, limit = 50 } = req.query;

    let where = [`j.division = $1`];
    const params = [DIVISION];
    let idx = 2;

    // Non-admin: scope to own department's active phases
    const userDept = getUserDept(req.user);
    if (!isAdminOrMgmt(req.user) && userDept) {
      where.push(`EXISTS (
        SELECT 1 FROM mes_job_phases jp
        WHERE jp.job_id = j.id AND jp.owned_by_dept = $${idx} AND jp.status IN ('active','awaiting_input')
      )`);
      params.push(userDept);
      idx++;
    }

    if (status) { where.push(`j.overall_status = $${idx}`); params.push(status); idx++; }
    if (phase)  { where.push(`j.current_phase = $${idx}`);  params.push(Number(phase)); idx++; }
    if (dept)   { where.push(`j.assigned_dept = $${idx}`);  params.push(dept); idx++; }
    if (priority) { where.push(`j.priority = $${idx}`);     params.push(priority); idx++; }
    if (search) {
      where.push(`(j.job_number ILIKE $${idx} OR j.customer_name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const offset = (Number(page) - 1) * Number(limit);

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM mes_job_tracker j WHERE ${where.join(' AND ')}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    params.push(Number(limit), offset);
    const dataRes = await pool.query(
      `SELECT j.*,
              wp.phase_name AS current_phase_name,
              wp.departments AS current_phase_depts
       FROM mes_job_tracker j
       LEFT JOIN mes_workflow_phases wp ON wp.phase_number = j.current_phase
       WHERE ${where.join(' AND ')}
       ORDER BY j.priority = 'high' DESC, j.updated_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    res.json({
      success: true,
      data: dataRes.rows,
      pagination: { page: Number(page), limit: Number(limit), total },
    });
  } catch (err) {
    logger.error('MES Flow: error listing jobs', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// GET /jobs/:id — Full job detail
// ═════════════════════════════════════════════════════════════════════════════
router.get('/jobs/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const jobRes = await pool.query(
      `SELECT j.*, wp.phase_name AS current_phase_name
       FROM mes_job_tracker j
       LEFT JOIN mes_workflow_phases wp ON wp.phase_number = j.current_phase
       WHERE j.id = $1 AND j.division = $2`,
      [id, DIVISION]
    );
    if (jobRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const phasesRes = await pool.query(
      `SELECT jp.*, wp.phase_name, wp.stage, wp.departments, wp.is_quality_gate
       FROM mes_job_phases jp
       JOIN mes_workflow_phases wp ON wp.phase_number = jp.phase_number
       WHERE jp.job_id = $1
       ORDER BY jp.phase_number`,
      [id]
    );

    // Recent activity (last 50)
    const activityRes = await pool.query(
      `SELECT al.*, wp.phase_name
       FROM mes_job_activity_log al
       LEFT JOIN mes_workflow_phases wp ON wp.phase_number = al.phase_number
       WHERE al.job_id = $1
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [id]
    );

    // Attachments
    const attachRes = await pool.query(
      `SELECT a.*, wp.phase_name
       FROM mes_job_attachments a
       LEFT JOIN mes_workflow_phases wp ON wp.phase_number = a.phase_number
       WHERE a.job_id = $1
       ORDER BY a.created_at DESC`,
      [id]
    );

    // Available transitions from current phase
    const transRes = await pool.query(
      `SELECT pt.*, wp.phase_name AS to_phase_name, wp.departments AS to_phase_depts
       FROM mes_phase_transitions pt
       JOIN mes_workflow_phases wp ON wp.phase_number = pt.to_phase
       WHERE pt.from_phase = $1`,
      [jobRes.rows[0].current_phase]
    );

    res.json({
      success: true,
      data: {
        job: jobRes.rows[0],
        phases: phasesRes.rows,
        activity: activityRes.rows,
        attachments: attachRes.rows,
        available_transitions: transRes.rows,
      },
    });
  } catch (err) {
    logger.error('MES Flow: error fetching job', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// POST /jobs/:id/advance — Advance to next phase (handoff)
//   body: { to_phase, notes?, handoff_message? }
// ═════════════════════════════════════════════════════════════════════════════
router.post('/jobs/:id/advance', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { to_phase, notes, handoff_message } = req.body;

    // Get job
    const jobRes = await client.query(
      `SELECT * FROM mes_job_tracker WHERE id = $1 AND division = $2 FOR UPDATE`,
      [id, DIVISION]
    );
    if (jobRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    const job = jobRes.rows[0];

    if (job.overall_status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: `Job is ${job.overall_status}, cannot advance` });
    }

    // Validate transition is allowed
    const transRes = await client.query(
      `SELECT * FROM mes_phase_transitions WHERE from_phase = $1 AND to_phase = $2`,
      [job.current_phase, to_phase]
    );
    if (transRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `Transition from phase ${job.current_phase} to ${to_phase} is not allowed`,
      });
    }
    const transition = transRes.rows[0];

    // For parallel_join: check ALL incoming phases are complete
    if (transition.transition_type === 'parallel_join') {
      const allIncoming = await client.query(
        `SELECT pt.from_phase, jp.status
         FROM mes_phase_transitions pt
         JOIN mes_job_phases jp ON jp.job_id = $1 AND jp.phase_number = pt.from_phase
         WHERE pt.to_phase = $2 AND pt.transition_type = 'parallel_join'`,
        [id, to_phase]
      );
      const incomplete = allIncoming.rows.filter(r => r.status !== 'completed');
      if (incomplete.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Cannot advance: phases ${incomplete.map(r => r.from_phase).join(', ')} must complete first (parallel join)`,
        });
      }
    }

    // Complete current phase
    await client.query(
      `UPDATE mes_job_phases SET status = 'completed', completed_at = NOW(), completed_by = $3, notes = COALESCE($4, notes)
       WHERE job_id = $1 AND phase_number = $2`,
      [id, job.current_phase, req.user.name || req.user.email, notes]
    );

    // Get target phase info
    const targetPhaseRes = await client.query(
      `SELECT * FROM mes_workflow_phases WHERE phase_number = $1`,
      [to_phase]
    );
    const targetPhase = targetPhaseRes.rows[0];
    const targetDept = targetPhase.departments[0]; // primary department

    // For parallel_fork: activate BOTH parallel phases
    if (transition.transition_type === 'parallel_fork') {
      const forkTargets = await client.query(
        `SELECT pt.to_phase, wp.departments
         FROM mes_phase_transitions pt
         JOIN mes_workflow_phases wp ON wp.phase_number = pt.to_phase
         WHERE pt.from_phase = $1 AND pt.transition_type = 'parallel_fork'`,
        [job.current_phase]
      );
      for (const ft of forkTargets.rows) {
        await client.query(
          `UPDATE mes_job_phases SET status = 'active', owned_by_dept = $3, started_at = NOW()
           WHERE job_id = $1 AND phase_number = $2`,
          [id, ft.to_phase, ft.departments[0]]
        );
        await client.query(
          `INSERT INTO mes_job_activity_log (job_id, phase_number, action, from_dept, to_dept, performed_by_id, performed_by, details)
           VALUES ($1, $2, 'phase_started', $3, $4, $5, $6, $7)`,
          [id, ft.to_phase, job.assigned_dept, ft.departments[0], req.user.id, req.user.name || req.user.email,
           `Parallel phase ${ft.to_phase} started`]
        );
      }
      // Update job tracker to show the first parallel phase
      await client.query(
        `UPDATE mes_job_tracker SET current_phase = $2, assigned_dept = $3, updated_at = NOW()
         WHERE id = $1`,
        [id, forkTargets.rows[0].to_phase, forkTargets.rows[0].departments[0]]
      );
    } else {
      // Normal advance: activate target phase
      await client.query(
        `UPDATE mes_job_phases SET status = 'active', owned_by_dept = $3, started_at = NOW()
         WHERE job_id = $1 AND phase_number = $2`,
        [id, to_phase, targetDept]
      );

      // Update job tracker
      await client.query(
        `UPDATE mes_job_tracker SET current_phase = $2, assigned_dept = $3, updated_at = NOW()
         WHERE id = $1`,
        [id, to_phase, targetDept]
      );
    }

    // Activity log: handoff
    await client.query(
      `INSERT INTO mes_job_activity_log
         (job_id, phase_number, action, from_dept, to_dept, from_status, to_status, performed_by_id, performed_by, details)
       VALUES ($1, $2, 'handoff', $3, $4, $5, $6, $7, $8, $9)`,
      [
        id, to_phase,
        job.assigned_dept, targetDept,
        `phase_${job.current_phase}`, `phase_${to_phase}`,
        req.user.id, req.user.name || req.user.email,
        handoff_message || `Handed off from phase ${job.current_phase} to phase ${to_phase}`,
      ]
    );

    // ── P5-2b: Sync inquiry_stage from MES phase advance ────────────────
    // If this job is linked to a presales inquiry, keep inquiry_stage in sync.
    // Dispatch phase (17) → ready_dispatch; earlier phases → in_production.
    if (job.inquiry_id) {
      const DISPATCH_PHASE = 17;
      const newStage = to_phase >= DISPATCH_PHASE ? 'ready_dispatch' : 'in_production';
      try {
        await client.query(
          `UPDATE mes_presales_inquiries
           SET inquiry_stage = $1, stage_changed_at = NOW(), updated_at = NOW()
           WHERE id = $2 AND inquiry_stage IN ('in_production', 'ready_dispatch', 'order_confirmed')`,
          [newStage, job.inquiry_id]
        );
        // Best-effort deal sync
        try {
          const { syncDealFromInquiry } = require('../services/dealSyncService');
          await syncDealFromInquiry(job.inquiry_id, newStage, client);
        } catch (syncErr) {
          logger.warn(`MES Flow: deal sync failed for inquiry ${job.inquiry_id}`, syncErr.message);
        }
      } catch (stageErr) {
        logger.warn(`MES Flow: inquiry_stage sync failed for inquiry ${job.inquiry_id}`, stageErr.message);
      }
    }

    await client.query('COMMIT');

    // Fetch updated job
    const updated = await pool.query(
      `SELECT j.*, wp.phase_name AS current_phase_name
       FROM mes_job_tracker j
       LEFT JOIN mes_workflow_phases wp ON wp.phase_number = j.current_phase
       WHERE j.id = $1`,
      [id]
    );

    // ── P5-2c: Notify sales rep on each production phase advance ────────
    if (job.inquiry_id) {
      try {
        const { notifyUsers } = require('../services/notificationService');
        const ownerRes = await pool.query(
          `SELECT created_by FROM mes_presales_inquiries WHERE id = $1`, [job.inquiry_id]
        );
        const ownerId = ownerRes.rows[0]?.created_by;
        if (ownerId) {
          await notifyUsers([ownerId], {
            type: 'production_phase_advance',
            title: `Production update — ${job.job_number}`,
            message: `Advanced to phase ${to_phase}: ${targetPhase.phase_name}`,
            link: `/mes/flow/jobs/${id}`,
            referenceType: 'job',
            referenceId: id,
          });
        }
      } catch (notifyErr) {
        logger.warn('MES Flow: sales rep advance notification failed', notifyErr.message);
      }
    }

    logger.info(`MES Flow: job ${job.job_number} advanced from phase ${job.current_phase} to ${to_phase}`);
    res.json({ success: true, data: updated.rows[0], message: `Advanced to: ${targetPhase.phase_name}` });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES Flow: error advancing job', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// POST /jobs/:id/phases/:phase/complete — Mark a specific phase complete
//   (Used for parallel phases where each dept completes independently)
// ═════════════════════════════════════════════════════════════════════════════
router.post('/jobs/:id/phases/:phase/complete', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id, phase } = req.params;
    const { notes } = req.body;
    const phaseNum = Number(phase);

    const phaseRes = await client.query(
      `SELECT * FROM mes_job_phases WHERE job_id = $1 AND phase_number = $2 FOR UPDATE`,
      [id, phaseNum]
    );
    if (phaseRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Phase not found' });
    }
    if (phaseRes.rows[0].status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Phase already completed' });
    }

    await client.query(
      `UPDATE mes_job_phases SET status = 'completed', completed_at = NOW(), completed_by = $3, notes = COALESCE($4, notes)
       WHERE job_id = $1 AND phase_number = $2`,
      [id, phaseNum, req.user.name || req.user.email, notes]
    );

    await client.query(
      `INSERT INTO mes_job_activity_log (job_id, phase_number, action, performed_by_id, performed_by, details)
       VALUES ($1, $2, 'phase_completed', $3, $4, $5)`,
      [id, phaseNum, req.user.id, req.user.name || req.user.email, notes || `Phase ${phaseNum} completed`]
    );

    // Check if this enables any parallel_join transitions
    const joinCheck = await client.query(
      `SELECT pt.to_phase
       FROM mes_phase_transitions pt
       WHERE pt.from_phase = $1 AND pt.transition_type = 'parallel_join'`,
      [phaseNum]
    );
    let canAdvance = null;
    for (const jc of joinCheck.rows) {
      const allIncoming = await client.query(
        `SELECT pt.from_phase, jp.status
         FROM mes_phase_transitions pt
         JOIN mes_job_phases jp ON jp.job_id = $1 AND jp.phase_number = pt.from_phase
         WHERE pt.to_phase = $2 AND pt.transition_type = 'parallel_join'`,
        [id, jc.to_phase]
      );
      if (allIncoming.rows.every(r => r.status === 'completed')) {
        canAdvance = jc.to_phase;
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Phase ${phaseNum} completed`,
      can_advance_to: canAdvance, // frontend can auto-trigger advance if this is set
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES Flow: error completing phase', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// POST /jobs/:id/phases/:phase/assign — Assign phase to user/dept
// ═════════════════════════════════════════════════════════════════════════════
router.post('/jobs/:id/phases/:phase/assign', authenticate, async (req, res) => {
  try {
    const { id, phase } = req.params;
    const { user_id, user_name, dept } = req.body;

    await pool.query(
      `UPDATE mes_job_phases
       SET assigned_to_user_id = $3, assigned_to_name = $4, owned_by_dept = COALESCE($5, owned_by_dept)
       WHERE job_id = $1 AND phase_number = $2`,
      [id, Number(phase), user_id || null, user_name || null, dept || null]
    );

    await pool.query(
      `INSERT INTO mes_job_activity_log (job_id, phase_number, action, to_dept, performed_by_id, performed_by, details)
       VALUES ($1, $2, 'assigned', $3, $4, $5, $6)`,
      [id, Number(phase), dept, req.user.id, req.user.name || req.user.email,
       `Assigned to ${user_name || dept || 'unassigned'}`]
    );

    res.json({ success: true, message: 'Phase assigned' });
  } catch (err) {
    logger.error('MES Flow: error assigning phase', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// PATCH /jobs/:id/status — Change overall status
// ═════════════════════════════════════════════════════════════════════════════
router.patch('/jobs/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const VALID = ['active', 'on_hold', 'completed', 'cancelled'];
    if (!VALID.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be: ${VALID.join(', ')}` });
    }

    const updated = await pool.query(
      `UPDATE mes_job_tracker
       SET overall_status = $2,
           completed_at = CASE WHEN $2 IN ('completed','cancelled') THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE id = $1 AND division = $3
       RETURNING *`,
      [id, status, DIVISION]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    await pool.query(
      `INSERT INTO mes_job_activity_log (job_id, action, from_status, to_status, performed_by_id, performed_by, details)
       VALUES ($1, 'status_change', $2, $3, $4, $5, $6)`,
      [id, updated.rows[0].overall_status, status, req.user.id, req.user.name || req.user.email, reason || `Status changed to ${status}`]
    );

    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    logger.error('MES Flow: error updating job status', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// POST /jobs/:id/comment — Add comment to activity log
// ═════════════════════════════════════════════════════════════════════════════
router.post('/jobs/:id/comment', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { phase_number, comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, error: 'Comment is required' });
    }

    await pool.query(
      `INSERT INTO mes_job_activity_log (job_id, phase_number, action, performed_by_id, performed_by, details)
       VALUES ($1, $2, 'comment', $3, $4, $5)`,
      [id, phase_number || null, req.user.id, req.user.name || req.user.email, comment.trim()]
    );

    res.json({ success: true, message: 'Comment added' });
  } catch (err) {
    logger.error('MES Flow: error adding comment', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// POST /jobs/:id/attachments — Upload file
// ═════════════════════════════════════════════════════════════════════════════
router.post('/jobs/:id/attachments', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { phase_number, attachment_type = 'document', description } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const result = await pool.query(
      `INSERT INTO mes_job_attachments
         (job_id, phase_number, file_name, file_path, file_size, mime_type, attachment_type, description, uploaded_by_id, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        id,
        phase_number || null,
        req.file.originalname,
        `/uploads/mes-attachments/${req.file.filename}`,
        req.file.size,
        req.file.mimetype,
        attachment_type,
        description || null,
        req.user.id,
        req.user.name || req.user.email,
      ]
    );

    // Activity log
    await pool.query(
      `INSERT INTO mes_job_activity_log (job_id, phase_number, action, performed_by_id, performed_by, details, metadata)
       VALUES ($1, $2, 'attachment_added', $3, $4, $5, $6)`,
      [
        id, phase_number || null,
        req.user.id, req.user.name || req.user.email,
        `${attachment_type}: ${req.file.originalname}`,
        JSON.stringify({ attachment_id: result.rows[0].id, file_name: req.file.originalname }),
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('MES Flow: error uploading attachment', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// GET /jobs/:id/attachments — List attachments
// ═════════════════════════════════════════════════════════════════════════════
router.get('/jobs/:id/attachments', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT a.*, wp.phase_name
       FROM mes_job_attachments a
       LEFT JOIN mes_workflow_phases wp ON wp.phase_number = a.phase_number
       WHERE a.job_id = $1
       ORDER BY a.created_at DESC`,
      [id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('MES Flow: error listing attachments', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// GET /jobs/:id/activity — Activity log
// ═════════════════════════════════════════════════════════════════════════════
router.get('/jobs/:id/activity', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100 } = req.query;

    const result = await pool.query(
      `SELECT al.*, wp.phase_name
       FROM mes_job_activity_log al
       LEFT JOIN mes_workflow_phases wp ON wp.phase_number = al.phase_number
       WHERE al.job_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2`,
      [id, Number(limit)]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('MES Flow: error fetching activity log', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// GET /dashboard — Department dashboard
//   Returns: my active tasks, counts per phase, counts per status
// ═════════════════════════════════════════════════════════════════════════════
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const userDept = getUserDept(req.user);
    const showAll = isAdminOrMgmt(req.user);

    // Active jobs per phase
    let phaseCountQuery, phaseCountParams;
    if (showAll) {
      phaseCountQuery = `
        SELECT jp.phase_number, wp.phase_name, wp.stage, jp.status, COUNT(*) AS count
        FROM mes_job_phases jp
        JOIN mes_workflow_phases wp ON wp.phase_number = jp.phase_number
        JOIN mes_job_tracker j ON j.id = jp.job_id AND j.division = $1 AND j.overall_status = 'active'
        WHERE jp.status IN ('active','awaiting_input')
        GROUP BY jp.phase_number, wp.phase_name, wp.stage, jp.status
        ORDER BY jp.phase_number`;
      phaseCountParams = [DIVISION];
    } else {
      phaseCountQuery = `
        SELECT jp.phase_number, wp.phase_name, wp.stage, jp.status, COUNT(*) AS count
        FROM mes_job_phases jp
        JOIN mes_workflow_phases wp ON wp.phase_number = jp.phase_number
        JOIN mes_job_tracker j ON j.id = jp.job_id AND j.division = $1 AND j.overall_status = 'active'
        WHERE jp.status IN ('active','awaiting_input') AND jp.owned_by_dept = $2
        GROUP BY jp.phase_number, wp.phase_name, wp.stage, jp.status
        ORDER BY jp.phase_number`;
      phaseCountParams = [DIVISION, userDept];
    }

    const phaseCounts = await pool.query(phaseCountQuery, phaseCountParams);

    // Overall job stats
    const statsRes = await pool.query(
      `SELECT overall_status, COUNT(*) AS count
       FROM mes_job_tracker WHERE division = $1
       GROUP BY overall_status`,
      [DIVISION]
    );

    // My recent tasks (active phases assigned to my dept)
    let myTasksQuery, myTasksParams;
    if (showAll) {
      myTasksQuery = `
        SELECT jp.*, j.job_number, j.customer_name, j.priority, wp.phase_name, wp.departments
        FROM mes_job_phases jp
        JOIN mes_job_tracker j ON j.id = jp.job_id AND j.division = $1 AND j.overall_status = 'active'
        JOIN mes_workflow_phases wp ON wp.phase_number = jp.phase_number
        WHERE jp.status IN ('active','awaiting_input')
        ORDER BY j.priority = 'high' DESC, jp.started_at ASC
        LIMIT 50`;
      myTasksParams = [DIVISION];
    } else {
      myTasksQuery = `
        SELECT jp.*, j.job_number, j.customer_name, j.priority, wp.phase_name, wp.departments
        FROM mes_job_phases jp
        JOIN mes_job_tracker j ON j.id = jp.job_id AND j.division = $1 AND j.overall_status = 'active'
        JOIN mes_workflow_phases wp ON wp.phase_number = jp.phase_number
        WHERE jp.status IN ('active','awaiting_input') AND jp.owned_by_dept = $2
        ORDER BY j.priority = 'high' DESC, jp.started_at ASC
        LIMIT 50`;
      myTasksParams = [DIVISION, userDept];
    }

    const myTasks = await pool.query(myTasksQuery, myTasksParams);

    res.json({
      success: true,
      data: {
        phase_counts: phaseCounts.rows,
        job_stats: statsRes.rows.reduce((acc, r) => { acc[r.overall_status] = parseInt(r.count, 10); return acc; }, {}),
        my_tasks: myTasks.rows,
        user_dept: userDept,
      },
    });
  } catch (err) {
    logger.error('MES Flow: error fetching dashboard', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


module.exports = router;
