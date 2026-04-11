// analysis/pvm.js (FULL FILE)

/**
 * Basic Price–Volume–Mix decomposition for revenue.
 * Provide vectors per SKU (same length) for base and current.
 * priceVec = unit price; qtyVec = quantity; mixVec = distribution weights (sum to 1).
 */

export function pvmRevenue({ basePriceVec = [], baseQtyVec = [], curPriceVec = [], curQtyVec = [] }) {
  const sum = (a) => a.reduce((s, v) => s + (Number(v) || 0), 0);
  const dot = (a, b) => a.reduce((s, v, i) => s + (Number(v) || 0) * (Number(b[i]) || 0), 0);

  const baseQty = sum(baseQtyVec);
  const curQty  = sum(curQtyVec);

  // Normalize mixes to 1 (avoid zero-div)
  const norm = (arr) => {
    const total = Math.max(1e-9, sum(arr));
    return arr.map(v => (Number(v) || 0) / total);
  };
  const baseMix = norm(baseQtyVec);
  const curMix  = norm(curQtyVec);

  // Baseline revenue and current revenue
  const revBase = dot(basePriceVec, baseQtyVec);
  const revCur  = dot(curPriceVec, curQtyVec);

  // Price effect at current quantity mix
  const price = dot(curPriceVec.map((p, i) => p - (basePriceVec[i] || 0)), curQtyVec);

  // Volume effect at base price, base mix
  const volume = (curQty - baseQty) * (revBase / Math.max(1e-9, baseQty));

  // Mix effect: redistribute current qty using base vs current mix
  const basePricePerSku = basePriceVec;
  const mix = dot(curMix.map((m, i) => m - baseMix[i]), basePricePerSku) * curQty;

  return { price, volume, mix, revBase, revCur };
}

