/**
 * Volatility-Forecast Benchmark — pure JavaScript engine (no network).
 *
 * Answers one honest question the strategy stack currently *assumes* rather than
 * measures: which σ estimator actually predicts tomorrow's range best, per asset
 * class, out-of-sample?
 *
 * It does NOT re-implement any vol math. Every incumbent estimator is IMPORTED
 * from volBacktestEngine.js (the single source of truth, per the Lego Principle)
 * and only re-aligned to a common "predict bar i from data < i" contract. The one
 * genuinely new estimator is HAR-RV — fit walk-forward (expanding window, no
 * lookahead) — the literature's strongest cheap daily forecaster.
 *
 * Scoring is the forecast-evaluation analogue of the strategy OOS card:
 *   - realised-variance proxy for bar i  (Garman-Klass by default, or squared
 *     close-to-close return) — both conditionally-unbiased variance proxies;
 *   - QLIKE  = mean( r/p − ln(r/p) − 1 )   (Patton 2011, robust to a noisy proxy);
 *   - MSE    = mean( (r − p)^2 )            (variance units);
 *   - reported full / in-sample / out-of-sample on a time split (last oosFrac).
 * Lower is better for both. Winner is ranked by OOS QLIKE.
 *
 * No-lookahead contract: predVar[i] = forecast of bar i's variance using only
 * bars/returns strictly before i. The first warmup bars are NaN and excluded.
 */

import {
  ewmaVarSeries, hvVarSeries, yzVolSeries, garchSigmas, ASSET_PARAMS, LAMBDA,
} from './volBacktestEngine.js';

// ── Realised-variance proxies (the "truth" each forecast is scored against) ────
// Both are (approximately) conditionally-unbiased estimators of bar i's variance.
// realVar[i] uses ONLY bar i's own OHLC — it is the target, not a predictor.

const LN2 = Math.LN2;

function realizedVarSeries(bars, method = 'gk') {
  const n = bars.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const { open: o, high: h, low: l, close: c } = bars[i];
    let v;
    if (method === 'sq') {
      // squared close-to-close log return (noisy but unbiased)
      v = i === 0 ? 0 : Math.log(c / bars[i - 1].close) ** 2;
    } else if (method === 'parkinson') {
      v = (Math.log(h / l) ** 2) / (4 * LN2);
    } else {
      // Garman-Klass: lower-variance OHLC proxy (assumes no drift / no gap)
      v = 0.5 * Math.log(h / l) ** 2 - (2 * LN2 - 1) * Math.log(c / o) ** 2;
    }
    out[i] = Math.max(v, 1e-12);
  }
  return out;
}

// ── Estimator registry — each predicts bar i's VARIANCE from data < i ─────────
// out[i] = predicted variance for bar i; warmup bars are NaN.
// Indexing mirrors volBacktestEngine.runBacktest exactly so the benchmark and the
// live forecaster cannot silently disagree:
//   logRets[j] = ln(close[j+1]/close[j])  → the return realised ON bar j+1.
//   To predict bar i from returns through bar i-1, use series index i-2.

function logReturns(bars) {
  const lr = new Float64Array(Math.max(bars.length - 1, 0));
  for (let j = 1; j < bars.length; j++) lr[j - 1] = Math.log(bars[j].close / bars[j - 1].close);
  return lr;
}

function fromVarSeries(varSeries, n) {
  // varSeries[k] incorporates logRets[k] (return on bar k+1). predVar[i] = varSeries[i-2].
  const out = new Float64Array(n).fill(NaN);
  for (let i = 2; i < n; i++) out[i] = Math.max(varSeries[i - 2], 1e-12);
  return out;
}

function ewmaPred(bars, lam) {
  return fromVarSeries(ewmaVarSeries(logReturns(bars), lam), bars.length);
}

function hvPred(bars, window) {
  return fromVarSeries(hvVarSeries(logReturns(bars), window), bars.length);
}

function yzPred(bars, window) {
  const yz = yzVolSeries(bars, window);               // yz[k] = daily σ using bars[k-w..k]
  const n = bars.length;
  const out = new Float64Array(n).fill(NaN);
  for (let i = window + 1; i < n; i++) {
    const s = yz[i - 1];                                // predict bar i from σ through bar i-1
    out[i] = s > 0 ? s * s : NaN;
  }
  return out;
}

function garchPred(bars, omega) {
  const g = garchSigmas(bars, omega);                  // g[i] already = σ for predicting bar i
  const n = bars.length;
  const out = new Float64Array(n).fill(NaN);
  for (let i = 2; i < n; i++) out[i] = g[i] > 0 ? g[i] * g[i] : NaN;
  return out;
}

// HAR-RV (Corsi 2009): predict RV_i from its own daily / weekly / monthly lagged
// averages, all strictly before i. Fit walk-forward by ordinary least squares on
// an EXPANDING in-sample window via incremental normal equations (4×4) — O(n),
// no lookahead. `rvSeries` is the realised-variance proxy used as both target and
// regressor (HAR forecasts the same quantity the others are scored against).
function harRvPred(rvSeries, { warmup = 60, dailyLag = 1, weekLag = 5, monthLag = 22 } = {}) {
  const n = rvSeries.length;
  const out = new Float64Array(n).fill(NaN);
  const feat = (i) => {
    if (i - monthLag < 0) return null;
    let wk = 0, mo = 0;
    for (let k = 1; k <= weekLag; k++)  wk += rvSeries[i - k];
    for (let k = 1; k <= monthLag; k++) mo += rvSeries[i - k];
    return [1, rvSeries[i - dailyLag], wk / weekLag, mo / monthLag];
  };

  // accumulators for X'X (symmetric 4×4) and X'y (4) over targets already known
  const XtX = Array.from({ length: 4 }, () => new Float64Array(4));
  const Xty = new Float64Array(4);
  let added = 0, nextAdd = monthLag;

  const addObs = (t) => {
    const x = feat(t); if (!x) return;
    const y = rvSeries[t];
    for (let a = 0; a < 4; a++) { Xty[a] += x[a] * y; for (let b = 0; b < 4; b++) XtX[a][b] += x[a] * x[b]; }
    added++;
  };

  for (let i = monthLag; i < n; i++) {
    // ensure all targets with index < i are in the accumulator
    while (nextAdd < i) { addObs(nextAdd); nextAdd++; }
    const x = feat(i);
    if (x && added >= warmup) {
      const beta = solve4(XtX, Xty);
      if (beta) {
        let p = 0; for (let a = 0; a < 4; a++) p += beta[a] * x[a];
        out[i] = Math.max(p, 1e-12);                   // OLS can go negative; clamp for QLIKE
      }
    }
  }
  return out;
}

// Gaussian elimination with partial pivoting for a 4×4 ridge-stabilised system.
function solve4(A4, b4) {
  const M = [];
  for (let r = 0; r < 4; r++) {
    M.push([A4[r][0] + (r === 0 ? 0 : 1e-12), A4[r][1], A4[r][2], A4[r][3], b4[r]]);
    M[r][r] += 1e-12;                                   // tiny ridge for conditioning
  }
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-18) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][4] / M[0][0], M[1][4] / M[1][1], M[2][4] / M[2][2], M[3][4] / M[3][3]];
}

// Registry: key → { label, predVar(bars, ctx) → Float64Array }. `ctx.rv` is the
// realised-variance proxy series (so HAR forecasts the scored quantity).
const ESTIMATORS = {
  ewma090: { label: 'EWMA λ=0.90', predVar: (bars) => ewmaPred(bars, 0.90) },
  ewma094: { label: `EWMA λ=${LAMBDA}`, predVar: (bars) => ewmaPred(bars, LAMBDA) },
  hv20:    { label: 'Rolling HV20', predVar: (bars) => hvPred(bars, 20) },
  hv30:    { label: 'Rolling HV30', predVar: (bars) => hvPred(bars, 30) },
  yz30:    { label: 'Yang-Zhang(30)', predVar: (bars) => yzPred(bars, 30) },
  garch:   { label: 'GARCH(1,1)', predVar: (bars, ctx) => garchPred(bars, ctx.omega) },
  harRV:   { label: 'HAR-RV', predVar: (bars, ctx) => harRvPred(ctx.rv, ctx.harOpts) },
};

// ── Scoring ───────────────────────────────────────────────────────────────────

function qlikeTerm(real, pred) { const x = real / pred; return x - Math.log(x) - 1; }

// Score one predVar series against realVar on an aligned full / IS / OOS split.
function scoreSeries(predVar, realVar, oosFrac = 0.4) {
  const idx = [];
  for (let i = 0; i < predVar.length; i++) {
    if (Number.isFinite(predVar[i]) && predVar[i] > 0 && Number.isFinite(realVar[i]) && realVar[i] > 0) idx.push(i);
  }
  const cut = Math.floor(idx.length * (1 - oosFrac));
  const agg = (slice) => {
    let q = 0, m = 0, n = slice.length;
    for (const i of slice) { q += qlikeTerm(realVar[i], predVar[i]); m += (realVar[i] - predVar[i]) ** 2; }
    return n ? { n, qlike: q / n, mse: m / n } : { n: 0, qlike: NaN, mse: NaN };
  };
  return { full: agg(idx), is: agg(idx.slice(0, cut)), oos: agg(idx.slice(cut)) };
}

// ── Top-level benchmark ─────────────────────────────────────────────────────────
// runBench(bars, assetClass, opts) → ranked estimator scorecards on one IS/OOS split.
function runBench(bars, assetClass = 'fx', opts = {}) {
  const { oosFrac = 0.4, proxy = 'gk', keys = Object.keys(ESTIMATORS), harOpts } = opts;
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const rv = realizedVarSeries(bars, proxy);
  const ctx = { rv, omega: p.garch_omega ?? 4.76e-6, harOpts };

  const rows = keys
    .filter((k) => ESTIMATORS[k])
    .map((k) => {
      const predVar = ESTIMATORS[k].predVar(bars, ctx);
      const score = scoreSeries(predVar, rv, oosFrac);
      return { key: k, label: ESTIMATORS[k].label, ...score };
    });

  // rank by OOS QLIKE (lower better); NaN sinks to the bottom
  rows.sort((a, b) => (a.oos.qlike ?? Infinity) - (b.oos.qlike ?? Infinity));
  rows.forEach((r, i) => { r.rankOos = i + 1; });

  return {
    assetClass, proxy, oosFrac,
    nBars: bars.length,
    best: rows[0]?.key ?? null,
    estimators: rows,
  };
}

export {
  realizedVarSeries, logReturns, harRvPred, scoreSeries, runBench, ESTIMATORS, solve4,
};
