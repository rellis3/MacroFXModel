// econTrendCore.js — cross-sectional ECONOMIC-trend currency scoring (pure).
//
// THE QUESTION (pre-registered in ECON_TREND_TEST.md — read it before touching
// this): does the trend of a currency's FUNDAMENTALS relative to the USD's —
// short-rate momentum, long-yield momentum, unemployment momentum — predict its
// RELATIVE FX return at a monthly horizon, after costs, versus a random-ranking
// placebo? This is the replicated "economic trend" family (trend on fundamentals,
// not prices), tested in the cross-sectional monthly form the literature supports —
// NOT the per-pair 1–20-day form that already nulled in macroDirectionCore.
//
// The signal touches no price data. Price enters only via the portfolio machinery
// (vol sizing, costs, mark-to-market), which is runTrendBasket's — reused through
// its directionAt hook, never copied. Pure, no network/DOM; fundamentals are passed
// in ALREADY publication-lag-shifted by the caller (js/econTrendEngine.js owns lags).
//
// Fundamental series format: sorted-ascending [{ d:'YYYY-MM-DD', v:number }].
// fundamentals = { USD:{rate:[…],y10:[…],unemp:[…]}, EUR:{…}, … } — factors may be
// missing per currency; a currency needs ≥ minFactors distinct factors to score.

import { mean, stdev } from './statsCore.js';
import { runTrendBasket } from './trendBasketEngine.js';

export const ECON_TREND_DEFAULTS = {
  changeWindows: [90, 180, 365],              // calendar days — fixed, not tuned
  factorSigns: { rate: 1, y10: 1, unemp: -1 },// frozen a priori (policy channel)
  topK: 2, bottomK: 2,                         // long top-2 / short bottom-2
  minFactors: 2,                               // distinct factors a ccy needs to score
  minCcys: 4,                                  // ccys a (factor,window) cell needs to z-score
  lookback: 260,                               // warmup gate only (≈ the 365d factor window)
  rebalDays: 21, volWindow: 60, targetVol: 0.10, costBps: 2, isFrac: 0.6,
  placeboRuns: 200, placeboSeed: 20260717, placeboPctl: 0.90,
};

// ── date + as-of primitives ──────────────────────────────────────────────────
export function shiftDateDays(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().substring(0, 10);
}

// Latest value with d ≤ date (binary search), else null. This is the no-lookahead
// gate: a value dated after `date` is never visible.
export function asOfValue(series, date) {
  if (!series || !series.length || series[0].d > date) return null;
  let lo = 0, hi = series.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (series[mid].d <= date) lo = mid; else hi = mid - 1; }
  const v = series[lo].v;
  return Number.isFinite(v) ? v : null;
}

// Change in a series over `windowDays` ending at `date` (both ends as-of). null if
// either end is unavailable.
export function factorChange(series, date, windowDays) {
  const now = asOfValue(series, date);
  if (now == null) return null;
  const past = asOfValue(series, shiftDateDays(date, -windowDays));
  if (past == null) return null;
  return now - past;
}

// ── cross-sectional scoring ──────────────────────────────────────────────────
// Per (factor, window): each currency's change RELATIVE to USD's, z-scored across
// currencies, multiplied by the factor's frozen sign. A currency's score is the
// mean of its signed z's, and requires ≥ minFactors distinct contributing factors.
// Returns { ccy: number|null }.
export function econScoresAt(fundamentals, date, opts = {}) {
  const o = { ...ECON_TREND_DEFAULTS, ...opts };
  const usd = fundamentals.USD || {};
  const ccys = Object.keys(fundamentals).filter(c => c !== 'USD');
  const buckets = Object.fromEntries(ccys.map(c => [c, { zs: [], factors: new Set() }]));

  for (const [factor, sign] of Object.entries(o.factorSigns)) {
    const usdSeries = usd[factor];
    if (!usdSeries) continue;                          // relative-to-USD needs the USD leg
    for (const w of o.changeWindows) {
      const usdChg = factorChange(usdSeries, date, w);
      if (usdChg == null) continue;
      const rel = [];
      for (const c of ccys) {
        const chg = factorChange(fundamentals[c]?.[factor], date, w);
        if (chg != null) rel.push([c, chg - usdChg]);
      }
      if (rel.length < o.minCcys) continue;
      const vals = rel.map(x => x[1]);
      const m = mean(vals), s = stdev(vals, 0);
      if (!(s > 1e-12)) continue;                      // degenerate cross-section
      for (const [c, x] of rel) {
        buckets[c].zs.push(sign * (x - m) / s);
        buckets[c].factors.add(factor);
      }
    }
  }

  const scores = {};
  for (const c of ccys) {
    const b = buckets[c];
    scores[c] = (b.zs.length && b.factors.size >= o.minFactors) ? mean(b.zs) : null;
  }
  return scores;
}

// Rank non-null scores → { ccy: +1 (top-K) | -1 (bottom-K) | 0 }. All-flat if the
// ranked cross-section is too thin to mean anything.
export function econDirections(scores, opts = {}) {
  const o = { ...ECON_TREND_DEFAULTS, ...opts };
  const ranked = Object.entries(scores)
    .filter(([, v]) => v != null)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));  // ties broken deterministically
  const dirs = Object.fromEntries(Object.keys(scores).map(c => [c, 0]));
  if (ranked.length < Math.max(o.minCcys, o.topK + o.bottomK)) return dirs;
  for (let i = 0; i < o.topK; i++) dirs[ranked[i][0]] = 1;
  for (let i = 0; i < o.bottomK; i++) dirs[ranked[ranked.length - 1 - i][0]] = -1;
  return dirs;
}

// ── the real run ─────────────────────────────────────────────────────────────
// seriesByCcy: daily closes of each currency vs USD (trendBasketEngine format).
export function runEconTrend(seriesByCcy, fundamentals, opts = {}) {
  const o = { ...ECON_TREND_DEFAULTS, ...opts };
  const directionAt = (iDec, ctx) =>
    econDirections(econScoresAt(fundamentals, ctx.dates[iDec], o), o);
  const res = runTrendBasket(seriesByCcy, {
    lookback: o.lookback, volWindow: o.volWindow, targetVol: o.targetVol,
    rebalDays: o.rebalDays, costBps: o.costBps, isFrac: o.isFrac, directionAt,
  });
  if (res.error) return res;
  const lastDate = res.last;
  return {
    ...res,
    econParams: {
      changeWindows: o.changeWindows, factorSigns: o.factorSigns,
      topK: o.topK, bottomK: o.bottomK, minFactors: o.minFactors, minCcys: o.minCcys,
    },
    currentScores: econScoresAt(fundamentals, lastDate, o),
  };
}

// ── placebo: identical machinery, random ranks ───────────────────────────────
// Deterministic LCG so runs are reproducible (no Math.random).
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function randomDirections(ccys, rand, topK, bottomK) {
  const shuffled = ccys.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const dirs = Object.fromEntries(ccys.map(c => [c, 0]));
  for (let i = 0; i < topK && i < shuffled.length; i++) dirs[shuffled[i]] = 1;
  for (let i = 0; i < bottomK && topK + i < shuffled.length; i++) dirs[shuffled[topK + i]] = -1;
  return dirs;
}

// nRuns placebo portfolios; returns their OOS Sharpes (the chance floor).
export function runEconTrendPlacebo(seriesByCcy, opts = {}) {
  const o = { ...ECON_TREND_DEFAULTS, ...opts };
  const sharpes = [];
  for (let run = 0; run < o.placeboRuns; run++) {
    const rand = lcg(o.placeboSeed + run * 7919);
    const directionAt = (iDec, ctx) => randomDirections(ctx.ccys, rand, o.topK, o.bottomK);
    const res = runTrendBasket(seriesByCcy, {
      lookback: o.lookback, volWindow: o.volWindow, targetVol: o.targetVol,
      rebalDays: o.rebalDays, costBps: o.costBps, isFrac: o.isFrac, directionAt,
    });
    if (!res.error && res.oos) sharpes.push(res.oos.sharpe);
  }
  sharpes.sort((a, b) => a - b);
  return {
    sharpes,
    summary: sharpes.length ? {
      n: sharpes.length,
      p50: sharpes[Math.floor(sharpes.length * 0.5)],
      p90: sharpes[Math.floor(sharpes.length * 0.9)],
      min: sharpes[0], max: sharpes[sharpes.length - 1],
    } : null,
  };
}

// ── the frozen verdict (criteria mirror ECON_TREND_TEST.md — do not edit after
// results exist) ──────────────────────────────────────────────────────────────
export function evaluateEconTrend(real, placeboSharpes, opts = {}) {
  const o = { ...ECON_TREND_DEFAULTS, ...opts };
  if (!real || real.error || !real.oos) return { pass: false, error: real?.error || 'no result' };
  const oosSharpe = real.oos.sharpe, isSharpe = real.is.sharpe;
  const below = placeboSharpes.filter(s => s <= oosSharpe).length;
  const placeboPctlRank = placeboSharpes.length ? below / placeboSharpes.length : null;

  // complete OOS years = calendar years strictly after the split year (the split
  // year itself is partial on both sides and counted for neither).
  const splitYear = real.splitDate ? real.splitDate.slice(0, 4) : null;
  const oosYears = splitYear ? real.perYear.filter(y => y.year > splitYear) : [];
  const oosYearsPos = oosYears.filter(y => y.ret > 0).length;

  const c = {
    oosSharpePositive: oosSharpe > 0,
    beatsPlacebo: placeboPctlRank != null && placeboPctlRank >= o.placeboPctl,
    oosYearsMajorityPositive: oosYears.length > 0 && oosYearsPos > oosYears.length / 2,
    isSharpePositive: isSharpe > 0,
  };
  return {
    pass: Object.values(c).every(Boolean),
    criteria: c,
    oosSharpe, isSharpe, placeboPctlRank,
    oosYears: oosYears.length, oosYearsPos,
  };
}
