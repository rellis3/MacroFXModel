// multi-spread sleeve — pure core (no I/O, no network).
//
// Generalizes the validated 2Y yield-spread mean-reversion (js/yieldSpreadCore.js +
// js/yieldSpreadEngine.js — VALIDATED, FROZEN, see MD files/YIELD_SPREAD_STRATEGY.md;
// this file does not modify or re-derive anything there) to OTHER tenor spreads, run
// as a separate, pre-registered sleeve (MD files/MULTI_SPREAD_SLEEVE.md). Same
// mechanism, same audits, new spread definitions only.
//
// What's new here, not in yieldSpreadCore.js:
//   - SPREAD_DEFS construction: which FRED series pair defines "the spread" for a
//     given tenor. `y2` reuses the validated sleeve's own ZSCORE_PAIRS table
//     byte-identical (not re-derived); `y10` is new.
//   - Diversification diagnostics: does a second spread tenor add a genuinely
//     different bet, or just relabel the 2Y trade a few days later? Three measures:
//     z-series correlation (cheap intuition check), trade-level entry/direction
//     overlap (the direct "same bet, same day" test), and the equal-risk combined-
//     portfolio Sharpe (the only honest answer to "is this worth running together" —
//     each leg at half size so total capital-at-risk matches ONE sleeve alone).
//
// Pure + unit-tested (js/multiSpreadCore.test.mjs); the real run needs FRED + M1 +
// OANDA/R2 on Railway (analysis/multi_spread_sleeve.mjs).

import {
  directionFromZ, resolveInverted, zTierSize, zTierLabel, shouldExit, tradeReturn,
  summarizeYieldSpread, sharpeFromDaily, perYearBreakdown, splitByDate,
  YIELD_SPREAD_DEFAULTS,
} from './yieldSpreadCore.js';

export {
  directionFromZ, resolveInverted, zTierSize, zTierLabel, shouldExit, tradeReturn,
  summarizeYieldSpread, sharpeFromDaily, perYearBreakdown, splitByDate,
  YIELD_SPREAD_DEFAULTS,
};

// US leg per spread tenor. Foreign legs are per-pair (buildSpreadDefs below).
export const US_SERIES = {
  y2:  'GS2',    // identical to the validated sleeve's US leg
  y10: 'DGS10',  // FRED daily 10Y constant maturity
};

// Foreign 10Y leg per pair — the OECD "IRLTLT01<CC>M156N" long-term government bond
// monthly family. DE/GB/JP/AU are the SAME series ids js/mve/liveAdapter.js's
// FRED_ID already fetches (de10y/gb10y/jp10y/au10y) — proven to exist on FRED, though
// that module is its own isolated corner (js/ouCore.js: "retired MVE corner, null
// verdict") so nothing is imported from it, only the series ids are reused by
// convention. CA/CH are NEW here — not yet pulled live in this repo. The validated
// sleeve's own history is a direct warning about this exact series family: USDCHF's
// 2Y foreign leg (IRSTCI01CHM156N) was discontinued on FRED with no error, and
// forward-fill hid it silently until someone checked `asOf`
// (MD files/YIELD_SPREAD_STRATEGY.md §5). Spot-check CA/CH `asOf` on first live run —
// do not trust a non-null z as proof the series is current.
export const FOREIGN_Y10_SERIES = {
  usdjpy: 'IRLTLT01JPM156N',
  eurusd: 'IRLTLT01DEM156N',
  gbpusd: 'IRLTLT01GBM156N',
  audusd: 'IRLTLT01AUM156N',
  usdcad: 'IRLTLT01CAM156N',   // NOT yet spot-checked live — verify asOf on first run
  usdchf: 'IRLTLT01CHM156N',   // NOT yet spot-checked live — verify asOf on first run
};

// Builds { y2: { pairKey: {baseSeries, quoteSeries, pip, label, pairDisplay} }, y10: {...} }
// from the validated sleeve's own ZSCORE_PAIRS table (passed in, never duplicated) so
// a future change to that table can't silently drift out of sync with this one.
export function buildSpreadDefs(zscorePairs) {
  const defs = {};
  for (const spreadType of Object.keys(US_SERIES)) {
    defs[spreadType] = {};
    for (const pairKey of Object.keys(zscorePairs)) {
      const cfg = zscorePairs[pairKey];
      const quoteSeries = spreadType === 'y2' ? cfg.quoteSeries : FOREIGN_Y10_SERIES[pairKey];
      if (!quoteSeries) continue;
      defs[spreadType][pairKey] = {
        baseSeries: US_SERIES[spreadType], quoteSeries,
        pip: cfg.pip, label: cfg.label, pairDisplay: cfg.pairDisplay,
      };
    }
  }
  return defs;
}

// ── diversification diagnostics ──────────────────────────────────────────────────

// Pearson correlation of two aligned arrays (index-aligned; null/NaN pairs dropped).
// Returns null if fewer than 3 usable pairs (not enough to mean anything).
export function correlation(a, b) {
  const xs = [], ys = [];
  const n0 = Math.min(a.length, b.length);
  for (let i = 0; i < n0; i++) {
    const x = a[i], y = b[i];
    if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
  }
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  return denom > 0 ? +(sxy / denom).toFixed(3) : null;
}

// Does spread-type B's trade set fire on (near) the same days, same direction, same
// pair, as A's — i.e. is B mostly relabeling A's bet? `windowDays` tolerates the
// z-crossing landing a day or two apart between two correlated-but-distinct spreads.
// Returns the fraction of A's trades that have a matching B trade nearby.
export function tradeOverlap(tradesA, tradesB, { windowDays = 2 } = {}) {
  if (!tradesA.length) return { n: 0, overlapping: 0, overlapPct: 0 };
  if (!tradesB.length) return { n: tradesA.length, overlapping: 0, overlapPct: 0 };
  const toDay = d => Math.floor(new Date(d + 'T00:00:00Z').getTime() / 86_400_000);
  const bByPair = new Map();
  for (const t of tradesB) {
    if (!bByPair.has(t.pair)) bByPair.set(t.pair, []);
    bByPair.get(t.pair).push({ day: toDay(t.date), dir: t.dir });
  }
  let overlapping = 0;
  for (const t of tradesA) {
    const day = toDay(t.date);
    const candidates = bByPair.get(t.pair) || [];
    if (candidates.some(c => c.dir === t.dir && Math.abs(c.day - day) <= windowDays)) overlapping++;
  }
  return { n: tradesA.length, overlapping, overlapPct: +(overlapping / tradesA.length * 100).toFixed(1) };
}

// Honest combined-portfolio comparison: each leg at `weights[type]` (default equal,
// summing to 1 — total capital-at-risk matches running ONE sleeve alone, not stacked
// on top of each other). `dailyStreamsByType`: { y2: {dates, dailyReturns}, y10: {...} }
// — flat-sized daily return streams, as produced by a book's `combined.daily`.
export function combinedPortfolioStats(dailyStreamsByType, { weights, periodsPerYear = 252 } = {}) {
  const types = Object.keys(dailyStreamsByType);
  const w = weights || Object.fromEntries(types.map(t => [t, 1 / types.length]));
  const dateSet = new Set();
  for (const t of types) for (const d of dailyStreamsByType[t].dates) dateSet.add(d);
  const dates = [...dateSet].sort();

  const byType = {};
  for (const t of types) {
    const { dates: dts, dailyReturns } = dailyStreamsByType[t];
    const m = new Map(dts.map((d, i) => [d, dailyReturns[i]]));
    byType[t] = dates.map(d => m.get(d) ?? 0);
  }

  const combined = dates.map((_, i) => types.reduce((s, t) => s + w[t] * byType[t][i], 0));

  const legSharpe = {};
  for (const t of types) legSharpe[t] = sharpeFromDaily(byType[t], periodsPerYear);

  const returnCorrelation = {};
  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      returnCorrelation[`${types[i]}_${types[j]}`] = correlation(byType[types[i]], byType[types[j]]);
    }
  }

  return {
    dates, weights: w, legSharpe,
    combinedSharpe: sharpeFromDaily(combined, periodsPerYear),
    returnCorrelation,
  };
}
