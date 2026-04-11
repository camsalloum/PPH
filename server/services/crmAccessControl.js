/**
 * CRM Access Control — rep scope query helpers.
 *
 * Structural prevention of the P0-1 parameterisation bug: all placeholders
 * are built with `$${paramIndex}` syntax so the dollar-sign prefix can never
 * be accidentally omitted.
 *
 * Exports:
 *   - buildRepScopeWhereClause(rep, paramIndex) — builds a WHERE clause fragment scoped to a rep's group
 */

/**
 * Build a SQL WHERE clause fragment that scopes a query to a sales rep's
 * customer group.
 *
 * When the rep has a `groupId` (direct mapping), the clause matches on
 * `sales_rep_group_id` with a fallback to ILIKE on `primary_sales_rep_name`
 * for customers that haven't been assigned a group yet.
 *
 * When the rep has no `groupId`, the clause falls back to ILIKE matching
 * on `primary_sales_rep_name` only.
 *
 * @param {{ groupId: number|null, firstName: string }} rep
 * @param {number} paramIndex — the next available $N placeholder index
 * @returns {{ conditions: string[], params: any[], nextIndex: number }}
 */
function buildRepScopeWhereClause(rep, paramIndex) {
  const conditions = [];
  const params = [];

  if (rep.groupId) {
    conditions.push(
      `(cu.sales_rep_group_id = $${paramIndex} OR (cu.sales_rep_group_id IS NULL AND cu.primary_sales_rep_name ILIKE $${paramIndex + 1}))`
    );
    params.push(rep.groupId, `%${rep.firstName}%`);
    return { conditions, params, nextIndex: paramIndex + 2 };
  }

  conditions.push(`cu.primary_sales_rep_name ILIKE $${paramIndex}`);
  params.push(`%${rep.firstName}%`);
  return { conditions, params, nextIndex: paramIndex + 1 };
}

module.exports = { buildRepScopeWhereClause };
