/**
 * MES QC Certificates Routes
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
  issueCertificateForIncoming,
  listCertificates,
  getCertificateWithRevisions,
  getCertificateForVerification,
  reviseCertificate,
  revokeCertificate,
} = require('../../services/qcCertificateService');
const { notifyCertificateIssued } = require('../../services/rmNotificationService');

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

const QC_VERDICT_ROLES = ['qc_manager', 'admin'];

const normalizeRole = (role) => String(role || '').trim().toLowerCase();
const asInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};
const actorName = (user) => user?.name || user?.full_name || user?.username || user?.email || 'System User';

const parseDivision = (req) => {
  const raw = req.query.division || req.body?.division || 'FP';
  return String(raw).trim().toUpperCase();
};

const canAccessDivision = (user, division) => {
  const role = normalizeRole(user?.role);
  if (role === 'admin') return true;

  const userDivisions = Array.isArray(user?.divisions)
    ? user.divisions.map((d) => String(d || '').trim().toUpperCase()).filter(Boolean)
    : [];

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

const ensureRecordDivisionAccess = (req, division) => {
  const normalized = String(division || '').trim().toUpperCase();
  if (!VALID_DIVISIONS.includes(normalized)) {
    return { ok: false, status: 400, error: `Invalid record division: ${division}` };
  }
  if (!canAccessDivision(req.user, normalized)) {
    return { ok: false, status: 403, error: `Access denied for division ${normalized}` };
  }
  return { ok: true, division: normalized };
};

// GET /api/mes/qc/certificates/verify/:verificationToken (public)
router.get('/certificates/verify/:verificationToken', queryLimiter, async (req, res) => {
  try {
    const token = String(req.params.verificationToken || '').trim();
    if (!token || token.length < 16) {
      return res.status(400).json({ success: false, error: 'Invalid verification token' });
    }

    const cert = await getCertificateForVerification(token);
    if (!cert) {
      return res.status(404).json({ success: false, error: 'Certificate not found' });
    }

    res.json({ success: true, data: cert });
  } catch (err) {
    logger.error('MES QC Certificates: verify endpoint failed', err);
    res.status(500).json({ success: false, error: 'Failed to verify certificate' });
  }
});

// GET /api/mes/qc/certificates
router.get('/certificates', authenticate, queryLimiter, requireViewAccess, validateDivision, async (req, res) => {
  try {
    const payload = await listCertificates({
      division: req.qcDivision,
      status: req.query.status,
      type: req.query.type,
      material: req.query.material,
      supplier: req.query.supplier,
      fromDate: req.query.from_date,
      toDate: req.query.to_date,
      limit: req.query.limit,
      offset: req.query.offset,
    });

    res.json({
      success: true,
      data: payload.data,
      pagination: {
        total: payload.total,
        limit: payload.limit,
        offset: payload.offset,
      },
    });
  } catch (err) {
    logger.error('MES QC Certificates: list failed', err);
    res.status(500).json({ success: false, error: 'Failed to fetch certificates' });
  }
});

// GET /api/mes/qc/certificates/:id
router.get('/certificates/:id', authenticate, queryLimiter, requireViewAccess, async (req, res) => {
  try {
    const certId = asInt(req.params.id);
    if (!certId) {
      return res.status(400).json({ success: false, error: 'Invalid certificate id' });
    }

    const detail = await getCertificateWithRevisions(certId);
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Certificate not found' });
    }

    const access = ensureRecordDivisionAccess(req, detail.certificate?.division);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, error: access.error });
    }

    res.json({ success: true, data: detail });
  } catch (err) {
    logger.error('MES QC Certificates: detail failed', err);
    res.status(500).json({ success: false, error: 'Failed to fetch certificate detail' });
  }
});

// GET /api/mes/qc/certificates/:id/pdf
router.get('/certificates/:id/pdf', authenticate, queryLimiter, requireViewAccess, async (req, res) => {
  try {
    const certId = asInt(req.params.id);
    if (!certId) {
      return res.status(400).json({ success: false, error: 'Invalid certificate id' });
    }

    const detail = await getCertificateWithRevisions(certId);
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Certificate not found' });
    }

    const access = ensureRecordDivisionAccess(req, detail.certificate?.division);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, error: access.error });
    }

    // Placeholder payload for downstream PDF generation while Phase 6 UI is being completed.
    res.json({
      success: true,
      pdf_ready: false,
      message: 'PDF generation endpoint is reserved for the next implementation step.',
      data: detail,
    });
  } catch (err) {
    logger.error('MES QC Certificates: pdf endpoint failed', err);
    res.status(500).json({ success: false, error: 'Failed to prepare certificate PDF payload' });
  }
});

// POST /api/mes/qc/certificates
router.post('/certificates', authenticate, generalLimiter, requireAnyRole(QC_VERDICT_ROLES), validateDivision, async (req, res) => {
  const client = await pool.connect();
  try {
    const incomingId = asInt(req.body?.incoming_id);
    if (!incomingId) {
      return res.status(400).json({ success: false, error: 'incoming_id is required' });
    }

    await client.query('BEGIN');

    const issuance = await issueCertificateForIncoming({
      incomingId,
      approvedByUser: req.user,
      reason: req.body?.reason || 'Manually issued from certificate endpoint',
      allowExisting: true,
      client,
    });

    const certificate = issuance.certificate;

    const access = ensureRecordDivisionAccess(req, certificate.division);
    if (!access.ok) {
      await client.query('ROLLBACK');
      return res.status(access.status).json({ success: false, error: access.error });
    }

    if (!issuance.alreadyExisted) {
      await client.query(
        `INSERT INTO qc_rm_activity_log
           (incoming_id, action, from_status, to_status, performed_by, performed_by_name, details, metadata)
         VALUES ($1, 'certificate_issued', NULL, NULL, $2, $3, $4, COALESCE($5::jsonb, '{}'::jsonb))`,
        [
          certificate.incoming_id,
          req.user?.id || null,
          actorName(req.user),
          `Certificate issued: ${certificate.certificate_number}`,
          JSON.stringify({ certificate_id: certificate.id, certificate_number: certificate.certificate_number }),
        ]
      );
    }

    await client.query('COMMIT');

    if (!issuance.alreadyExisted) {
      try {
        await notifyCertificateIssued(
          {
            id: certificate.incoming_id,
            division: certificate.division,
            material_code: certificate.material_code,
            material_name: certificate.material_name,
            batch_number: certificate.batch_number,
            qc_lot_id: certificate.qc_lot_id,
          },
          certificate,
          { excludeUserId: req.user?.id || null }
        );
      } catch (notifyErr) {
        logger.warn('MES QC Certificates: issue notification failed', notifyErr.message);
      }
    }

    return res.status(issuance.alreadyExisted ? 200 : 201).json({
      success: true,
      existing: issuance.alreadyExisted,
      data: certificate,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES QC Certificates: issue failed', err);
    res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Failed to issue certificate' });
  } finally {
    client.release();
  }
});

// POST /api/mes/qc/certificates/:id/revise
router.post('/certificates/:id/revise', authenticate, generalLimiter, requireAnyRole(QC_VERDICT_ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    const certId = asInt(req.params.id);
    if (!certId) {
      return res.status(400).json({ success: false, error: 'Invalid certificate id' });
    }

    const existing = await getCertificateWithRevisions(certId, {}, client);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Certificate not found' });
    }

    const access = ensureRecordDivisionAccess(req, existing.certificate?.division);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, error: access.error });
    }

    await client.query('BEGIN');

    const revised = await reviseCertificate({
      certificateId: certId,
      actorUser: req.user,
      reason: req.body?.reason || 'Certificate revision',
      updates: {
        conditions: req.body?.conditions,
        overall_result: req.body?.overall_result,
        valid_until: req.body?.valid_until,
        test_summary: req.body?.test_summary,
      },
      client,
    });

    await client.query('COMMIT');

    try {
      await notifyCertificateIssued(
        {
          id: revised.incoming_id,
          division: revised.division,
          material_code: revised.material_code,
          material_name: revised.material_name,
          batch_number: revised.batch_number,
          qc_lot_id: revised.qc_lot_id,
        },
        revised,
        { excludeUserId: req.user?.id || null }
      );
    } catch (notifyErr) {
      logger.warn('MES QC Certificates: revision notification failed', notifyErr.message);
    }

    res.json({ success: true, data: revised });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES QC Certificates: revise failed', err);
    res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Failed to revise certificate' });
  } finally {
    client.release();
  }
});

// POST /api/mes/qc/certificates/:id/revoke
router.post('/certificates/:id/revoke', authenticate, generalLimiter, requireAnyRole(['admin', 'qc_manager']), async (req, res) => {
  const client = await pool.connect();
  try {
    const certId = asInt(req.params.id);
    if (!certId) {
      return res.status(400).json({ success: false, error: 'Invalid certificate id' });
    }

    const existing = await getCertificateWithRevisions(certId, {}, client);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Certificate not found' });
    }

    const access = ensureRecordDivisionAccess(req, existing.certificate?.division);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, error: access.error });
    }

    await client.query('BEGIN');

    const revoked = await revokeCertificate({
      certificateId: certId,
      actorUser: req.user,
      reason: req.body?.reason || 'Certificate revoked',
      client,
    });

    await client.query('COMMIT');

    res.json({ success: true, data: revoked });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('MES QC Certificates: revoke failed', err);
    res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Failed to revoke certificate' });
  } finally {
    client.release();
  }
});

module.exports = router;
