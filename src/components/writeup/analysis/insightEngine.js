// analysis/insightEngine.js (FULL FILE)

/**
 * Score and rank insights so the write-up leads with what matters.
 * impact ~ |delta_abs| weighted by delta_pct; penalize volatility; scale by confidence.
 */
export function scoreInsight({ deltaAbs = 0, deltaPct = 0, volatility = 0, confidence = 0.8 }) {
  const impact = Math.abs(deltaAbs) * (0.5 + Math.min(Math.abs(deltaPct), 1));
  const penalty = 1 + Math.max(0, Math.min(10, volatility));   // cap penalty growth
  return (impact * Math.max(0, Math.min(1, confidence))) / penalty;
}

export function rankInsights(insights = []) {
  return insights
    .map(i => ({ ...i, score: scoreInsight(i) }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Build a normalized insight list from the fact pack.
 * You can extend this to include customer/country/product specifics.
 */
export function buildInsights(factPack = {}) {
  const ins = [];
  const { kpi = {}, targets = {}, revenue_pvm = {}, cogs_drivers = {}, anomalies = [], volatility_hints = [] } = factPack;
  const vol = (name) => (volatility_hints.find(v => v.metric === name)?.volatility ?? 0.1);

  if (revenue_pvm?.total) {
    const { price = 0, volume = 0, mix = 0 } = revenue_pvm.total;
    const deltaAbs = price + volume + mix;
    const deltaPct = kpi?.sales ? deltaAbs / Math.max(1, kpi.sales) : 0;
    ins.push({
      metric: 'Revenue',
      title: 'Revenue moved',
      deltaAbs, deltaPct,
      drivers: [{ key: 'Price', v: price }, { key: 'Volume', v: volume }, { key: 'Mix', v: mix }],
      confidence: 0.85, volatility: vol('sales')
    });
  }

  if (typeof kpi?.gp_pct === 'number' && typeof targets?.gp_pct === 'number') {
    const diff = (kpi.gp_pct - targets.gp_pct);
    ins.push({
      metric: 'GP% vs Target',
      title: 'Gross margin vs target',
      deltaAbs: diff, deltaPct: diff / Math.max(1, targets.gp_pct),
      drivers: Object.entries(cogs_drivers).map(([k, v]) => ({ key: k, v })),
      confidence: 0.8, volatility: vol('gp_pct')
    });
  }

  anomalies.forEach(a => ins.push({
    metric: 'Anomaly',
    title: a.signal, deltaAbs: 0, deltaPct: 0, drivers: [], confidence: 0.7, volatility: 0.2
  }));

  return rankInsights(ins);
}

