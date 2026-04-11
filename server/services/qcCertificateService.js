const crypto = require('crypto');
const logger = require('../utils/logger');
const { pool } = require('../database/config');

const normalizeDivision = (value) => String(value || 'FP').trim().toUpperCase();
const toInt = (value) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

const actorName = (user) => user?.name || user?.full_name || user?.username || user?.email || 'System User';

const makeError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const mapResultToSummary = (row) => ({
  id: row.id,
  parameter_id: row.parameter_id,
  parameter_name: row.parameter_name,
  parameter_code: row.parameter_code,
  unit: row.unit,
  is_ctq: row.is_ctq || false,
  spec_min: row.spec_min,
  spec_target: row.spec_target,
  spec_max: row.spec_max,
  result_value: row.result_value,
  result_text: row.result_text,
  result_status: row.result_status,
  tested_by: row.tested_by,
  tested_by_name: row.tested_by_name,
  tested_by_role: row.tested_by_role,
  test_method: row.test_method,
  equipment_id: row.equipment_id,
  equipment_name: row.equipment_name,
  equipment_calibration_due: row.equipment_calibration_due,
  notes: row.notes,
  tested_at: row.tested_at,
});

async function issueCertificateForIncoming({
  incomingId,
  approvedByUser,
  reason = 'Certificate issued from QC verdict',
  allowExisting = true,
  client = null,
}) {
  const conn = client || pool;
  const ownsTransaction = !client;

  try {
    if (ownsTransaction) await conn.query('BEGIN');

    const normalizedIncomingId = toInt(incomingId);
    if (!normalizedIncomingId) {
      throw makeError('Invalid incoming RM id', 400);
    }

    const incomingResult = await conn.query(
      `SELECT *
       FROM qc_rm_incoming
       WHERE id = $1
       FOR UPDATE`,
      [normalizedIncomingId]
    );

    if (incomingResult.rows.length === 0) {
      throw makeError('Incoming RM record not found', 404);
    }

    const incoming = incomingResult.rows[0];
    const verdict = String(incoming.qc_status || '').trim().toLowerCase();
    if (!['passed', 'conditional'].includes(verdict)) {
      throw makeError('Certificates can only be issued for passed or conditional verdicts', 400);
    }

    if (allowExisting && incoming.certificate_id) {
      const linkedResult = await conn.query(
        `SELECT * FROM qc_certificates WHERE id = $1`,
        [incoming.certificate_id]
      );
      if (linkedResult.rows[0]) {
        if (ownsTransaction) await conn.query('COMMIT');
        return { certificate: linkedResult.rows[0], alreadyExisted: true };
      }
    }

    if (allowExisting) {
      const existingResult = await conn.query(
        `SELECT *
         FROM qc_certificates
         WHERE incoming_id = $1
           AND status IN ('active', 'superseded')
         ORDER BY revision_number DESC, id DESC
         LIMIT 1`,
        [normalizedIncomingId]
      );

      if (existingResult.rows[0]) {
        if (!incoming.certificate_id) {
          await conn.query(
            `UPDATE qc_rm_incoming
             SET certificate_id = $2,
                 updated_at = NOW()
             WHERE id = $1`,
            [normalizedIncomingId, existingResult.rows[0].id]
          );
        }

        if (ownsTransaction) await conn.query('COMMIT');
        return { certificate: existingResult.rows[0], alreadyExisted: true };
      }
    }

    const resultsResult = await conn.query(
      `SELECT
         r.*,
         p.parameter_name,
         p.parameter_code,
         p.unit,
         p.is_ctq,
         p.spec_min,
         p.spec_target,
         p.spec_max
       FROM qc_rm_test_results r
       LEFT JOIN qc_rm_test_parameters p ON p.id = r.parameter_id
       WHERE r.incoming_id = $1
       ORDER BY r.tested_at ASC, r.id ASC`,
      [normalizedIncomingId]
    );

    const testSummary = resultsResult.rows.map(mapResultToSummary);
    const latestResult = resultsResult.rows[resultsResult.rows.length - 1] || null;

    const approvedById = approvedByUser?.id || incoming.verdict_by || null;
    const approvedByName = actorName(approvedByUser) || incoming.verdict_by_name || 'QC Approver';
    if (!approvedById) {
      throw makeError('Certificate issuance requires an approver user id', 400);
    }

    const testedById = latestResult?.tested_by || approvedById;
    const testedByName = latestResult?.tested_by_name || approvedByName;

    const testedDateSource = latestResult?.tested_at || incoming.verdict_at || incoming.completed_at || new Date();
    const testedDate = new Date(testedDateSource);
    const testedDateIso = Number.isNaN(testedDate.getTime())
      ? new Date().toISOString().slice(0, 10)
      : testedDate.toISOString().slice(0, 10);

    const verificationToken = crypto.randomBytes(16).toString('hex');
    const parametersTested = testSummary.length;
    const parametersPassed = testSummary.filter((row) => String(row.result_status || '').toLowerCase() === 'pass').length;

    const insertResult = await conn.query(
      `INSERT INTO qc_certificates (
         certificate_number,
         verification_token,
         certificate_type,
         incoming_id,
         material_code,
         material_name,
         material_type,
         batch_number,
         qc_lot_id,
         supplier_name,
         supplier_code,
         division,
         test_summary,
         parameters_tested,
         parameters_passed,
         overall_result,
         conditions,
         received_date,
         tested_date,
         issued_date,
         tested_by,
         tested_by_name,
         approved_by,
         approved_by_name,
         approved_at,
         status,
         revision_number,
         metadata
       )
       VALUES (
         'COA-' || $1 || '-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(nextval('qc_cert_seq')::TEXT, 5, '0'),
         $2,
         'COA',
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         $11,
         $12::jsonb,
         $13,
         $14,
         $15,
         $16,
         COALESCE($17::date, CURRENT_DATE),
         $18::date,
         CURRENT_DATE,
         $19,
         $20,
         $21,
         $22,
         NOW(),
         'active',
         1,
         COALESCE($23::jsonb, '{}'::jsonb)
       )
       RETURNING *`,
      [
        normalizeDivision(incoming.division),
        verificationToken,
        normalizedIncomingId,
        incoming.material_code,
        incoming.material_name,
        incoming.material_type,
        incoming.batch_number,
        incoming.qc_lot_id,
        incoming.supplier_name,
        incoming.supplier_code,
        normalizeDivision(incoming.division),
        JSON.stringify(testSummary),
        parametersTested,
        parametersPassed,
        verdict,
        verdict === 'conditional' ? incoming.conditional_restriction || null : null,
        incoming.received_date || null,
        testedDateIso,
        testedById,
        testedByName,
        approvedById,
        approvedByName,
        JSON.stringify({
          source: incoming.source,
          verdict_notes: incoming.verdict_notes || null,
          issued_reason: reason,
        }),
      ]
    );

    const certificate = insertResult.rows[0];

    await conn.query(
      `UPDATE qc_rm_incoming
       SET certificate_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [normalizedIncomingId, certificate.id]
    );

    await conn.query(
      `INSERT INTO qc_certificate_revisions (
         certificate_id,
         revision_number,
         action,
         test_summary_snapshot,
         actor_id,
         actor_name,
         reason
       )
       VALUES ($1, $2, 'issued', $3::jsonb, $4, $5, $6)`,
      [
        certificate.id,
        1,
        JSON.stringify(testSummary),
        approvedById,
        approvedByName,
        reason,
      ]
    );

    if (ownsTransaction) await conn.query('COMMIT');
    return { certificate, alreadyExisted: false };
  } catch (err) {
    if (ownsTransaction) {
      try { await conn.query('ROLLBACK'); } catch {}
    }
    throw err;
  }
}

async function listCertificates(filters = {}, client = null) {
  const conn = client || pool;

  const where = [];
  const params = [];
  let idx = 1;

  if (filters.division) {
    where.push(`c.division = $${idx++}`);
    params.push(normalizeDivision(filters.division));
  }

  if (filters.status) {
    where.push(`c.status = $${idx++}`);
    params.push(String(filters.status).trim().toLowerCase());
  }

  if (filters.type) {
    where.push(`c.certificate_type = $${idx++}`);
    params.push(String(filters.type).trim().toUpperCase());
  }

  if (filters.material) {
    const value = `%${String(filters.material).trim()}%`;
    where.push(`(c.material_code ILIKE $${idx} OR c.material_name ILIKE $${idx + 1} OR c.material_type ILIKE $${idx + 2})`);
    params.push(value, value, value);
    idx += 3;
  }

  if (filters.supplier) {
    const value = `%${String(filters.supplier).trim()}%`;
    where.push(`(c.supplier_code ILIKE $${idx} OR c.supplier_name ILIKE $${idx + 1})`);
    params.push(value, value);
    idx += 2;
  }

  if (filters.fromDate) {
    where.push(`c.issued_date >= $${idx++}::date`);
    params.push(String(filters.fromDate).trim());
  }

  if (filters.toDate) {
    where.push(`c.issued_date <= $${idx++}::date`);
    params.push(String(filters.toDate).trim());
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const limit = Math.min(Math.max(toInt(filters.limit) || 50, 1), 500);
  const offset = Math.max(toInt(filters.offset) || 0, 0);

  const totalResult = await conn.query(
    `SELECT COUNT(*)::int AS total FROM qc_certificates c ${whereClause}`,
    params
  );

  const listResult = await conn.query(
    `SELECT
       c.id,
       c.certificate_number,
       c.certificate_type,
       c.incoming_id,
       c.material_code,
       c.material_name,
       c.material_type,
       c.batch_number,
       c.qc_lot_id,
       c.supplier_code,
       c.supplier_name,
       c.division,
       c.parameters_tested,
       c.parameters_passed,
       c.overall_result,
       c.conditions,
       c.status,
       c.revision_number,
       c.issued_date,
       c.valid_until,
       c.approved_by_name,
       c.created_at,
       c.updated_at
     FROM qc_certificates c
     ${whereClause}
     ORDER BY c.issued_date DESC, c.id DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return {
    data: listResult.rows,
    total: totalResult.rows[0]?.total || 0,
    limit,
    offset,
  };
}

async function getCertificateWithRevisions(certificateId, options = {}, client = null) {
  const conn = client || pool;
  const id = toInt(certificateId);
  if (!id) throw makeError('Invalid certificate id', 400);

  const params = [id];
  const where = ['c.id = $1'];
  let idx = 2;

  if (options.division) {
    where.push(`c.division = $${idx++}`);
    params.push(normalizeDivision(options.division));
  }

  const certResult = await conn.query(
    `SELECT c.*, i.qc_status AS incoming_status
     FROM qc_certificates c
     LEFT JOIN qc_rm_incoming i ON i.id = c.incoming_id
     WHERE ${where.join(' AND ')}`,
    params
  );

  if (certResult.rows.length === 0) return null;
  const certificate = certResult.rows[0];

  const revisionResult = await conn.query(
    `SELECT *
     FROM qc_certificate_revisions
     WHERE certificate_id = $1
     ORDER BY revision_number DESC, created_at DESC, id DESC`,
    [id]
  );

  return {
    certificate,
    revisions: revisionResult.rows,
  };
}

async function getCertificateForVerification(verificationToken, client = null) {
  const conn = client || pool;
  const token = String(verificationToken || '').trim();
  if (!token) return null;

  const result = await conn.query(
    `SELECT
       certificate_number,
       certificate_type,
       material_code,
       material_name,
       material_type,
       batch_number,
       qc_lot_id,
       supplier_name,
       supplier_code,
       overall_result,
       conditions,
       issued_date,
       status,
       tested_by_name,
       approved_by_name,
       revision_number,
       division
     FROM qc_certificates
     WHERE verification_token = $1`,
    [token]
  );

  return result.rows[0] || null;
}

async function reviseCertificate({ certificateId, actorUser, reason = null, updates = {}, client = null }) {
  const conn = client || pool;
  const ownsTransaction = !client;

  try {
    if (ownsTransaction) await conn.query('BEGIN');

    const id = toInt(certificateId);
    if (!id) throw makeError('Invalid certificate id', 400);

    const currentResult = await conn.query(
      `SELECT *
       FROM qc_certificates
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (currentResult.rows.length === 0) {
      throw makeError('Certificate not found', 404);
    }

    const current = currentResult.rows[0];
    if (current.status === 'revoked') {
      throw makeError('Revoked certificates cannot be revised', 400);
    }

    const actorId = actorUser?.id || current.approved_by;
    const actor = actorName(actorUser) || current.approved_by_name;

    const nextRevision = Number(current.revision_number || 1) + 1;
    const verificationToken = crypto.randomBytes(16).toString('hex');

    const mergedSummary = updates.test_summary || current.test_summary;
    const summaryArray = Array.isArray(mergedSummary) ? mergedSummary : [];
    const parametersTested = summaryArray.length || Number(current.parameters_tested || 0);
    const parametersPassed = summaryArray.length > 0
      ? summaryArray.filter((row) => String(row.result_status || '').toLowerCase() === 'pass').length
      : Number(current.parameters_passed || 0);

    const overallResult = ['passed', 'conditional'].includes(String(updates.overall_result || '').toLowerCase())
      ? String(updates.overall_result).toLowerCase()
      : current.overall_result;

    const conditions = updates.conditions !== undefined ? updates.conditions : current.conditions;
    const validUntil = updates.valid_until !== undefined ? updates.valid_until : current.valid_until;

    await conn.query(
      `UPDATE qc_certificates
       SET status = 'superseded',
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    const insertResult = await conn.query(
      `INSERT INTO qc_certificates (
         certificate_number,
         verification_token,
         certificate_type,
         incoming_id,
         material_code,
         material_name,
         material_type,
         batch_number,
         qc_lot_id,
         supplier_name,
         supplier_code,
         division,
         test_summary,
         parameters_tested,
         parameters_passed,
         overall_result,
         conditions,
         received_date,
         tested_date,
         issued_date,
         valid_until,
         tested_by,
         tested_by_name,
         approved_by,
         approved_by_name,
         approved_at,
         status,
         revision_number,
         supersedes_id,
         metadata
       )
       VALUES (
         'COA-' || $1 || '-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(nextval('qc_cert_seq')::TEXT, 5, '0'),
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         $11,
         $12,
         $13::jsonb,
         $14,
         $15,
         $16,
         $17,
         $18,
         $19,
         CURRENT_DATE,
         $20,
         $21,
         $22,
         $23,
         $24,
         NOW(),
         'active',
         $25,
         $26,
         COALESCE($27::jsonb, '{}'::jsonb)
       )
       RETURNING *`,
      [
        normalizeDivision(current.division),
        verificationToken,
        current.certificate_type,
        current.incoming_id,
        current.material_code,
        current.material_name,
        current.material_type,
        current.batch_number,
        current.qc_lot_id,
        current.supplier_name,
        current.supplier_code,
        normalizeDivision(current.division),
        JSON.stringify(mergedSummary),
        parametersTested,
        parametersPassed,
        overallResult,
        conditions,
        current.received_date,
        current.tested_date,
        validUntil || null,
        current.tested_by,
        current.tested_by_name,
        actorId,
        actor,
        nextRevision,
        current.id,
        JSON.stringify({
          ...(current.metadata || {}),
          revised_from: current.id,
          revision_reason: reason,
        }),
      ]
    );

    const revised = insertResult.rows[0];

    await conn.query(
      `UPDATE qc_rm_incoming
       SET certificate_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [current.incoming_id, revised.id]
    );

    await conn.query(
      `INSERT INTO qc_certificate_revisions (
         certificate_id,
         revision_number,
         action,
         test_summary_snapshot,
         actor_id,
         actor_name,
         reason
       )
       VALUES ($1, $2, 'superseded', $3::jsonb, $4, $5, $6)`,
      [
        current.id,
        current.revision_number,
        JSON.stringify(current.test_summary),
        actorId,
        actor,
        reason || 'Superseded by revision',
      ]
    );

    await conn.query(
      `INSERT INTO qc_certificate_revisions (
         certificate_id,
         revision_number,
         action,
         test_summary_snapshot,
         actor_id,
         actor_name,
         reason
       )
       VALUES ($1, $2, 'revised', $3::jsonb, $4, $5, $6)`,
      [
        revised.id,
        revised.revision_number,
        JSON.stringify(revised.test_summary),
        actorId,
        actor,
        reason || 'Certificate revised',
      ]
    );

    if (ownsTransaction) await conn.query('COMMIT');
    return revised;
  } catch (err) {
    if (ownsTransaction) {
      try { await conn.query('ROLLBACK'); } catch {}
    }
    throw err;
  }
}

async function revokeCertificate({ certificateId, actorUser, reason = null, client = null }) {
  const conn = client || pool;
  const ownsTransaction = !client;

  try {
    if (ownsTransaction) await conn.query('BEGIN');

    const id = toInt(certificateId);
    if (!id) throw makeError('Invalid certificate id', 400);

    const currentResult = await conn.query(
      `SELECT *
       FROM qc_certificates
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (currentResult.rows.length === 0) {
      throw makeError('Certificate not found', 404);
    }

    const current = currentResult.rows[0];
    if (current.status === 'revoked') {
      if (ownsTransaction) await conn.query('COMMIT');
      return current;
    }

    const actorId = actorUser?.id || current.approved_by || null;
    const actor = actorName(actorUser) || current.approved_by_name || 'System User';

    const updateResult = await conn.query(
      `UPDATE qc_certificates
       SET status = 'revoked',
           revoked_by = $2,
           revoked_at = NOW(),
           revocation_reason = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, actorId, reason || 'Certificate revoked']
    );

    const revoked = updateResult.rows[0];

    await conn.query(
      `INSERT INTO qc_certificate_revisions (
         certificate_id,
         revision_number,
         action,
         test_summary_snapshot,
         actor_id,
         actor_name,
         reason
       )
       VALUES ($1, $2, 'revoked', $3::jsonb, $4, $5, $6)`,
      [
        revoked.id,
        revoked.revision_number,
        JSON.stringify(revoked.test_summary),
        actorId,
        actor,
        reason || 'Certificate revoked',
      ]
    );

    if (ownsTransaction) await conn.query('COMMIT');
    return revoked;
  } catch (err) {
    if (ownsTransaction) {
      try { await conn.query('ROLLBACK'); } catch {}
    }
    throw err;
  }
}

module.exports = {
  issueCertificateForIncoming,
  listCertificates,
  getCertificateWithRevisions,
  getCertificateForVerification,
  reviseCertificate,
  revokeCertificate,
  makeError,
};
