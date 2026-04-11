const logger = require('../utils/logger');
const { authPool } = require('../database/config');
const { createNotification, notifyUsers } = require('./notificationService');

const QC_LAB_ROLES = ['quality_control', 'qc_manager', 'qc_lab', 'rd_engineer', 'lab_technician'];
const PRODUCTION_ROLES = ['production_manager', 'production_planner', 'production_operator', 'production_op', 'operator'];
const PROCUREMENT_ROLES = ['procurement'];
const STORES_LOGISTICS_ROLES = ['logistics_manager', 'stores_keeper', 'store_keeper', 'warehouse_manager', 'logistics'];
const RM_ALL_ROLES = [...new Set(['admin', ...QC_LAB_ROLES, ...PRODUCTION_ROLES, ...PROCUREMENT_ROLES, ...STORES_LOGISTICS_ROLES])];

const normalizeDivision = (value) => String(value || 'FP').trim().toUpperCase();
const normalizeRole = (value) => String(value || '').trim().toLowerCase();

const uniqueList = (list = []) => [...new Set((list || []).filter(Boolean))];

const formatMaterialLabel = (incomingRecord = {}) => {
  const material = incomingRecord.material_name || incomingRecord.material_code || 'Raw Material';
  const batch = incomingRecord.batch_number || incomingRecord.qc_lot_id || 'N/A';
  return `${material} (Batch: ${batch})`;
};

const getActiveUserIdsByRolesAndDivision = async (roles = [], division = 'FP') => {
  const roleList = uniqueList(roles.map(normalizeRole)).filter(Boolean);
  if (roleList.length === 0) return [];

  const normalizedDivision = normalizeDivision(division);

  try {
    const result = await authPool.query(
      `SELECT DISTINCT u.id
       FROM users u
       LEFT JOIN user_divisions ud ON ud.user_id = u.id
       WHERE LOWER(COALESCE(u.role, '')) = ANY($1::text[])
         AND COALESCE(u.is_active, TRUE) = TRUE
         AND (
           LOWER(COALESCE(u.role, '')) = 'admin'
           OR UPPER(COALESCE(ud.division, '')) = $2
           OR (
             $2 = 'FP'
             AND NOT EXISTS (
               SELECT 1 FROM user_divisions ud2 WHERE ud2.user_id = u.id
             )
           )
         )`,
      [roleList, normalizedDivision]
    );

    return result.rows.map((row) => row.id).filter(Boolean);
  } catch (err) {
    logger.error('rmNotificationService.getActiveUserIdsByRolesAndDivision failed', err);
    return [];
  }
};

const notifyRolesInDivision = async ({ roles, division, payload, excludeUserIds = [] }) => {
  const recipients = await getActiveUserIdsByRolesAndDivision(roles, division);
  if (recipients.length === 0) return [];

  try {
    return await notifyUsers(recipients, payload, { excludeUserIds: uniqueList(excludeUserIds) });
  } catch (err) {
    logger.error('rmNotificationService.notifyRolesInDivision failed', err);
    return [];
  }
};

async function notifyNewRMReceived(incomingRecord, opts = {}) {
  if (!incomingRecord?.id) return [];

  const division = normalizeDivision(incomingRecord.division || opts.division);
  const materialLabel = formatMaterialLabel(incomingRecord);

  return notifyRolesInDivision({
    roles: QC_LAB_ROLES,
    division,
    payload: {
      type: 'rm_qc_new_incoming',
      title: 'New raw material received',
      message: `New raw material received: ${materialLabel}. QC inspection required.`,
      link: '/mes/raw-materials?mode=qc',
      referenceType: 'qc_rm_incoming',
      referenceId: incomingRecord.id,
    },
    excludeUserIds: [opts.excludeUserId].filter(Boolean),
  });
}

async function notifyNewRMBatchReceived(incomingRecords = [], opts = {}) {
  const rows = Array.isArray(incomingRecords) ? incomingRecords.filter(Boolean) : [];
  if (rows.length === 0) return [];

  const first = rows[0];
  const division = normalizeDivision(first.division || opts.division);
  const sampleLabel = formatMaterialLabel(first);
  const label = rows.length === 1 ? sampleLabel : `${rows.length} incoming RM record(s) (${sampleLabel} + more)`;

  return notifyRolesInDivision({
    roles: QC_LAB_ROLES,
    division,
    payload: {
      type: 'rm_qc_new_incoming_batch',
      title: 'New RM sync requires QC inspection',
      message: `New raw materials synced: ${label}.`,
      link: '/mes/raw-materials?mode=qc',
      referenceType: 'rm_sync',
      referenceId: opts.syncId || null,
    },
    excludeUserIds: [opts.excludeUserId].filter(Boolean),
  });
}

async function notifyRMAssigned(incomingRecord, assignedUserId, opts = {}) {
  const targetUserId = Number(assignedUserId);
  if (!Number.isFinite(targetUserId) || targetUserId <= 0) return null;

  if (opts.excludeUserId && Number(opts.excludeUserId) === targetUserId) {
    return null;
  }

  const materialLabel = formatMaterialLabel(incomingRecord || {});

  try {
    return await createNotification({
      userId: targetUserId,
      type: 'rm_qc_assigned',
      title: 'RM inspection assigned to you',
      message: `RM inspection assigned: ${materialLabel}`,
      link: '/mes/raw-materials?mode=qc',
      referenceType: 'qc_rm_incoming',
      referenceId: incomingRecord?.id || null,
    });
  } catch (err) {
    logger.error('rmNotificationService.notifyRMAssigned failed', err);
    return null;
  }
}

async function notifyRMVerdict(incomingRecord, verdict, opts = {}) {
  if (!incomingRecord?.id) return [];

  const normalizedVerdict = String(verdict || '').trim().toLowerCase();
  const division = normalizeDivision(incomingRecord.division || opts.division);
  const materialLabel = formatMaterialLabel(incomingRecord);
  const restriction = opts.conditionalRestriction || incomingRecord.conditional_restriction || null;

  const matrix = {
    passed: {
      roles: [...STORES_LOGISTICS_ROLES, ...PROCUREMENT_ROLES, ...PRODUCTION_ROLES],
      title: 'RM approved for use',
      message: `RM approved: ${materialLabel}. Ready for production use.`,
      type: 'rm_qc_verdict_passed',
    },
    failed: {
      roles: [...STORES_LOGISTICS_ROLES, ...PROCUREMENT_ROLES],
      title: 'RM rejected',
      message: `RM rejected: ${materialLabel}. Do not use. See QC report.`,
      type: 'rm_qc_verdict_failed',
    },
    conditional: {
      roles: ['production_manager', 'procurement'],
      title: 'RM conditionally approved',
      message: `RM conditional approval: ${materialLabel}. Restriction: ${restriction || 'Review QC notes.'}`,
      type: 'rm_qc_verdict_conditional',
    },
  };

  const config = matrix[normalizedVerdict];
  if (!config) return [];

  return notifyRolesInDivision({
    roles: config.roles,
    division,
    payload: {
      type: config.type,
      title: config.title,
      message: config.message,
      link: '/mes/raw-materials?mode=qc',
      referenceType: 'qc_rm_incoming',
      referenceId: incomingRecord.id,
    },
    excludeUserIds: [opts.excludeUserId].filter(Boolean),
  });
}

async function notifyCertificateIssued(incomingRecord, certificateRecord, opts = {}) {
  if (!incomingRecord?.id || !certificateRecord?.id) return [];

  const division = normalizeDivision(incomingRecord.division || opts.division);
  const materialLabel = formatMaterialLabel(incomingRecord);

  return notifyRolesInDivision({
    roles: RM_ALL_ROLES,
    division,
    payload: {
      type: 'rm_qc_certificate_issued',
      title: 'COA issued for incoming RM',
      message: `COA issued for ${materialLabel}. Certificate #${certificateRecord.certificate_number || certificateRecord.id}`,
      link: '/mes/raw-materials?mode=qc',
      referenceType: 'qc_certificate',
      referenceId: certificateRecord.id,
    },
    excludeUserIds: [opts.excludeUserId].filter(Boolean),
  });
}

async function notifyKFTrendAlert(alertData, opts = {}) {
  const supplier = alertData?.supplier_name || alertData?.supplier_code || 'Supplier';
  const materialType = alertData?.material_type || 'Material';
  const values = Array.isArray(alertData?.last_3_values) ? alertData.last_3_values.join(' -> ') : 'rising trend detected';
  const division = normalizeDivision(opts.division || alertData?.division);

  return notifyRolesInDivision({
    roles: ['qc_manager', 'procurement'],
    division,
    payload: {
      type: 'rm_qc_kf_trend_alert',
      title: 'KF moisture trend alert',
      message: `Increasing moisture trend for ${supplier} ${materialType} over the last 3 lots (${values}).`,
      link: '/mes/raw-materials?mode=qc',
      referenceType: 'supplier',
      referenceId: null,
    },
    excludeUserIds: [opts.excludeUserId].filter(Boolean),
  });
}

async function notifyCalibrationDue(data = {}, opts = {}) {
  const division = normalizeDivision(opts.division || data?.division || data?.incomingRecord?.division);
  const equipmentName = data.equipment_name || data.equipmentName || 'Equipment';
  const calibrationDue = data.calibration_due || data.calibrationDue || 'unknown date';
  const materialLabel = formatMaterialLabel(data.incomingRecord || {});

  return notifyRolesInDivision({
    roles: ['qc_manager'],
    division,
    payload: {
      type: 'rm_qc_calibration_due',
      title: 'Equipment calibration overdue',
      message: `${equipmentName} calibration overdue since ${calibrationDue}. Results flagged for ${materialLabel}.`,
      link: '/mes/raw-materials?mode=qc',
      referenceType: 'qc_rm_incoming',
      referenceId: data.incomingRecord?.id || null,
    },
    excludeUserIds: [opts.excludeUserId].filter(Boolean),
  });
}

module.exports = {
  QC_LAB_ROLES,
  PRODUCTION_ROLES,
  PROCUREMENT_ROLES,
  STORES_LOGISTICS_ROLES,
  RM_ALL_ROLES,
  getActiveUserIdsByRolesAndDivision,
  notifyNewRMReceived,
  notifyNewRMBatchReceived,
  notifyRMAssigned,
  notifyRMVerdict,
  notifyCertificateIssued,
  notifyKFTrendAlert,
  notifyCalibrationDue,
};
