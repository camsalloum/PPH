/**
 * Price Resolver Utility
 *
 * SAP-like costing variant logic for material price resolution.
 * Two profiles: STANDARD (internal costing) and QUOTATION (customer quotes).
 *
 * A1 fix: Uses explicit null-checks instead of || to avoid falsy-zero bug.
 */

/**
 * Resolve material price using SAP-like priority chain.
 * @param {object} item - Item from mes_item_master or fp_actualrmdata
 * @param {'STANDARD'|'QUOTATION'} profile - Costing variant
 * @returns {number} Resolved price per kg
 */
function resolvePrice(item, profile = 'STANDARD') {
  const defined = v => v !== null && v !== undefined;

  if (profile === 'QUOTATION') {
    // ZQT1: Market Reference → MAP → Last PO
    if (defined(item.market_ref_price)) return Number(item.market_ref_price);
    if (defined(item.map_price))        return Number(item.map_price);
    return Number(item.last_po_price) || 0;
  }

  // ZSTD: MAP → Standard → Last PO
  if (defined(item.map_price))      return Number(item.map_price);
  if (defined(item.standard_price)) return Number(item.standard_price);
  return Number(item.last_po_price) || 0;
}

/**
 * Resolve price from fp_actualrmdata (Oracle sync) using weighted average.
 * @param {object} pool - pg Pool instance
 * @param {string} category - Oracle category
 * @param {string} catDesc - Oracle cat line description
 * @param {string} [type] - Oracle type (optional)
 * @returns {Promise<number>} Weighted average cost/kg
 */
async function resolveWeightedAvgPrice(pool, category, catDesc, type = null) {
  const params = [category, catDesc];
  let typeFilter = '';
  if (type) {
    typeFilter = ' AND type = $3';
    params.push(type);
  }

  const { rows } = await pool.query(`
    SELECT COALESCE(
      SUM(actual_amount) / NULLIF(SUM(actual_qty), 0),
      0
    ) AS weighted_avg_price
    FROM fp_actualrmdata
    WHERE category = $1 AND catlinedesc = $2 ${typeFilter}
      AND actual_qty > 0
  `, params);

  return parseFloat(rows[0]?.weighted_avg_price) || 0;
}

module.exports = { resolvePrice, resolveWeightedAvgPrice };
