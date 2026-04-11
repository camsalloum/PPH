/**
 * H-008: Application-level Audit Logger
 *
 * Captures field-level changes to MES key tables.
 * Usage:
 *   const { logAudit } = require('../utils/auditLogger');
 *   await logAudit(client, 'mes_presales_inquiries', id, 'updated', oldRow, newRow, req.user);
 */

const IGNORED_FIELDS = new Set(['updated_at', 'created_at']);

/**
 * Compute array of field names that actually changed between oldData and newData.
 * @param {object} oldData
 * @param {object} newData
 * @returns {string[]}
 */
function diffFields(oldData, newData) {
  if (!oldData) return Object.keys(newData || {}).filter(k => !IGNORED_FIELDS.has(k));
  const keys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
  const changed = [];
  for (const k of keys) {
    if (IGNORED_FIELDS.has(k)) continue;
    const o = JSON.stringify(oldData[k] ?? null);
    const n = JSON.stringify(newData[k] ?? null);
    if (o !== n) changed.push(k);
  }
  return changed;
}

/**
 * Insert a record into mes_audit_log.
 *
 * @param {import('pg').PoolClient | import('pg').Pool} db  — pool or transaction client
 * @param {string}  tableName   — e.g. 'mes_presales_inquiries'
 * @param {number}  recordId    — the PK of the affected row
 * @param {string}  action      — 'created' | 'updated' | 'deleted'
 * @param {object|null} oldData — row before change (null for inserts)
 * @param {object|null} newData — row after change (null for deletes)
 * @param {object|null} user    — req.user
 */
async function logAudit(db, tableName, recordId, action, oldData, newData, user) {
  try {
    const changed = action === 'updated' ? diffFields(oldData, newData) : null;
    await db.query(
      `INSERT INTO mes_audit_log
         (table_name, record_id, action, changed_fields, old_data, new_data, user_id, user_name, user_role)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)`,
      [
        tableName,
        recordId,
        action,
        changed,
        oldData ? JSON.stringify(oldData) : null,
        newData ? JSON.stringify(newData) : null,
        user?.id   ?? null,
        user?.full_name || user?.username || user?.email || null,
        user?.role  ?? null,
      ]
    );
  } catch (err) {
    // Non-fatal: log to console only
    console.warn('[auditLogger] Failed to write audit record:', err.message);
  }
}

module.exports = { logAudit };
