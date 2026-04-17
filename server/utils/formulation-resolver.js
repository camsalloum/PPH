/**
 * Formulation Resolver — Recursive BOM cost & solids engine
 *
 * Resolves a formulation's effective price_per_kg_wet, price_per_kg_solids,
 * and solids_share_pct by walking the component tree recursively.
 *
 * Key design decisions (per ADHESIVE_FORMULATION_PLAN.md):
 *   - Memoization: Map<formulationId, resolvedTotals> prevents re-resolving the
 *     same sub-formulation more than once per request (A14).
 *   - Max depth = 5 (A16). Exceeding it throws a RangeError.
 *   - Price resolution chain per component: unit_price_override → Oracle stock WA
 *     → Oracle order WA → Oracle combined avg (A11).
 *   - Solids % resolution per component: solids_pct (override) → TDS table → 0
 *     (A12; manual entry required for accuracy but we fall back to 0 rather than
 *     blocking costing).
 *   - Sub-formulation normalization: effective_unit_price = sub_cost / sub_parts,
 *     NOT the raw totals (critical correctness requirement from plan review).
 */

'use strict';

const MAX_BOM_DEPTH = 5;

/**
 * Oracle price resolution: override → stock WA → order WA → combined avg.
 * @param {object} comp - Component row (may include oracle_* price fields)
 * @returns {number}
 */
function resolveItemPrice(comp) {
  if (comp.unit_price_override != null && comp.unit_price_override > 0) {
    return Number(comp.unit_price_override);
  }
  if (comp.stock_cost_wa != null && comp.stock_cost_wa > 0)    return Number(comp.stock_cost_wa);
  if (comp.purchase_cost_wa != null && comp.purchase_cost_wa > 0) return Number(comp.purchase_cost_wa);
  if (comp.avg_cost_wa != null && comp.avg_cost_wa > 0)        return Number(comp.avg_cost_wa);
  return 0;
}

/**
 * Solids % resolution: override → TDS value → 0.
 * @param {object} comp - Component row
 * @returns {number}
 */
function resolveItemSolids(comp) {
  if (comp.solids_pct != null) return Number(comp.solids_pct);
  if (comp.tds_solids_pct != null) return Number(comp.tds_solids_pct);
  return 0;
}

/**
 * Round a number to N decimal places.
 */
function roundTo(n, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

/**
 * Core recursive resolver.
 *
 * @param {object}  pool          - pg Pool
 * @param {number}  formulationId - ID to resolve
 * @param {Map}     memo          - Shared memoization cache across recursive calls
 * @param {Set}     ancestors     - IDs of formulations currently on the call stack (cycle guard)
 * @param {number}  depth         - Current recursion depth
 * @returns {Promise<{total_parts, total_solids, total_cost, price_per_kg_wet, price_per_kg_solids, solids_share_pct}>}
 */
async function resolveFormulation(pool, formulationId, memo, ancestors, depth) {
  if (depth > MAX_BOM_DEPTH) {
    throw new RangeError(`BOM depth exceeds maximum of ${MAX_BOM_DEPTH} levels at formulation #${formulationId}`);
  }

  if (memo.has(formulationId)) return memo.get(formulationId);

  if (ancestors.has(formulationId)) {
    throw new Error(`Circular reference detected at formulation #${formulationId}`);
  }

  // Fetch components, joining Oracle price fields and TDS solids %
  const { rows: components } = await pool.query(`
    SELECT
      fc.id,
      fc.component_type,
      fc.item_key,
      fc.sub_formulation_id,
      fc.component_role,
      fc.parts,
      fc.solids_pct,
      fc.unit_price_override,
      fc.sort_order,
      fc.notes,
      -- Oracle price fields (item components only)
      CASE WHEN fc.component_type = 'item' THEN
        (SELECT COALESCE(SUM(r.maincost * r.mainitemstock) / NULLIF(SUM(r.mainitemstock), 0), 0)
         FROM fp_actualrmdata r
         WHERE LOWER(TRIM(r.mainitem)) = fc.item_key AND r.mainitemstock > 0)
      END AS stock_cost_wa,
      CASE WHEN fc.component_type = 'item' THEN
        (SELECT COALESCE(SUM(r.purchaseprice * r.pendingorderqty) / NULLIF(SUM(r.pendingorderqty), 0), 0)
         FROM fp_actualrmdata r
         WHERE LOWER(TRIM(r.mainitem)) = fc.item_key AND r.pendingorderqty > 0)
      END AS purchase_cost_wa,
      CASE WHEN fc.component_type = 'item' THEN
        (SELECT COALESCE(
          (SUM(r.maincost * r.mainitemstock) + SUM(r.purchaseprice * r.pendingorderqty))
          / NULLIF(SUM(r.mainitemstock) + SUM(r.pendingorderqty), 0), 0)
         FROM fp_actualrmdata r
         WHERE LOWER(TRIM(r.mainitem)) = fc.item_key
           AND (r.mainitemstock > 0 OR r.pendingorderqty > 0))
      END AS avg_cost_wa,
      -- TDS solids % fallback (item components only)
      -- Try mes_spec_adhesives first (direct column), then mes_non_resin_material_specs (JSONB)
      CASE WHEN fc.component_type = 'item' THEN
        COALESCE(
          (SELECT sa.solids_pct
           FROM mes_spec_adhesives sa
           WHERE LOWER(TRIM(COALESCE(NULLIF(sa.mainitem,''), sa.material_key))) = fc.item_key
           LIMIT 1),
          (SELECT COALESCE(
              (nr.parameters_json->>'solids_pct')::NUMERIC,
              (nr.parameters_json->>'solid_pct')::NUMERIC
            )
           FROM mes_non_resin_material_specs nr
           WHERE LOWER(TRIM(COALESCE(NULLIF(nr.mainitem,''), nr.material_key))) = fc.item_key
           ORDER BY nr.created_at DESC LIMIT 1)
        )
      END AS tds_solids_pct
    FROM mes_formulation_components fc
    WHERE fc.formulation_id = $1
    ORDER BY fc.sort_order, fc.id
  `, [formulationId]);

  ancestors.add(formulationId);

  let total_parts  = 0;
  let total_solids = 0;
  let total_cost   = 0;

  const resolvedComponents = [];

  for (const comp of components) {
    const parts = Number(comp.parts) || 0;
    let unit_price = 0;
    let solids_pct = 0;
    let unit_price_source = 'none';
    let solids_pct_source = 'none';

    if (comp.component_type === 'item') {
      unit_price = resolveItemPrice(comp);
      solids_pct = resolveItemSolids(comp);

      if (comp.unit_price_override != null) unit_price_source = 'override';
      else if (comp.stock_cost_wa > 0)      unit_price_source = 'oracle_stock';
      else if (comp.purchase_cost_wa > 0)   unit_price_source = 'oracle_order';
      else if (comp.avg_cost_wa > 0)        unit_price_source = 'oracle_avg';

      if (comp.solids_pct != null)       solids_pct_source = 'override';
      else if (comp.tds_solids_pct != null) solids_pct_source = 'tds';
      else                               solids_pct_source = 'default_zero';

    } else if (comp.component_type === 'formulation') {
      if (!comp.sub_formulation_id) {
        // Orphaned sub-formulation reference (ON DELETE SET NULL) — skip with zero cost
        resolvedComponents.push({
          ...comp,
          unit_price: 0,
          solids_pct: 0,
          unit_price_source: 'none',
          solids_pct_source: 'none',
        });
        continue;
      }
      const sub = await resolveFormulation(pool, comp.sub_formulation_id, memo, ancestors, depth + 1);

      // Normalise: effective price = sub_total_cost / sub_total_parts
      // (NOT raw totals — avoids magnitude mismatch when sub has 209 parts)
      unit_price = sub.total_parts > 0 ? sub.total_cost / sub.total_parts : 0;
      solids_pct = sub.total_parts > 0 ? (sub.total_solids / sub.total_parts) * 100 : 0;
      unit_price_source = 'resolved';
      solids_pct_source = 'resolved';
    }

    const line_cost   = parts * unit_price;
    const line_solids = parts * (solids_pct / 100);

    total_parts  += parts;
    total_cost   += line_cost;
    total_solids += line_solids;

    resolvedComponents.push({
      ...comp,
      parts,
      unit_price:        roundTo(unit_price, 6),
      unit_price_source,
      solids_pct:        roundTo(solids_pct, 4),
      solids_pct_source,
      line_cost:         roundTo(line_cost, 4),
    });
  }

  ancestors.delete(formulationId);

  const result = {
    total_parts:        roundTo(total_parts, 4),
    total_solids:       roundTo(total_solids, 4),
    total_cost:         roundTo(total_cost, 4),
    price_per_kg_wet:   total_parts  > 0 ? roundTo(total_cost  / total_parts,  6) : null,
    price_per_kg_solids: total_solids > 0 ? roundTo(total_cost / total_solids, 6) : null,
    solids_share_pct:   total_parts  > 0 ? roundTo(total_solids / total_parts * 100, 4) : null,
    components: resolvedComponents,
  };

  memo.set(formulationId, result);
  return result;
}

/**
 * Public entry point.
 *
 * @param {object} pool          - pg Pool
 * @param {number} formulationId - Formulation to resolve
 * @returns {Promise<object>}    - Resolved totals + annotated components array
 */
async function resolveFormulationById(pool, formulationId) {
  const memo = new Map();
  const ancestors = new Set();
  return resolveFormulation(pool, formulationId, memo, ancestors, 0);
}

/**
 * Validate that adding subFormulationId as a component of formulationId
 * would NOT create a circular reference. Walks sub-formulation trees.
 *
 * @param {object} pool
 * @param {number} formulationId      - The parent formulation being edited
 * @param {number} subFormulationId   - The proposed sub-formulation to add
 * @returns {Promise<boolean>}        - true = safe, false = would be circular
 */
async function wouldCreateCircle(pool, formulationId, subFormulationId) {
  // BFS/DFS: collect all descendants of subFormulationId
  const visited = new Set();
  const queue = [subFormulationId];

  while (queue.length) {
    const current = queue.shift();
    if (current === formulationId) return true;  // circle detected
    if (visited.has(current)) continue;
    visited.add(current);

    const { rows } = await pool.query(`
      SELECT sub_formulation_id
      FROM mes_formulation_components
      WHERE formulation_id = $1 AND component_type = 'formulation' AND sub_formulation_id IS NOT NULL
    `, [current]);

    for (const row of rows) queue.push(row.sub_formulation_id);
  }

  return false;
}

/**
 * Compute BOM depth of a formulation (max recursion depth in its tree).
 *
 * @param {object} pool
 * @param {number} formulationId
 * @param {number} [currentDepth=0]
 * @returns {Promise<number>}
 */
async function getBomDepth(pool, formulationId, currentDepth = 0) {
  if (currentDepth >= MAX_BOM_DEPTH) return currentDepth;

  const { rows } = await pool.query(`
    SELECT sub_formulation_id
    FROM mes_formulation_components
    WHERE formulation_id = $1 AND component_type = 'formulation' AND sub_formulation_id IS NOT NULL
  `, [formulationId]);

  if (!rows.length) return currentDepth;

  const depths = await Promise.all(
    rows.map(r => getBomDepth(pool, r.sub_formulation_id, currentDepth + 1))
  );
  return Math.max(...depths);
}

module.exports = { resolveFormulationById, wouldCreateCircle, getBomDepth, MAX_BOM_DEPTH };
