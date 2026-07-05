// ── creditLeadLagEngine.js ────────────────────────────────────────────────────
// The honest study behind the credit gate: DOES credit-Δ lead NQ realized vol,
// and does it add anything BEYOND vol's own persistence? Pure functions — you
// pass in aligned daily series (the server route supplies FRED HY OAS + OANDA
// NAS100 bars); nothing here fetches. Offline-testable: the unit test plants a
// known lead and confirms the study recovers it.
//
// Method (docs/CREDIT_SIGNAL_SPEC.md §4):
//   predictor(t)  = credit features at t (velocity / level-percentile / accel /
//                   HMM stress prob) from creditCore + creditHmm
//   target(t)     = NQ forward realized vol over (t, t+h]
//   lead-lag      = Pearson corr of predictor(t) vs target(t+k), t-stat per lag
//   verdict       = IS/OOS information coefficient (rank corr) + hit-rate, with
//                   LAGGED VOL as the benchmark predictor — credit only "wins"
//                   if it beats vol-predicts-vol out of sample.
//
// This is a *forecast-quality* study (does the signal have predictive IC), not a
// tradeable-PnL backtest, because the target is a vol level, not a traded price.

import { creditFeatures } from './creditCore.js';
import { creditRegime } from './creditHmm.js';

const clean = a => a.filter(Number.isFinite);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

// ── Pearson r + two-sided t-stat over paired finite points ────────────────────
export function pearson(xs, ys) {
  const pairs = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++)
    if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) pairs.push([xs[i], ys[i]]);
  const n = pairs.length;
  if (n < 4) return { r: null, t: null, n };
  const mx = mean(pairs.map(p => p[0])), my = mean(pairs.map(p => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (sxx <= 0 || syy <= 0) return { r: null, t: null, n };
  const r = sxy / Math.sqrt(sxx * syy);
  const t = r * Math.sqrt((n - 2) / Math.max(1 - r * r, 1e-12));
  return { r, t, n };
}

// Spearman (rank) correlation — the information coefficient we report OOS.
export function spearman(xs, ys) {
  const pairs = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++)
    if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) pairs.push([xs[i], ys[i], i]);
  const n = pairs.length;
  if (n < 4) return { ic: null, n };
  const rank = vals => {
    const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const rk = new Array(vals.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j < idx.length && idx[j][0] === idx[i][0]) j++;
      const avg = (i + j - 1) / 2 + 1; for (let k = i; k < j; k++) rk[idx[k][1]] = avg; i = j; }
    return rk;
  };
  const rx = rank(pairs.map(p => p[0])), ry = rank(pairs.map(p => p[1]));
  return { ic: pearson(rx, ry).r, n };
}

// ── NQ forward realized vol: annualized std of daily log returns over (t, t+h] ─
// Returns an array aligned to `closes`; index t = vol computed from returns
// strictly AFTER t (no lookahead into the predictor). Tail entries are null.
export function forwardRealizedVol(closes, horizon = 5, ann = 252) {
  const T = closes.length;
  const ret = new Array(T).fill(null);
  for (let t = 1; t < T; t++) if (closes[t] > 0 && closes[t - 1] > 0) ret[t] = Math.log(closes[t] / closes[t - 1]);
  const out = new Array(T).fill(null);
  for (let t = 0; t < T; t++) {
    const win = [];
    for (let k = t + 1; k <= t + horizon && k < T; k++) if (ret[k] != null) win.push(ret[k]);
    if (win.length >= Math.max(2, horizon - 1)) {
      const m = mean(win);
      const v = win.reduce((s, r) => s + (r - m) ** 2, 0) / (win.length - 1);
      out[t] = Math.sqrt(v * ann);
    }
  }
  return out;
}

// ── Trailing realized vol over (t-h, t] — the autocorrelation benchmark ───────
export function trailingRealizedVol(closes, horizon = 5, ann = 252) {
  const T = closes.length;
  const ret = new Array(T).fill(null);
  for (let t = 1; t < T; t++) if (closes[t] > 0 && closes[t - 1] > 0) ret[t] = Math.log(closes[t] / closes[t - 1]);
  const out = new Array(T).fill(null);
  for (let t = 0; t < T; t++) {
    const win = [];
    for (let k = t; k > t - horizon && k >= 1; k--) if (ret[k] != null) win.push(ret[k]);
    if (win.length >= Math.max(2, horizon - 1)) {
      const m = mean(win);
      out[t] = Math.sqrt(win.reduce((s, r) => s + (r - m) ** 2, 0) / (win.length - 1) * ann);
    }
  }
  return out;
}

// ── Build the credit predictor series from the HY OAS history ─────────────────
// hySeries: number[] (oldest→newest, pct-points), aligned 1:1 with the target dates.
// Returns { velocity5, levelPct, accel, stressProb } arrays aligned to hySeries;
// each computed causally from data ≤ t (expanding-window features).
export function creditPredictors(hySeries, { minHist = 30, hmmMinHist = 60 } = {}) {
  const T = hySeries.length;
  const velocity5 = new Array(T).fill(null);
  const levelPct = new Array(T).fill(null);
  const accel = new Array(T).fill(null);
  const stressProb = new Array(T).fill(null);
  let lastStress = null;
  for (let t = 0; t < T; t++) {
    if (t + 1 < minHist) continue;
    const hist = hySeries.slice(0, t + 1);          // data up to and including t only
    const f = creditFeatures(hist);
    if (!f) continue;
    velocity5[t] = f.d5;
    levelPct[t] = f.pct;
    accel[t] = f.accel;
    // HMM persistence: refit every 5 days (expensive) and forward-fill between.
    if (t + 1 >= hmmMinHist && ((t % 5 === 0) || lastStress == null)) {
      const reg = creditRegime(hist.slice(-260), { iters: 80 });
      if (reg) lastStress = reg.curStressProb;
    }
    if (t + 1 >= hmmMinHist) stressProb[t] = lastStress;
  }
  return { velocity5, levelPct, accel, stressProb };
}

// ── Lead-lag correlation table: corr(driver[t], target[t+k]) for k in ±maxLag ──
export function leadLagTable(driver, target, maxLag = 10) {
  const rows = [];
  for (let k = -maxLag; k <= maxLag; k++) {
    const xs = [], ys = [];
    for (let t = 0; t < driver.length; t++) {
      const tt = t + k;
      if (tt < 0 || tt >= target.length) continue;
      xs.push(driver[t]); ys.push(target[tt]);
    }
    const { r, t, n } = pearson(xs, ys);
    rows.push({ lag: k, r, t, n });   // lag>0 ⇒ driver leads target
  }
  return rows;
}

// ── Full study ────────────────────────────────────────────────────────────────
// opts: { horizon=5, maxLag=10, oosFrac=0.35, minHist=30 }
// hySeries & nqCloses must be ALIGNED (same dates, same length). The route aligns
// FRED HY OAS and OANDA NAS100 by date before calling.
export function runCreditLeadLag(hySeries, nqCloses, opts = {}) {
  const { horizon = 5, maxLag = 10, oosFrac = 0.35, minHist = 30 } = opts;
  const T = Math.min(hySeries.length, nqCloses.length);
  if (T < minHist + horizon + 60) return { ok: false, error: `not enough aligned data (${T} rows)` };

  const hy = hySeries.slice(0, T), nq = nqCloses.slice(0, T);
  const coverage = { rows: T, hyFinite: clean(hy).length, nqFinite: clean(nq).length };
  if (coverage.hyFinite < T * 0.8 || coverage.nqFinite < T * 0.8)
    return { ok: false, error: 'poor coverage after alignment', coverage };

  const target = forwardRealizedVol(nq, horizon);          // NQ forward realized vol
  const preds = creditPredictors(hy, { minHist });
  const pastVol = trailingRealizedVol(nq, horizon);        // vol's own persistence (autocorrelation benchmark)

  // Lead-lag table on the headline velocity predictor.
  const table = leadLagTable(preds.velocity5, target, maxLag);

  // IS/OOS split (chronological).
  const split = Math.floor(T * (1 - oosFrac));
  const slice = (arr, a, b) => arr.slice(a, b);
  const icOf = (drv) => {
    const isIC = spearman(slice(drv, minHist, split), slice(target, minHist, split));
    const oosIC = spearman(slice(drv, split, T), slice(target, split, T));
    return { is: isIC, oos: oosIC };
  };
  const predictors = {
    credit_velocity5: icOf(preds.velocity5),
    credit_levelPct:  icOf(preds.levelPct),
    credit_stressProb: icOf(preds.stressProb),
    benchmark_pastVol: icOf(pastVol),
  };

  // Hit-rate: does above-median credit widening predict above-median forward vol (OOS)?
  const hitRate = (drv) => {
    const xs = [], ys = [];
    for (let t = split; t < T; t++) if (Number.isFinite(drv[t]) && Number.isFinite(target[t])) { xs.push(drv[t]); ys.push(target[t]); }
    if (xs.length < 10) return { rate: null, n: xs.length };
    const mx = median(xs), my = median(ys);
    let hit = 0; for (let i = 0; i < xs.length; i++) if ((xs[i] > mx) === (ys[i] > my)) hit++;
    return { rate: hit / xs.length, n: xs.length };
  };

  const bestLead = table.filter(r => r.lag >= 0 && r.r != null).sort((a, b) => (b.r ?? -9) - (a.r ?? -9))[0] ?? null;
  const creditOOS = predictors.credit_velocity5.oos.ic;
  const benchOOS = predictors.benchmark_pastVol.oos.ic;
  const beatsBenchmark = creditOOS != null && benchOOS != null && creditOOS > benchOOS;

  return {
    ok: true, horizon, maxLag, oosFrac, split, coverage,
    table, predictors,
    hit: { credit_velocity5: hitRate(preds.velocity5) },
    bestLead,
    verdict: {
      credit_oos_ic: creditOOS, benchmark_oos_ic: benchOOS, beatsBenchmark,
      note: 'Credit earns a place only if its OOS information coefficient beats vol-predicts-vol AND is positive with a meaningful sample.',
    },
  };
}

function median(a) { const s = a.filter(Number.isFinite).slice().sort((x, y) => x - y); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

// ── Align two date-tagged series ([{date,value}]) to their common dates ───────
// Returns { dates, a, b } with a[i]/b[i] the values on dates[i] (inner join).
export function alignByDate(seriesA, seriesB) {
  const mapB = new Map(seriesB.map(o => [o.date, o.value]));
  const dates = [], a = [], b = [];
  for (const o of seriesA) {
    if (mapB.has(o.date)) { dates.push(o.date); a.push(o.value); b.push(mapB.get(o.date)); }
  }
  return { dates, a, b };
}
