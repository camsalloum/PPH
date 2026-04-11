/**
 * MES Pre-Sales — Shared helpers, constants, and re-exported dependencies
 * Used by all route sub-modules in presales/
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { pool, authPool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');
const { notifyQCSamplesReceived, sendCriticalEventEmail } = require('../../../services/emailService');
const { notifyUsers, notifyRoleUsers } = require('../../../services/notificationService');
const { logAudit } = require('../../../utils/auditLogger');

// ── Multer setup for inquiry attachments ────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../../uploads/inquiry-attachments');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${req.params.id}-${ts}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|doc|docx|xls|xlsx|png|jpg|jpeg|gif|bmp|tif|tiff|svg|ai|eps|psd|zip|rar|msg|eml|csv|txt/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    cb(null, allowed.test(ext));
  },
});

const DIVISION = 'FP';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: resolve sales rep group for the logged-in user
// ─────────────────────────────────────────────────────────────────────────────
async function getSalesRepGroup(userId) {
  try {
    const repResult = await authPool.query(
      'SELECT full_name FROM crm_sales_reps WHERE user_id = $1',
      [userId]
    );
    if (repResult.rows.length === 0) return null;

    const fullName = repResult.rows[0].full_name;
    // Exact match only (fail-safe; no fuzzy assignment)
    let groupResult = await pool.query(
      `SELECT id, group_name
       FROM sales_rep_groups
       WHERE division = $1 AND LOWER(TRIM(group_name)) = LOWER(TRIM($2))
       ORDER BY id LIMIT 1`,
      [DIVISION, fullName]
    );
    if (groupResult.rows.length === 0) {
      logger.warn(`getSalesRepGroup: no exact group found for user ${userId}, name=\"${fullName}\"`);
      return null;
    }
    return {
      groupId: groupResult.rows[0].id,
      groupName: groupResult.rows[0].group_name,
    };
  } catch (err) {
    logger.warn('getSalesRepGroup error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function isAdminOrMgmt(user) {
  // Level 6+ only: admin (GM/CEO) + sales_manager (Divisional Manager)
  return ['admin', 'sales_manager'].includes(user?.role);
}

/**
 * Management-level check for sensitive actions (e.g. clearance).
 * admin → always allowed; sales_manager → only if designation_level >= 6.
 */
function isManagement(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'sales_manager' && (Number(user.designation_level) || 0) >= 6) return true;
  return false;
}


// ─────────────────────────────────────────────────────────────────────────────
// Quotation number generator (sequence-based, race-condition safe)
// ─────────────────────────────────────────────────────────────────────────────
async function generateQuotationNumber(client) {
  await client.query('CREATE SEQUENCE IF NOT EXISTS quot_fp_seq START 1');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('quot_fp_seq'))");
  const year = new Date().getFullYear();
  const prefix = `QUOT-FP-${year}-`;
  const seqVal = await client.query('SELECT last_value, is_called FROM quot_fp_seq');
  if (!seqVal.rows[0].is_called) {
    const maxRes = await client.query(
      'SELECT quotation_number FROM mes_quotations WHERE quotation_number LIKE $1 ORDER BY id DESC LIMIT 1',
      [`${prefix}%`]
    );
    if (maxRes.rows.length > 0) {
      const num = parseInt(maxRes.rows[0].quotation_number.replace(prefix, ''), 10);
      if (!isNaN(num) && num > 0) await client.query('SELECT setval(\'quot_fp_seq\', $1)', [num]);
    }
  }
  const nextRes = await client.query('SELECT nextval(\'quot_fp_seq\') AS seq');
  return `${prefix}${String(nextRes.rows[0].seq).padStart(5, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
async function checkInquiryOwnership(user, inquiryId) {
  if (!user) return false;
  if (isAdminOrMgmt(user)) return true;
  if (canAccessQCDashboard(user)) return true;
  const group = await getSalesRepGroup(user.id);
  if (!group) return false;
  const inq = await pool.query(
    'SELECT id FROM mes_presales_inquiries WHERE id = $1 AND sales_rep_group_id = $2',
    [inquiryId, group.groupId]
  );
  return inq.rows.length > 0;
}

const QC_ACCESS_ROLES = ['quality_control', 'qc_manager', 'qc_lab'];
const QC_NOTIFY_ROLES = [...QC_ACCESS_ROLES, 'manager'];
const SALES_NOTIFY_ROLES = ['sales_rep', 'sales_executive', 'sales_coordinator', 'sales_manager', 'manager'];

/** Look up the user_id of the Sales rep who created a given inquiry. */
async function getInquiryOwner(inquiryId, client) {
  const conn = client || pool;
  try {
    const res = await conn.query(
      `SELECT created_by, inquiry_number FROM mes_presales_inquiries WHERE id = $1`,
      [inquiryId]
    );
    return res.rows[0] || null;
  } catch { return null; }
}

function canAccessQCDashboard(user) {
  if (!user) return false;
  if (['admin', 'manager', ...QC_ACCESS_ROLES].includes(user.role)) return true;
  if (user.department === 'QC') return true;
  // Fallback: check designation for users assigned QC titles but a generic role
  if (user.designation && /quality.control|qc/i.test(user.designation)) return true;
  return false;
}

function normalizeQcOverallResult(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase().trim();
  if (['pass', 'fail', 'conditional'].includes(normalized)) return normalized;
  return null;
}

function actorName(user) {
  return user?.name || user?.full_name || user?.username || user?.email || 'System User';
}

function canAccessCSEWorkflow(user) {
  if (!user) return false;
  if (['admin', 'manager', ...QC_ACCESS_ROLES, 'production_manager'].includes(user.role)) return true;
  if (user.department === 'QC') return true;
  return false;
}

function canApproveQCStage(user) {
  if (!user) return false;
  if (['admin', 'manager', ...QC_ACCESS_ROLES].includes(user.role)) return true;
  if (user.department === 'QC') return true;
  return false;
}

function canApproveProductionStage(user) {
  return ['admin', 'manager', 'production_manager'].includes(user?.role);
}

function canApproveQuotation(user) {
  if (!user) return false;
  return isManagement(user);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: log activity on an inquiry
// ─────────────────────────────────────────────────────────────────────────────
async function logActivity(inquiryId, action, details, user, client) {
  const q = `INSERT INTO mes_presales_activity_log
    (inquiry_id, action, details, user_id, user_name)
    VALUES ($1, $2, $3, $4, $5)`;
  const conn = client || pool;
  try {
    await conn.query(q, [
      inquiryId,
      action,
      JSON.stringify(details || {}),
      user?.id || null,
      user?.full_name || user?.name || user?.username || null,
    ]);
  } catch (err) {
    logger.warn('Activity log write failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// G-006 HELPER: insert a revision history entry
// ─────────────────────────────────────────────────────────────────────────────
async function insertCSERevision(client, cseId, cse, action, notes, user) {
  try {
    const revCount = await client.query(
      `SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_rev FROM mes_cse_revisions WHERE cse_id = $1`,
      [cseId]
    );
    const nextRev = revCount.rows[0]?.next_rev || 1;
    await client.query(
      `INSERT INTO mes_cse_revisions
         (cse_id, revision_number, action, actor_id, actor_name, notes, test_summary_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        cseId, nextRev, action,
        user?.id || null, actorName(user), notes || null,
        JSON.stringify({ status: cse.status, overall_result: cse.overall_result || null }),
      ]
    );
  } catch (revErr) {
    logger.warn('MES: could not insert CSE revision record', revErr.message);
  }
}

module.exports = {
  // External dependencies (re-exported for convenience)
  path, fs, crypto,
  pool, authPool, authenticate, logger,
  notifyQCSamplesReceived, sendCriticalEventEmail, notifyUsers, notifyRoleUsers, logAudit,

  // Multer
  upload, UPLOAD_DIR,

  // Constants
  DIVISION, QC_ACCESS_ROLES, QC_NOTIFY_ROLES, SALES_NOTIFY_ROLES,

  // Helper functions
  getSalesRepGroup,
  isAdminOrMgmt,
  isManagement,
  generateQuotationNumber,
  checkInquiryOwnership,
  getInquiryOwner,
  canAccessQCDashboard,
  canAccessCSEWorkflow,
  canApproveQCStage,
  canApproveProductionStage,
  canApproveQuotation,
  normalizeQcOverallResult,
  actorName,
  logActivity,
  insertCSERevision,
};
