/**
 * MES QC Incoming Raw Material Routes
 * Base path: /api/mes/qc
 */

const express = require('express');
const router = express.Router();

const { pool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const { queryLimiter, generalLimiter } = require('../../middleware/rateLimiter');
const requireAnyRole = require('../../middleware/requireAnyRole');
const logger = require('../../utils/logger');
const {
  notifyNewRMReceived,
  notifyRMAssigned,
  notifyRMVerdict,
  notifyKFTrendAlert,
  notifyCalibrationDue,
  notifyCertificateIssued,
} = require('../../services/rmNotificationService');
const { issueCertificateForIncoming } = require('../../services/qcCertificateService');

const VALID_DIVISIONS = ['FP']; // HC division retired — FP only
const SENIOR_LEVEL = 6;
const SENIOR_MANAGEMENT_ROLES = ['manager', 'sales_manager', 'sales_coordinator'];

const RAW_MATERIALS_VIEW_ROLES = [
  'admin',
  'manager',
  'production_manager',
  'production_planner',
  'quality_control',
  'qc_manager',
  'qc_lab',
  'rd_engineer',
  'lab_technician',
  'procurement',
  'logistics_manager',
  'stores_keeper',
  'store_keeper',
  'warehouse_manager',
  'operator',
  'production_operator',
  'production_op',
];

const OPERATOR_DOCK_ROLES = ['operator', 'production_operator', 'stores_keeper', 'store_keeper'];
const QC_TESTING_ROLES = ['quality_control', 'qc_manager', 'qc_lab', 'lab_technician', 'rd_engineer'];
const PRODUCTION_REGRIND_ROLES = ['production_manager', 'production_planner', 'production_operator', 'production_op', 'operator'];
const QC_VERDICT_ROLES = ['qc_manager', 'admin'];
const PARAMETER_ADMIN_ROLES = ['admin', 'qc_manager'];
const SUPPLIER_TIER_VIEW_ROLES = ['admin', 'manager', 'procurement', ...QC_TESTING_ROLES];
const SUPPLIER_QUALITY_ROLES = ['admin', 'manager', 'procurement', ...QC_TESTING_ROLES];

const normalizeRole = (role) => String(role || '').trim().toLowerCase();
const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const hasText = (value) => String(value || '').trim().length > 0;
const actorName = (user) => user?.name || user?.full_name || user?.username || user?.email || 'System User';
const RESULT_STATUS_VALUES = new Set(['pass', 'fail', 'conditional', 'not_applicable', 'pending']);

const inferResultStatusFromSpecs = (measuredValue, parameter = {}) => {
  if (!Number.isFinite(measuredValue)) return null;

  const specMin = toNumber(parameter.spec_min);
  const specMax = toNumber(parameter.spec_max);
  const conditionalMin = toNumber(parameter.conditional_min);
  const conditionalMax = toNumber(parameter.conditional_max);

  const hasSpecBounds = specMin !== null || specMax !== null;
  if (!hasSpecBounds) return null;

  const inSpec = (specMin === null || measuredValue >= specMin)
    && (specMax === null || measuredValue <= specMax);
  if (inSpec) return 'pass';

  const hasConditionalBounds = conditionalMin !== null || conditionalMax !== null;
  if (!hasConditionalBounds) return 'fail';

  const inConditional = (conditionalMin === null || measuredValue >= conditionalMin)
    && (conditionalMax === null || measuredValue <= conditionalMax);

  return inConditional ? 'conditional' : 'fail';
};

const parseDivision = (req) => {
  const raw = req.query.division || req.body.division || req.params.division || 'FP';
  return String(raw).trim().toUpperCase();
};

const canAccessDivision = (user, division) => {
  const role = normalizeRole(user?.role);
  if (role === 'admin') return true;

  const userDivisions = Array.isArray(user?.divisions)
    ? user.divisions.map((d) => String(d || '').trim().toUpperCase()).filter(Boolean)
    : [];

  // Some users do not carry division arrays in dev tokens. Keep backward-compatible FP default.
  if (userDivisions.length === 0) {
    return division === 'FP';
  }

  return userDivisions.includes(division);
};

const validateDivision = (req, res, next) => {
  const division = parseDivision(req);
  if (!VALID_DIVISIONS.includes(division)) {
    return res.status(400).json({ success: false, error: `Invalid division: ${division}` });
  }
  if (!canAccessDivision(req.user, division)) {
    return res.status(403).json({ success: false, error: `Access denied for division ${division}` });
  }
  req.qcDivision = division;
  next();
};

const requireViewAccess = requireAnyRole(
  RAW_MATERIALS_VIEW_ROLES.filter((role) => !SENIOR_MANAGEMENT_ROLES.includes(role)),
  { minLevel: SENIOR_LEVEL, minLevelRoles: SENIOR_MANAGEMENT_ROLES }
);

const asInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const sanitizeLimit = (value, fallback = 50, max = 500) => {
  const parsed = asInt(value);
  if (!parsed || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const logActivity = async (client, incomingId, action, fromStatus, toStatus, user, details = null, metadata = null) => {
  await client.query(
    `INSERT INTO qc_rm_activity_log
      (incoming_id, action, from_status, to_status, performed_by, performed_by_name, details, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::jsonb, '{}'::jsonb))`,
    [
      incomingId,
      action,
      fromStatus || null,
      toStatus || null,
      user?.id || null,
      actorName(user),
      details || null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
};

const ensureSupplierTierRow = async (client, supplierCode, supplierName, user) => {
  if (!supplierCode) return;

  await client.query(
    `INSERT INTO qc_supplier_tiers
      (supplier_code, supplier_name, tier, tier_reason, tier_assigned_by)
     VALUES ($1, $2, 'tier_2', 'Auto-seeded from incoming RM', $3)
     ON CONFLICT (supplier_code) DO UPDATE
       SET supplier_name = COALESCE(EXCLUDED.supplier_name, qc_supplier_tiers.supplier_name),
           updated_at = NOW()`,
    [supplierCode, supplierName || null, user?.id || null]
  );
};

const getIncomingById = async (client, incomingId) => {
  const result = await client.query(
    `SELECT * FROM qc_rm_incoming WHERE id = $1`,
    [incomingId]
  );
  return result.rows[0] || null;
};

const validateIncomingForDivision = (incoming, division) => {
  return String(incoming?.division || '').toUpperCase() === division;
};

const fetchKFTrendAlerts = async (db, division) => {
  const kfRows = await db.query(
    `WITH ranked AS (
       SELECT
         i.id AS incoming_id,
         i.supplier_code,
         COALESCE(i.supplier_name, i.supplier_code) AS supplier_name,
         i.material_type,
         i.received_date,
         r.result_value,
         ROW_NUMBER() OVER (
           PARTITION BY i.supplier_code, i.material_type
           ORDER BY i.received_date DESC, i.id DESC
         ) AS rn
       FROM qc_rm_test_results r
       JOIN qc_rm_test_parameters p ON p.id = r.parameter_id
       JOIN qc_rm_incoming i ON i.id = r.incoming_id
       WHERE i.division = $1
         AND i.supplier_code IS NOT NULL
         AND UPPER(p.parameter_code) = 'KF_WATER'
         AND r.result_value IS NOT NULL
     ), last_three AS (
       SELECT * FROM ranked WHERE rn <= 3
     )
     SELECT
       supplier_code,
       supplier_name,
       material_type,
       ARRAY_AGG(result_value ORDER BY received_date ASC, incoming_id ASC) AS last_3_values
     FROM last_three
     GROUP BY supplier_code, supplier_name, material_type
     HAVING COUNT(*) = 3`,
    [division]
  );

  return kfRows.rows
    .map((row) => {
      const values = Array.isArray(row.last_3_values)
        ? row.last_3_values.map((v) => Number(v)).filter((v) => Number.isFinite(v))
        : [];
      if (values.length !== 3) return null;
      const increasing = values[0] < values[1] && values[1] < values[2];
      if (!increasing) return null;
      return {
        supplier_code: row.supplier_code,
        supplier_name: row.supplier_name,
        material_type: row.material_type,
        trend: 'increasing',
        last_3_values: values,
      };
    })
    .filter(Boolean);
};

// GET /api/mes/qc/incoming-rm/stats
router.get('/incoming-rm/stats', authenticate, queryLimiter, requireViewAccess, validateDivision, async (req, res) => {
  try {
    const division = req.qcDivision;

    const statsResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE qc_status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE qc_status = 'assigned')::int AS assigned,
         COUNT(*) FILTER (WHERE qc_status = 'in_progress')::int AS in_progress,
         COUNT(*) FILTER (WHERE qc_status = 'passed')::int AS passed,
         COUNT(*) FILTER (WHERE qc_status = 'failed')::int AS failed,
         COUNT(*) FILTER (WHERE qc_status = 'conditional')::int AS conditional,
         COUNT(*) FILTER (WHERE qc_status = 'passed' AND verdict_at::date = CURRENT_DATE)::int AS passed_today,
         COUNT(*) FILTER (WHERE qc_status = 'failed' AND verdict_at::date = CURRENT_DATE)::int AS failed_today
       FROM qc_rm_incoming
       WHERE division = $1`,
      [division]
    );

    res.json({ success: true, data: statsResult.rows[0] || {} });
  } catch (err) {
    logger.error('MES QC Incoming RM: stats fetch failed', err);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// GET /api/mes/qc/incoming-rm/supplier-quality
router.get('/incoming-rm/supplier-quality', authenticate, queryLimiter, requireAnyRole(SUPPLIER_QUALITY_ROLES), validateDivision, async (req, res) => {
  try {
    const division = req.qcDivision;

    const summary = await pool.query(
      `SELECT
         supplier_code,
         COALESCE(MAX(supplier_name), supplier_code) AS supplier_name,
         COUNT(*)::int AS total_lots,
         COUNT(*) FILTER (WHERE qc_status = 'passed')::int AS passed_lots,
         COUNT(*) FILTER (WHERE qc_status = 'failed')::int AS failed_lots,
         COUNT(*) FILTER (WHERE qc_status = 'conditional')::int AS conditional_lots,
         ROUND(
           CASE WHEN COUNT(*) = 0 THEN 0
             ELSE (COUNT(*) FILTER (WHERE qc_status = 'passed')::numeric * 100.0 / COUNT(*)::numeric)
           END,
           2
         ) AS pass_rate_percent
       FROM qc_rm_incoming
       WHERE division = $1
         AND supplier_code IS NOT NULL
         AND supplier_code <> ''
       GROUP BY supplier_code
       ORDER BY pass_rate_percent DESC, total_lots DESC`,
      [division]
    );

    const kfTrendAlerts = await fetchKFTrendAlerts(pool, division);

    res.json({
      success: true,
      data: summary.rows,
      kf_trend_alerts: kfTrendAlerts,
    });
  } catch (err) {
    logger.error('MES QC Incoming RM: supplier-quality failed', err);
    res.status(500).json({ success: false, error: 'Failed to fetch supplier quality summary' });
  }
});

// GET /api/mes/qc/incoming-rm
router.get('/incoming-rm', authenticate, queryLimiter, requireViewAccess, validateDivision, async (req, res) => {
  try {
    const division = req.qcDivision;
    const {
      status,
      material_type,
      supplier,
      assigned_to,
      from_date,
      to_date,
      source,
      search,
    } = req.query;

    const limit = sanitizeLimit(req.query.limit, 50, 500);
    const offset = Math.max(asInt(req.query.offset) || 0, 0);

    const where = ['i.division = $1'];
    const params = [division];
    let idx = 2;

    if (status) {
      where.push(`i.qc_status = $${idx++}`);
      params.push(String(status).trim());
    }

    if (material_type) {
      where.push(`i.material_type ILIKE $${idx++}`);
      params.push(`%${String(material_type).trim()}%`);
    }

    if (supplier) {
      where.push(`(i.supplier_code ILIKE $${idx} OR i.supplier_name ILIKE $${idx + 1})`);
      params.push(`%${String(supplier).trim()}%`, `%${String(supplier).trim()}%`);
      idx += 2;
    }

    if (assigned_to) {
      const assignedToId = asInt(assigned_to);
      if (assignedToId) {
        where.push(`i.assigned_to = $${idx++}`);
        params.push(assignedToId);
      }
    }

    if (source) {
      where.push(`i.source = $${idx++}`);
      params.push(String(source).trim());
    }

    if (from_date) {
      where.push(`i.received_date >= $${idx++}::date`);
      params.push(String(from_date).trim());
    }

    if (to_date) {
      where.push(`i.received_date <= $${idx++}::date`);
      params.push(String(to_date).trim());
    }

    if (search) {
      const value = `%${String(search).trim()}%`;
      where.push(`(
        i.material_code ILIKE $${idx}
        OR i.material_name ILIKE $${idx}
        OR i.qc_lot_id ILIKE $${idx}
        OR i.batch_number ILIKE $${idx}
        OR i.supplier_code ILIKE $${idx}
        OR i.supplier_name ILIKE $${idx}
      )`);
      params.push(value);
      idx += 1;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM qc_rm_incoming i ${whereClause}`,
      params
    );

    const dataResult = await pool.query(
      `SELECT
         i.id,
         i.qc_lot_id,
         i.rm_sync_id,
         i.source,
         i.division,
         i.material_code,
         i.material_name,
         i.material_type,
         i.material_subtype,
         i.supplier_code,
         i.supplier_name,
         i.batch_number,
         i.grn_reference,
         i.po_reference,
         i.received_date,
         i.quantity,
         i.unit,
         i.priority,
         i.qc_status,
         i.assigned_to,
         i.assigned_to_name,
         i.assigned_at,
         i.started_at,
         i.completed_at,
         i.conditional_restriction,
         i.verdict_at,
         i.created_at,
         (
           SELECT COUNT(*)::int
           FROM qc_rm_test_results r
           WHERE r.incoming_id = i.id
         ) AS test_result_count
       FROM qc_rm_incoming i
       ${whereClause}
       ORDER BY i.received_date DESC, i.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        total: countResult.rows[0]?.total || 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    logger.error('MES QC Incoming RM: list fetch failed', err);
    res.status(500).json({ success: false, error: 'Failed to fetch incoming RM list' });
  }
});

// GET /api/mes/qc/incoming-rm/:id
router.get('/incoming-rm/:id', authenticate, queryLimiter, requireViewAccess, validateDivision, async (req, res) => {
  try {
    const incomingId = asInt(req.params.id);
    if (!incomingId) {
      return res.status(400).json({ success: false, error: 'Invalid incoming RM id' });
    }

    const division = req.qcDivision;

    const incomingResult = await pool.query(
      `SELECT * FROM qc_rm_incoming WHERE id = $1`,
      [incomingId]
    );

    if (incomingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Incoming RM record not found' });
    }

    const incoming = incomingResult.rows[0];
    if (!validateIncomingForDivision(incoming, division)) {
      return res.status(403).json({ success: false, error: 'Record belongs to another division' });
    }

    const [resultsRes, activityRes] = await Promise.all([
      pool.query(
        `SELECT
           r.id,
           r.incoming_id,
           r.parameter_id,
           p.parameter_name,
           p.parameter_code,
           p.tested_by_role AS expected_role,
           p.test_method AS parameter_test_method,
           p.unit,
           p.spec_min,
           p.spec_target,
           p.spec_max,
           p.conditional_min,
           p.conditional_max,
           p.conditional_action,
           p.inspection_level,
           r.result_value,
           r.result_text,
           r.result_status,
           r.replicate_number,
           r.measurement_point,
           r.tested_by,
           r.tested_by_name,
           r.tested_by_role,
           r.test_method,
           r.equipment_id,
           r.equipment_name,
           r.equipment_calibration_due,
           r.notes,
           r.metadata,
           r.tested_at,
           r.created_at
         FROM qc_rm_test_results r
         JOIN qc_rm_test_parameters p ON p.id = r.parameter_id
         WHERE r.incoming_id = $1
         ORDER BY p.display_order ASC, p.parameter_name ASC, r.replicate_number ASC, r.id ASC`,
        [incomingId]
      ),
      pool.query(
        `SELECT
           id,
           incoming_id,
           action,
           from_status,
           to_status,
           performed_by,
           performed_by_name,
           details,
           metadata,
           created_at
         FROM qc_rm_activity_log
         WHERE incoming_id = $1
         ORDER BY created_at DESC, id DESC`,
        [incomingId]
      ),
    ]);

    res.json({
      success: true,
      data: {
        incoming,
        test_results: resultsRes.rows,
        activity_log: activityRes.rows,
      },
    });
  } catch (err) {
    logger.error('MES QC Incoming RM: detail fetch failed', err);
    res.status(500).json({ success: false, error: 'Failed to fetch incoming RM detail' });
  }
});

// POST /api/mes/qc/incoming-rm (manual / regrind entry)
router.post('/incoming-rm', authenticate, generalLimiter, requireAnyRole([...QC_TESTING_ROLES, ...PRODUCTION_REGRIND_ROLES, 'admin']), validateDivision, async (req, res) => {
  const client = await pool.connect();
  try {
    const division = req.qcDivision;
    const {
      material_code,
      material_name,
      material_type,
      material_subtype,
      supplier_code,
      supplier_name,
      batch_number,
      grn_reference,
      po_reference,
      received_date,
      quantity,
      unit,
      priority,
      source,
      notes,
    } = req.body || {};

    if (!material_code || !material_name) {
      return res.status(400).json({ success: false, error: 'material_code and material_name are required' });
    }

    const normalizedSource = String(source || 'manual').trim().toLowerCase();
    if (!['manual', 'regrind', 'oracle_sync'].includes(normalizedSource)) {
      return res.status(400).json({ success: false, error: 'Invalid source. Allowed: manual, regrind, oracle_sync' });
    }

    const normalizedPriority = String(priority || 'normal').trim().toLowerCase();
    if (!['low', 'normal', 'high', 'urgent'].includes(normalizedPriority)) {
      return res.status(400).json({ success: false, error: 'Invalid priority' });
    }

    const normalizedMaterialType = normalizedSource === 'regrind'
      ? 'Regrind / PIR'
      : (material_type || null);

    const normalizedSupplierCode = normalizedSource === 'regrind'
      ? (supplier_code || 'INTERNAL-RGR')
      : (supplier_code || null);

    const normalizedSupplierName = normalizedSource === 'regrind'
      ? (supplier_name || 'Internal Regrind')
      : (supplier_name || null);

    await client.query('BEGIN');

    const insertResult = await client.query(
      `INSERT INTO qc_rm_incoming (
         source,
         division,
         material_code,
         material_name,
         material_type,
         material_subtype,
         supplier_code,
         supplier_name,
         batch_number,
         grn_reference,
         po_reference,
         received_date,
         quantity,
         unit,
         priority,
         qc_status,
         qc_lot_id,
         created_by,
         created_by_name
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         COALESCE($12::date, CURRENT_DATE),
         $13, $14, $15,
         'pending',
         generate_qc_rm_lot_id($3),
         $16, $17
       )
       RETURNING *`,
      [
        normalizedSource,
        division,
        String(material_code).trim(),
        String(material_name).trim(),
        normalizedMaterialType,
        material_subtype || null,
        normalizedSupplierCode,
        normalizedSupplierName,
        batch_number || null,
        grn_reference || null,
        po_reference || null,
        received_date || null,
        toNumber(quantity),
        unit || null,
        normalizedPriority,
        req.user?.id || null,
        actorName(req.user),
      ]
    );

    const created = insertResult.rows[0];

    await ensureSupplierTierRow(client, created.supplier_code, created.supplier_name, req.user);

    await logActivity(
      client,
      created.id,
      'created',
      null,
      created.qc_status,
      req.user,
      notes || `Incoming RM manually logged (${normalizedSource})`
    );

    await client.query('COMMIT');

    try {
      await notifyNewRMReceived(created, {
        excludeUserId: req.user?.id || null,
        division,
      });
    } catch (notifyErr) {
      logger.warn('MES QC Incoming RM: create notification failed', notifyErr.message);
    }

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES QC Incoming RM: create failed', err);
    res.status(500).json({ success: false, error: 'Failed to create incoming RM record' });
  } finally {
    client.release();
  }
});

// POST /api/mes/qc/incoming-rm/:id/assign
router.post('/incoming-rm/:id/assign', authenticate, generalLimiter, requireAnyRole(QC_VERDICT_ROLES), validateDivision, async (req, res) => {
  const client = await pool.connect();
  try {
    const incomingId = asInt(req.params.id);
    if (!incomingId) {
      return res.status(400).json({ success: false, error: 'Invalid incoming RM id' });
    }

    const { assigned_to, assigned_to_name, notes } = req.body || {};
    const assigneeId = assigned_to ? asInt(assigned_to) : null;
    const assigneeName = assigned_to_name || null;

    if (!assigneeId && !assigneeName) {
      return res.status(400).json({ success: false, error: 'assigned_to or assigned_to_name is required' });
    }

    await client.query('BEGIN');

    const existing = await getIncomingById(client, incomingId);
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Incoming RM record not found' });
    }

    if (!validateIncomingForDivision(existing, req.qcDivision)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Record belongs to another division' });
    }

    const nextStatus = existing.qc_status === 'pending' ? 'assigned' : existing.qc_status;

    const updateResult = await client.query(
      `UPDATE qc_rm_incoming
       SET assigned_to = $1,
           assigned_to_name = $2,
           assigned_at = NOW(),
           qc_status = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [assigneeId, assigneeName, nextStatus, incomingId]
    );

    await logActivity(
      client,
      incomingId,
      'assigned',
      existing.qc_status,
      nextStatus,
      req.user,
      notes || `Assigned to ${assigneeName || assigneeId || 'user'}`
    );

    await client.query('COMMIT');

    try {
      if (assigneeId) {
        await notifyRMAssigned(updateResult.rows[0], assigneeId, {
          excludeUserId: req.user?.id || null,
        });
      }
    } catch (notifyErr) {
      logger.warn('MES QC Incoming RM: assignment notification failed', notifyErr.message);
    }

    res.json({ success: true, data: updateResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES QC Incoming RM: assignment failed', err);
    res.status(500).json({ success: false, error: 'Failed to assign incoming RM' });
  } finally {
    client.release();
  }
});

// POST /api/mes/qc/incoming-rm/:id/start
router.post('/incoming-rm/:id/start', authenticate, generalLimiter, requireAnyRole(QC_TESTING_ROLES), validateDivision, async (req, res) => {
  const client = await pool.connect();
  try {
    const incomingId = asInt(req.params.id);
    if (!incomingId) {
      return res.status(400).json({ success: false, error: 'Invalid incoming RM id' });
    }

    await client.query('BEGIN');

    const existing = await getIncomingById(client, incomingId);
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Incoming RM record not found' });
    }

    if (!validateIncomingForDivision(existing, req.qcDivision)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Record belongs to another division' });
    }

    if (['passed', 'failed', 'conditional'].includes(existing.qc_status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Testing cannot be started on completed records' });
    }

    const updateResult = await client.query(
      `UPDATE qc_rm_incoming
       SET qc_status = 'in_progress',
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [incomingId]
    );

    await logActivity(
      client,
      incomingId,
      'started',
      existing.qc_status,
      'in_progress',
      req.user,
      'Testing started'
    );

    await client.query('COMMIT');

    res.json({ success: true, data: updateResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES QC Incoming RM: start failed', err);
    res.status(500).json({ success: false, error: 'Failed to start testing' });
  } finally {
    client.release();
  }
});

const submitResults = async ({ req, res, allowedParameterRoles, actionName, requireEquipment = false }) => {
  const client = await pool.connect();
  try {
    const incomingId = asInt(req.params.id);
    if (!incomingId) {
      return res.status(400).json({ success: false, error: 'Invalid incoming RM id' });
    }

    const results = Array.isArray(req.body?.results) ? req.body.results : [];
    if (results.length === 0) {
      return res.status(400).json({ success: false, error: 'results array is required' });
    }

    const parameterIds = [...new Set(results.map((row) => asInt(row.parameter_id)).filter(Boolean))];
    if (parameterIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Each result must include a valid parameter_id' });
    }

    await client.query('BEGIN');

    const incoming = await getIncomingById(client, incomingId);
    if (!incoming) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Incoming RM record not found' });
    }

    if (!validateIncomingForDivision(incoming, req.qcDivision)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Record belongs to another division' });
    }

    if (['passed', 'failed', 'conditional'].includes(incoming.qc_status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Cannot submit results for completed records' });
    }

    const parameterResult = await client.query(
      `SELECT id,
              parameter_name,
              parameter_code,
              tested_by_role,
              test_method,
              spec_min,
              spec_max,
              conditional_min,
              conditional_max
       FROM qc_rm_test_parameters
       WHERE id = ANY($1::int[]) AND is_active = true`,
      [parameterIds]
    );

    const paramMap = new Map(parameterResult.rows.map((row) => [row.id, row]));

    const missingParams = parameterIds.filter((id) => !paramMap.has(id));
    if (missingParams.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: `Unknown or inactive parameter IDs: ${missingParams.join(', ')}` });
    }

    const invalidRoleParams = results
      .map((row) => {
        const parameterId = asInt(row.parameter_id);
        const param = paramMap.get(parameterId);
        if (!param) return null;
        if (!allowedParameterRoles.includes(param.tested_by_role)) {
          return `${param.parameter_name} (${param.parameter_code}) expects ${param.tested_by_role}`;
        }
        return null;
      })
      .filter(Boolean);

    if (invalidRoleParams.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Some parameters are not allowed in this submission endpoint',
        details: invalidRoleParams,
      });
    }

    if (requireEquipment) {
      const missingRequirements = [];
      for (const row of results) {
        const parameterId = asInt(row.parameter_id);
        const param = paramMap.get(parameterId);
        const equipmentId = asInt(row.equipment_id);
        const effectiveMethod = row.test_method || param?.test_method || null;

        if (!equipmentId) {
          missingRequirements.push(`${param?.parameter_name || `parameter ${parameterId}`}: equipment_id is required for lab submission`);
        }
        if (!hasText(effectiveMethod)) {
          missingRequirements.push(`${param?.parameter_name || `parameter ${parameterId}`}: test_method is required for lab submission`);
        }
      }

      if (missingRequirements.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Lab result submission is missing required fields',
          details: missingRequirements,
        });
      }
    }

    const equipmentIds = [...new Set(results.map((row) => asInt(row.equipment_id)).filter(Boolean))];
    let equipmentMap = new Map();

    if (equipmentIds.length > 0) {
      const equipmentResult = await client.query(
        `SELECT id, name, calibration_due FROM mes_qc_equipment WHERE id = ANY($1::int[])`,
        [equipmentIds]
      );
      equipmentMap = new Map(equipmentResult.rows.map((row) => [row.id, row]));
    }

    const warnings = [];
    const insertedIds = [];

    for (const row of results) {
      const parameterId = asInt(row.parameter_id);
      const param = paramMap.get(parameterId);
      const equipmentId = asInt(row.equipment_id);
      const measuredValue = toNumber(row.result_value);
      const testConditions = hasText(row.test_conditions)
        ? String(row.test_conditions).trim()
        : null;

      let effectiveResultStatus = hasText(row.result_status)
        ? String(row.result_status).trim().toLowerCase()
        : null;

      if (!effectiveResultStatus && measuredValue !== null) {
        effectiveResultStatus = inferResultStatusFromSpecs(measuredValue, param);
      }

      if (effectiveResultStatus && !RESULT_STATUS_VALUES.has(effectiveResultStatus)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Invalid result_status for parameter ${param?.parameter_code || parameterId}`,
        });
      }

      const equipment = equipmentId ? equipmentMap.get(equipmentId) : null;
      const calibrationDue = equipment?.calibration_due || null;

      const calibrationOverdue = Boolean(
        calibrationDue && new Date(calibrationDue).getTime() < Date.now()
      );

      if (calibrationOverdue) {
        // Block mode: reject test submission when equipment calibration is overdue
        await logActivity(
          client,
          incomingId,
          'calibration_blocked',
          incoming.qc_status,
          incoming.qc_status,
          req.user,
          `Test submission BLOCKED — equipment ${equipment?.name || equipmentId} calibration overdue (due ${calibrationDue})`,
          {
            equipment_id: equipmentId,
            equipment_name: equipment?.name || null,
            calibration_due: calibrationDue,
            parameter_id: parameterId,
            parameter_code: param.parameter_code,
          }
        );

        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Equipment "${equipment?.name || equipmentId}" calibration is overdue (due ${calibrationDue}). Test submission blocked until equipment is recalibrated.`,
          calibration_blocked: true,
          equipment_id: equipmentId,
          equipment_name: equipment?.name || null,
          calibration_due: calibrationDue,
        });
      }

      const calibrationWarning = Boolean(
        calibrationDue && new Date(calibrationDue).getTime() < Date.now() + (7 * 24 * 60 * 60 * 1000)
      );

      if (calibrationWarning) {
        warnings.push({
          parameter_id: parameterId,
          equipment_id: equipmentId,
          equipment_name: equipment?.name || null,
          calibration_due: calibrationDue,
          warning: `Equipment ${equipment?.name || equipmentId} calibration due soon (${calibrationDue})`,
        });

        await logActivity(
          client,
          incomingId,
          'calibration_warning',
          incoming.qc_status,
          incoming.qc_status,
          req.user,
          `Calibration due soon for equipment ${equipment?.name || equipmentId}`,
          {
            equipment_id: equipmentId,
            equipment_name: equipment?.name || null,
            calibration_due: calibrationDue,
            parameter_id: parameterId,
            parameter_code: param.parameter_code,
          }
        );
      }

      const metadata = {};
      if (calibrationWarning) {
        metadata.calibration_warning = true;
      }
      if (testConditions) {
        metadata.test_conditions = testConditions;
      }

      const insertResult = await client.query(
        `INSERT INTO qc_rm_test_results (
           incoming_id,
           parameter_id,
           result_value,
           result_text,
           result_status,
           replicate_number,
           measurement_point,
           tested_by,
           tested_by_name,
           tested_by_role,
           test_method,
           equipment_id,
           equipment_name,
           equipment_calibration_due,
           notes,
           metadata,
           tested_at
         )
         VALUES (
           $1, $2, $3, $4, $5,
           COALESCE($6, 1), $7,
           $8, $9, $10,
           COALESCE($11, $12),
           $13, $14, $15,
           $16,
           COALESCE($17::jsonb, '{}'::jsonb),
           COALESCE($18::timestamptz, NOW())
         )
         RETURNING id`,
        [
          incomingId,
          parameterId,
          measuredValue,
          row.result_text || null,
          effectiveResultStatus,
          asInt(row.replicate_number),
          row.measurement_point || null,
          req.user?.id || null,
          actorName(req.user),
          normalizeRole(req.user?.role),
          row.test_method || null,
          param.test_method || null,
          equipmentId,
          equipment?.name || null,
          calibrationDue,
          row.notes || null,
          JSON.stringify(metadata),
          row.tested_at || null,
        ]
      );

      insertedIds.push(insertResult.rows[0]?.id);
    }

    const fromStatus = incoming.qc_status;
    const toStatus = ['pending', 'assigned'].includes(incoming.qc_status)
      ? 'in_progress'
      : incoming.qc_status;

    const updateStatusResult = await client.query(
      `UPDATE qc_rm_incoming
       SET qc_status = $2,
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [incomingId, toStatus]
    );

    await logActivity(
      client,
      incomingId,
      actionName,
      fromStatus,
      toStatus,
      req.user,
      `${results.length} test result(s) submitted`,
      {
        submitted_count: results.length,
        result_ids: insertedIds,
      }
    );

    await client.query('COMMIT');

    if (warnings.length > 0) {
      const uniqueWarnings = [];
      const seen = new Set();

      for (const warning of warnings) {
        const key = `${warning.equipment_id || 'none'}:${warning.calibration_due || 'none'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniqueWarnings.push(warning);
      }

      for (const warning of uniqueWarnings) {
        try {
          await notifyCalibrationDue(
            {
              incomingRecord: updateStatusResult.rows[0],
              equipment_name: warning.equipment_name,
              calibration_due: warning.calibration_due,
            },
            {
              excludeUserId: req.user?.id || null,
              division: req.qcDivision,
            }
          );
        } catch (notifyErr) {
          logger.warn('MES QC Incoming RM: calibration notification failed', notifyErr.message);
        }
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        incoming: updateStatusResult.rows[0],
        submitted_count: insertedIds.length,
        warnings,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES QC Incoming RM: result submission failed', err);
    return res.status(500).json({ success: false, error: 'Failed to submit test results' });
  } finally {
    client.release();
  }
};

// POST /api/mes/qc/incoming-rm/:id/results/dock
router.post(
  '/incoming-rm/:id/results/dock',
  authenticate,
  generalLimiter,
  requireAnyRole([...OPERATOR_DOCK_ROLES, ...QC_TESTING_ROLES]),
  validateDivision,
  async (req, res) => {
    return submitResults({
      req,
      res,
      allowedParameterRoles: ['operator'],
      actionName: 'results_recorded_dock',
    });
  }
);

// POST /api/mes/qc/incoming-rm/:id/results/lab
router.post(
  '/incoming-rm/:id/results/lab',
  authenticate,
  generalLimiter,
  requireAnyRole(QC_TESTING_ROLES),
  validateDivision,
  async (req, res) => {
    return submitResults({
      req,
      res,
      allowedParameterRoles: ['qc_technician', 'qc_lab'],
      actionName: 'results_recorded_lab',
      requireEquipment: true,
    });
  }
);

// POST /api/mes/qc/incoming-rm/:id/verdict
router.post('/incoming-rm/:id/verdict', authenticate, generalLimiter, requireAnyRole(QC_VERDICT_ROLES), validateDivision, async (req, res) => {
  const client = await pool.connect();
  let kfAlertsToNotify = [];
  let issuedCertificate = null;
  let certificateAlreadyExisted = false;
  try {
    const incomingId = asInt(req.params.id);
    if (!incomingId) {
      return res.status(400).json({ success: false, error: 'Invalid incoming RM id' });
    }

    const verdict = String(req.body?.verdict || '').trim().toLowerCase();
    const notes = req.body?.notes || null;
    const restriction = req.body?.conditional_restriction || null;

    if (!['passed', 'failed', 'conditional'].includes(verdict)) {
      return res.status(400).json({ success: false, error: 'verdict must be one of: passed, failed, conditional' });
    }

    if (verdict === 'conditional' && !restriction) {
      return res.status(400).json({ success: false, error: 'conditional_restriction is required for conditional verdict' });
    }

    await client.query('BEGIN');

    const incoming = await getIncomingById(client, incomingId);
    if (!incoming) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Incoming RM record not found' });
    }

    if (!validateIncomingForDivision(incoming, req.qcDivision)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Record belongs to another division' });
    }

    // Regrind gate: do not allow a direct passed verdict unless food-contact is explicitly cleared.
    if (String(incoming.material_type || '').toLowerCase() === 'regrind / pir' && verdict === 'passed') {
      const foodCheck = await client.query(
        `SELECT
           r.result_status,
           r.result_text,
           r.result_value
         FROM qc_rm_test_results r
         JOIN qc_rm_test_parameters p ON p.id = r.parameter_id
         WHERE r.incoming_id = $1
           AND (
             UPPER(p.parameter_code) IN ('FOOD_CONTACT_ELIGIBILITY', 'FOOD_CONTACT')
             OR LOWER(p.parameter_name) LIKE '%food contact%'
           )
         ORDER BY r.tested_at DESC, r.id DESC
         LIMIT 1`,
        [incomingId]
      );

      const latest = foodCheck.rows[0] || null;
      const passedByText = latest && String(latest.result_text || '').toLowerCase().includes('eligible');
      const passedByStatus = latest && String(latest.result_status || '').toLowerCase() === 'pass';

      if (!latest || (!passedByText && !passedByStatus)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Regrind/PIR batches require conditional verdict unless food-contact eligibility is explicitly passed',
        });
      }
    }

    // CTQ gate: if any Critical-to-Quality parameter has a failed result, block 'passed' verdict.
    if (verdict === 'passed') {
      const ctqCheck = await client.query(
        `SELECT r.id, r.result_status, p.parameter_name, p.parameter_code
         FROM qc_rm_test_results r
         JOIN qc_rm_test_parameters p ON p.id = r.parameter_id
         WHERE r.incoming_id = $1
           AND p.is_ctq = TRUE
           AND r.result_status IN ('fail', 'conditional')
         ORDER BY r.id`,
        [incomingId]
      );

      if (ctqCheck.rows.length > 0) {
        const failedCtqNames = ctqCheck.rows.map((r) => r.parameter_name || r.parameter_code).join(', ');
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Cannot set verdict to "passed" — CTQ parameter(s) failed: ${failedCtqNames}. Use "conditional" or "failed" verdict instead.`,
          ctq_failures: ctqCheck.rows,
        });
      }
    }

    const updateResult = await client.query(
      `UPDATE qc_rm_incoming
       SET qc_status = $2,
           verdict_notes = $3,
           conditional_restriction = $4,
           verdict_by = $5,
           verdict_by_name = $6,
           verdict_at = NOW(),
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        incomingId,
        verdict,
        notes,
        verdict === 'conditional' ? restriction : null,
        req.user?.id || null,
        actorName(req.user),
      ]
    );

    const actionByVerdict = {
      passed: 'verdict_passed',
      failed: 'verdict_failed',
      conditional: 'verdict_conditional',
    };

    await logActivity(
      client,
      incomingId,
      actionByVerdict[verdict],
      incoming.qc_status,
      verdict,
      req.user,
      notes || `Verdict set to ${verdict}`,
      verdict === 'conditional' ? { conditional_restriction: restriction } : null
    );

    if (['passed', 'conditional'].includes(verdict)) {
      const issuance = await issueCertificateForIncoming({
        incomingId,
        approvedByUser: req.user,
        reason: 'Auto-issued from QC verdict',
        allowExisting: true,
        client,
      });

      issuedCertificate = issuance.certificate;
      certificateAlreadyExisted = issuance.alreadyExisted;

      if (!certificateAlreadyExisted && issuedCertificate?.id) {
        await logActivity(
          client,
          incomingId,
          'certificate_issued',
          verdict,
          verdict,
          req.user,
          `Certificate issued: ${issuedCertificate.certificate_number}`,
          {
            certificate_id: issuedCertificate.id,
            certificate_number: issuedCertificate.certificate_number,
          }
        );
      }
    }

    const updatedIncoming = updateResult.rows[0];

    // Update supplier pass_rate_90d after verdict
    const supplierCodeForTier = String(updatedIncoming?.supplier_code || '').trim();
    if (supplierCodeForTier) {
      try {
        await client.query(
          `UPDATE qc_supplier_tiers
           SET pass_rate_90d = sub.rate,
               total_lots_tested = sub.total,
               updated_at = NOW()
           FROM (
             SELECT
               ROUND(100.0 * COUNT(*) FILTER (WHERE qc_status = 'passed') / NULLIF(COUNT(*), 0), 2) AS rate,
               COUNT(*) AS total
             FROM qc_rm_incoming
             WHERE supplier_code = $1
               AND qc_status IN ('passed', 'failed', 'conditional')
               AND verdict_at >= NOW() - INTERVAL '90 days'
           ) sub
           WHERE supplier_code = $1`,
          [supplierCodeForTier]
        );
      } catch (tierErr) {
        logger.warn('MES QC Incoming RM: pass_rate_90d update failed', tierErr.message);
      }
    }

    const allKfAlerts = await fetchKFTrendAlerts(client, req.qcDivision);
    const supplierCode = String(updatedIncoming?.supplier_code || '').trim().toUpperCase();
    const materialType = String(updatedIncoming?.material_type || '').trim().toUpperCase();

    kfAlertsToNotify = allKfAlerts.filter((alert) => {
      const alertSupplier = String(alert.supplier_code || '').trim().toUpperCase();
      const alertMaterial = String(alert.material_type || '').trim().toUpperCase();
      return alertSupplier === supplierCode && alertMaterial === materialType;
    });

    for (const alert of kfAlertsToNotify) {
      await logActivity(
        client,
        incomingId,
        'kf_trend_alert',
        verdict,
        verdict,
        req.user,
        `Increasing KF moisture trend detected for ${alert.supplier_code || 'supplier'} ${alert.material_type || ''}`.trim(),
        {
          supplier_code: alert.supplier_code,
          material_type: alert.material_type,
          last_3_values: alert.last_3_values,
        }
      );
    }

    await client.query('COMMIT');

    const finalizedIncoming = issuedCertificate
      ? (await getIncomingById(pool, incomingId)) || updateResult.rows[0]
      : updateResult.rows[0];

    try {
      await notifyRMVerdict(finalizedIncoming, verdict, {
        excludeUserId: req.user?.id || null,
        division: req.qcDivision,
        conditionalRestriction: restriction,
      });
    } catch (notifyErr) {
      logger.warn('MES QC Incoming RM: verdict notification failed', notifyErr.message);
    }

    if (issuedCertificate && !certificateAlreadyExisted) {
      try {
        await notifyCertificateIssued(
          finalizedIncoming,
          issuedCertificate,
          {
            excludeUserId: req.user?.id || null,
            division: req.qcDivision,
          }
        );
      } catch (notifyErr) {
        logger.warn('MES QC Incoming RM: certificate notification failed', notifyErr.message);
      }
    }

    if (kfAlertsToNotify.length > 0) {
      for (const alert of kfAlertsToNotify) {
        try {
          await notifyKFTrendAlert(
            {
              ...alert,
              division: req.qcDivision,
            },
            {
              excludeUserId: req.user?.id || null,
              division: req.qcDivision,
            }
          );
        } catch (notifyErr) {
          logger.warn('MES QC Incoming RM: KF alert notification failed', notifyErr.message);
        }
      }
    }

    res.json({
      success: true,
      data: finalizedIncoming,
      certificate: issuedCertificate,
      certificate_existing: certificateAlreadyExisted,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES QC Incoming RM: verdict failed', err);
    res.status(500).json({ success: false, error: 'Failed to set verdict' });
  } finally {
    client.release();
  }
});

// POST /api/mes/qc/incoming-rm/:id/reopen
router.post('/incoming-rm/:id/reopen', authenticate, generalLimiter, requireAnyRole(QC_VERDICT_ROLES), validateDivision, async (req, res) => {
  const client = await pool.connect();
  try {
    const incomingId = asInt(req.params.id);
    if (!incomingId) {
      return res.status(400).json({ success: false, error: 'Invalid incoming RM id' });
    }

    await client.query('BEGIN');

    const incoming = await getIncomingById(client, incomingId);
    if (!incoming) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Incoming RM record not found' });
    }

    if (!validateIncomingForDivision(incoming, req.qcDivision)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Record belongs to another division' });
    }

    const updateResult = await client.query(
      `UPDATE qc_rm_incoming
       SET qc_status = 'pending',
           completed_at = NULL,
           verdict_notes = NULL,
           conditional_restriction = NULL,
           verdict_by = NULL,
           verdict_by_name = NULL,
           verdict_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [incomingId]
    );

    await logActivity(
      client,
      incomingId,
      'reopened',
      incoming.qc_status,
      'pending',
      req.user,
      req.body?.notes || 'Record reopened for re-testing'
    );

    await client.query('COMMIT');

    res.json({ success: true, data: updateResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES QC Incoming RM: reopen failed', err);
    res.status(500).json({ success: false, error: 'Failed to reopen record' });
  } finally {
    client.release();
  }
});

// GET /api/mes/qc/rm-parameters
router.get('/rm-parameters', authenticate, queryLimiter, requireViewAccess, async (req, res) => {
  try {
    const { material_type, include_inactive } = req.query;
    const where = [];
    const params = [];
    let idx = 1;

    if (!include_inactive || String(include_inactive) !== '1') {
      where.push('is_active = true');
    }

    if (material_type) {
      where.push(`material_type = $${idx++}`);
      params.push(String(material_type).trim());
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT *
       FROM qc_rm_test_parameters
       ${whereClause}
       ORDER BY material_type ASC, display_order ASC, parameter_name ASC`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('MES QC Incoming RM: parameter list failed', err);
    res.status(500).json({ success: false, error: 'Failed to fetch test parameters' });
  }
});

// POST /api/mes/qc/rm-parameters
router.post('/rm-parameters', authenticate, generalLimiter, requireAnyRole(PARAMETER_ADMIN_ROLES), async (req, res) => {
  try {
    const body = req.body || {};
    const materialType = body.material_type ? String(body.material_type).trim() : '';
    const parameterName = body.parameter_name ? String(body.parameter_name).trim() : '';
    const parameterCode = body.parameter_code ? String(body.parameter_code).trim().toUpperCase() : '';

    if (!materialType || !parameterName || !parameterCode) {
      return res.status(400).json({ success: false, error: 'material_type, parameter_name and parameter_code are required' });
    }

    const result = await pool.query(
      `INSERT INTO qc_rm_test_parameters (
         material_type,
         material_subtype,
         parameter_name,
         parameter_code,
         unit,
         test_method,
         spec_min,
         spec_target,
         spec_max,
         conditional_min,
         conditional_max,
         conditional_action,
         inspection_level,
         tested_by_role,
         frequency_rule,
         applies_to_subtype,
         process_impact,
         equipment_category,
         is_ctq,
         is_required,
         display_order,
         is_active,
         created_by,
         created_by_name
       )
       VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9,
         $10, $11, $12,
         $13, $14, $15,
         $16, $17, $18,
         COALESCE($19, false),
         COALESCE($20, true),
         COALESCE($21, 100),
         true,
         $22,
         $23
       )
       RETURNING *`,
      [
        materialType,
        body.material_subtype || null,
        parameterName,
        parameterCode,
        body.unit || null,
        body.test_method || null,
        toNumber(body.spec_min),
        toNumber(body.spec_target),
        toNumber(body.spec_max),
        toNumber(body.conditional_min),
        toNumber(body.conditional_max),
        body.conditional_action || null,
        body.inspection_level || 'l1',
        body.tested_by_role || 'qc_lab',
        body.frequency_rule || 'every_lot',
        body.applies_to_subtype || null,
        body.process_impact || null,
        body.equipment_category || null,
        body.is_ctq,
        body.is_required,
        asInt(body.display_order),
        req.user?.id || null,
        actorName(req.user),
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('MES QC Incoming RM: parameter create failed', err);
    if (String(err?.message || '').includes('uq_qc_rm_test_parameters_material_code')) {
      return res.status(409).json({ success: false, error: 'Parameter code already exists for this material type/subtype' });
    }
    res.status(500).json({ success: false, error: 'Failed to create test parameter' });
  }
});

// PUT /api/mes/qc/rm-parameters/:id
router.put('/rm-parameters/:id', authenticate, generalLimiter, requireAnyRole(PARAMETER_ADMIN_ROLES), async (req, res) => {
  try {
    const paramId = asInt(req.params.id);
    if (!paramId) {
      return res.status(400).json({ success: false, error: 'Invalid parameter id' });
    }

    const allowedFields = [
      'material_type',
      'material_subtype',
      'parameter_name',
      'parameter_code',
      'unit',
      'test_method',
      'spec_min',
      'spec_target',
      'spec_max',
      'conditional_min',
      'conditional_max',
      'conditional_action',
      'inspection_level',
      'tested_by_role',
      'frequency_rule',
      'applies_to_subtype',
      'process_impact',
      'equipment_category',
      'is_ctq',
      'is_required',
      'display_order',
      'is_active',
    ];

    const sets = [];
    const values = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (req.body[field] === undefined) continue;

      let val = req.body[field];
      if (['spec_min', 'spec_target', 'spec_max', 'conditional_min', 'conditional_max'].includes(field)) {
        val = toNumber(val);
      }
      if (field === 'display_order') {
        val = asInt(val);
      }
      if (field === 'parameter_code' && val) {
        val = String(val).trim().toUpperCase();
      }

      sets.push(`${field} = $${idx++}`);
      values.push(val);
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    sets.push(`updated_at = NOW()`);
    values.push(paramId);

    const result = await pool.query(
      `UPDATE qc_rm_test_parameters
       SET ${sets.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Parameter not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('MES QC Incoming RM: parameter update failed', err);
    if (String(err?.message || '').includes('uq_qc_rm_test_parameters_material_code')) {
      return res.status(409).json({ success: false, error: 'Parameter code already exists for this material type/subtype' });
    }
    res.status(500).json({ success: false, error: 'Failed to update test parameter' });
  }
});

// DELETE /api/mes/qc/rm-parameters/:id (soft delete)
router.delete('/rm-parameters/:id', authenticate, generalLimiter, requireAnyRole(['admin']), async (req, res) => {
  try {
    const paramId = asInt(req.params.id);
    if (!paramId) {
      return res.status(400).json({ success: false, error: 'Invalid parameter id' });
    }

    const result = await pool.query(
      `UPDATE qc_rm_test_parameters
       SET is_active = false,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [paramId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Parameter not found' });
    }

    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    logger.error('MES QC Incoming RM: parameter delete failed', err);
    res.status(500).json({ success: false, error: 'Failed to delete test parameter' });
  }
});

// GET /api/mes/qc/supplier-tiers
router.get('/supplier-tiers', authenticate, queryLimiter, requireAnyRole(SUPPLIER_TIER_VIEW_ROLES), async (req, res) => {
  try {
    const { tier, supplier } = req.query;
    const where = [];
    const params = [];
    let idx = 1;

    if (tier) {
      where.push(`tier = $${idx++}`);
      params.push(String(tier).trim());
    }

    if (supplier) {
      const value = `%${String(supplier).trim()}%`;
      where.push(`(supplier_code ILIKE $${idx} OR supplier_name ILIKE $${idx + 1})`);
      params.push(value, value);
      idx += 2;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM qc_supplier_tiers ${whereClause} ORDER BY supplier_code ASC`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('MES QC Incoming RM: supplier tiers list failed', err);
    res.status(500).json({ success: false, error: 'Failed to fetch supplier tiers' });
  }
});

// PUT /api/mes/qc/supplier-tiers/:code
router.put('/supplier-tiers/:code', authenticate, generalLimiter, requireAnyRole(QC_VERDICT_ROLES), async (req, res) => {
  try {
    const supplierCode = String(req.params.code || '').trim();
    if (!supplierCode) {
      return res.status(400).json({ success: false, error: 'Supplier code is required' });
    }

    const tier = String(req.body?.tier || '').trim();
    if (!['tier_1', 'tier_2', 'tier_3', 'suspended'].includes(tier)) {
      return res.status(400).json({ success: false, error: 'Invalid tier value' });
    }

    const result = await pool.query(
      `INSERT INTO qc_supplier_tiers (
         supplier_code,
         supplier_name,
         tier,
         tier_reason,
         tier_assigned_at,
         tier_assigned_by,
         review_due_date,
         notes
       )
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)
       ON CONFLICT (supplier_code) DO UPDATE
         SET supplier_name = COALESCE(EXCLUDED.supplier_name, qc_supplier_tiers.supplier_name),
             tier = EXCLUDED.tier,
             tier_reason = EXCLUDED.tier_reason,
             tier_assigned_at = NOW(),
             tier_assigned_by = EXCLUDED.tier_assigned_by,
             review_due_date = EXCLUDED.review_due_date,
             notes = EXCLUDED.notes,
             updated_at = NOW()
       RETURNING *`,
      [
        supplierCode,
        req.body?.supplier_name || null,
        tier,
        req.body?.tier_reason || null,
        req.user?.id || null,
        req.body?.review_due_date || null,
        req.body?.notes || null,
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('MES QC Incoming RM: supplier tier update failed', err);
    res.status(500).json({ success: false, error: 'Failed to update supplier tier' });
  }
});

module.exports = router;
