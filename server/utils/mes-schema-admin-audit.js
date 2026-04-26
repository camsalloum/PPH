/**
 * MES Schema Admin Audit — write helper
 * Phase 8 of MATERIAL_SPECS_AND_PARSER_CONSOLIDATED_FIX_PLAN_2026-04-24.md
 *
 * Records every CREATE/UPDATE/DELETE on mes_parameter_definitions and
 * mes_category_mapping. Failures are logged but never thrown (audit must
 * not break the user's actual operation).
 */
const { pool } = require('../database/config');
const logger = require('./logger');

function diffSummary(before, after) {
  if (!before && after) return 'created';
  if (before && !after) return 'deleted';
  if (!before || !after) return '';
  const changes = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    const ja = JSON.stringify(a);
    const jb = JSON.stringify(b);
    if (ja !== jb) changes.push(`${k}: ${ja ?? 'null'} → ${jb ?? 'null'}`);
  }
  return changes.slice(0, 8).join('; ') + (changes.length > 8 ? ` (+${changes.length - 8} more)` : '');
}

/**
 * Record a schema admin change.
 * @param {string} entityType  'parameter_definition' | 'category_mapping'
 * @param {string} action      'create' | 'update' | 'delete'
 * @param {object} req         Express req (for req.user)
 * @param {object|null} before Snapshot before change (null for create)
 * @param {object|null} after  Snapshot after change  (null for delete)
 */
async function recordSchemaAdminChange(entityType, action, req, before, after) {
  try {
    const user = req?.user || {};
    const entityId = (after && after.id) || (before && before.id) || null;
    await pool.query(
      `INSERT INTO mes_schema_admin_audit
         (entity_type, entity_id, action, actor_id, actor_email, actor_role,
          before_json, after_json, diff_summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        entityType, entityId, action,
        user.id || null, user.email || null, user.role || null,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        diffSummary(before, after).slice(0, 1000),
      ]
    );
  } catch (err) {
    logger.warn('[schema-audit] failed to record change', {
      entityType, action, error: err.message,
    });
  }
}

module.exports = { recordSchemaAdminChange };
