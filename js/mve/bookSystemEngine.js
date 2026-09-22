// mve/bookSystemEngine.js — I/O for the sized system backtest (js/mve/bookSystem.js).
// Pre-registration: MD files/MVE_BOOK_SYSTEM_BACKTEST.md. Same inputs as the audit
// (bookFactorEngine.prepareBookInputs: the frozen 2.0/126 2Y + 10Y sleeves, M1
// closes, weekdays only), four variants of ONE sizing rule on the SAME trades:
//   primary  — hedged off K=2 PCs + basket + net USD ('pcs+usd'), 10% vol target
//   auditHedge — the audit's PC-only hedge ('pcs'), same sizing
//   raw      — unhedged sleeves, same sizing (the incumbent)
//   primary2xCost — primary at 2 bp one-way (cost stress)
// Read-only research: feeds no live signal, bot or order.

import { prepareBookInputs } from './bookFactorEngine.js';
import { runBookSystem, systemMetrics, byPeriod, readSystem, SYSTEM_DEFAULTS } from './bookSystem.js';

function splitMetrics(res, splitDate) {
  const i = Math.max(0, res.dates.findIndex(d => d >= splitDate));
  const part = (lo, hi, tradeFilter) => systemMetrics(res.net.slice(lo, hi), res.dates.slice(lo, hi), {
    leverage: res.leverage.slice(lo, hi), costs: res.cost.slice(lo, hi), usdShare: res.usdShare.slice(lo, hi),
    trades: res.trades.filter(tradeFilter),
  });
  return {
    full: part(0, undefined, () => true),
    IS: part(0, i, t => t.entry < splitDate),      // trades are assigned to the period they were ENTERED in
    OOS: part(i, undefined, t => t.entry >= splitDate),
  };
}

function curve(res, points = 500) {
  const step = Math.max(1, Math.floor(res.dates.length / points));
  let eq = 1, peak = 1; const out = [];
  res.net.forEach((r, i) => {
    eq *= 1 + r; peak = Math.max(peak, eq);
    if (i % step === 0 || i === res.net.length - 1) out.push([res.dates[i], +eq.toFixed(5), +((eq / peak - 1) * 100).toFixed(2)]);
  });
  return out;
}

export async function runSystemBacktest(opts = {}) {
  const inp = await prepareBookInputs(opts);
  const base = { dates: inp.cr.dates, R: inp.cr.R, pairRet: inp.cr.pairRet, closeDates: inp.aligned.dates, trades: inp.trades };
  const o = { ...SYSTEM_DEFAULTS, ...(opts.system || {}) };
  const variants = {
    primary: runBookSystem({ ...base, opts: { ...o, hedgeMode: 'pcs+usd' } }),
    auditHedge: runBookSystem({ ...base, opts: { ...o, hedgeMode: 'pcs' } }),
    raw: runBookSystem({ ...base, opts: { ...o, hedge: false } }),
    primary2xCost: runBookSystem({ ...base, opts: { ...o, hedgeMode: 'pcs+usd', costOneWay: o.costOneWay * 2 } }),
  };
  const splitDate = inp.splitDate || variants.primary.dates[Math.floor(variants.primary.dates.length * 0.6)];
  const metrics = Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, splitMetrics(v, splitDate)]));
  const reading = readSystem(metrics.primary.full, metrics.primary.IS, metrics.primary.OOS, metrics.primary2xCost.full);
  return {
    ok: true, splitDate, config: o, sleeveConfig: inp.cfg, sleeves: inp.sleeveSummary,
    data: { alignedDays: inp.aligned.dates.length, from: inp.aligned.dates[0], to: inp.aligned.dates[inp.aligned.dates.length - 1] },
    reading, metrics,
    yearly: { primary: byPeriod(variants.primary.dates, variants.primary.net, 4), auditHedge: byPeriod(variants.auditHedge.dates, variants.auditHedge.net, 4), raw: byPeriod(variants.raw.dates, variants.raw.net, 4) },
    monthly: byPeriod(variants.primary.dates, variants.primary.net, 7),
    curves: { primary: curve(variants.primary), auditHedge: curve(variants.auditHedge), raw: curve(variants.raw) },
    trades: variants.primary.trades,
  };
}
