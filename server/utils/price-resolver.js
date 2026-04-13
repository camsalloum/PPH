/**
 * Price Resolver Utility
 *
 * Unified pricing policy for material price resolution.
 * Supported sources: COMBINED_WA, STOCK_WA, MARKET_PRICE.
 * Backward compatibility aliases: STANDARD -> COMBINED_WA, QUOTATION -> MARKET_PRICE.
 *
 * A1 fix: Uses explicit null-checks instead of || to avoid falsy-zero bug.
 */

/**
 * Resolve material price using unified source selection.
 * @param {object} item - Item from mes_item_master or fp_actualrmdata
 * @param {'COMBINED_WA'|'STOCK_WA'|'MARKET_PRICE'|'STANDARD'|'QUOTATION'} profile - Pricing source
 * @returns {number} Resolved price per kg
 */
function resolvePrice(item, profile = 'COMBINED_WA') {
  const toNum = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const requested = String(profile || 'COMBINED_WA').trim().toUpperCase();
  const stock = toNum(item.stock_price_wa) ?? toNum(item.stock_price);
  const onOrder = toNum(item.on_order_price_wa) ?? toNum(item.on_order_price);
  const stockQty = toNum(item.stock_qty);
  const orderQty = toNum(item.order_qty);

  let combined = toNum(item.combined_price_wa) ?? toNum(item.avg_price_wa);
  if (combined == null) {
    const hasStockWeighted = stock != null && stockQty != null && stockQty > 0;
    const hasOrderWeighted = onOrder != null && orderQty != null && orderQty > 0;

    if (hasStockWeighted || hasOrderWeighted) {
      const weightedValue = (hasStockWeighted ? stock * stockQty : 0) + (hasOrderWeighted ? onOrder * orderQty : 0);
      const weightedQty = (hasStockWeighted ? stockQty : 0) + (hasOrderWeighted ? orderQty : 0);
      combined = weightedQty > 0 ? (weightedValue / weightedQty) : null;
    }
  }
  if (combined == null) {
    combined = onOrder ?? stock;
  }

  const market = toNum(item.market_price) ?? toNum(item.market_ref_price);

  switch (requested) {
    case 'STOCK':
    case 'STOCK_WA':
    case 'STK':
      return stock ?? combined ?? market ?? onOrder ?? 0;
    case 'MARKET':
    case 'MARKET_PRICE':
    case 'MKT':
    case 'QUOTATION':
      return market ?? combined ?? stock ?? onOrder ?? 0;
    case 'STANDARD':
    case 'COMBINED':
    case 'COMBINED_WA':
    case 'CMB':
    default:
      return combined ?? stock ?? market ?? onOrder ?? 0;
  }
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
