// Hedge Signal v2 — cointegration-gated pairs mean-reversion
// ────────────────────────────────────────────────────────────────────────────
// v1 (`server.js computeHedgeSignals`) selects pairs for LOW correlation
// (`_hedgeScore = -corr*0.7 + betaSpread*0.3`) and then trades their plain
// `log(A) - log(B)` spread as if it mean-reverts, against an all-history Welford
// mean that resets on every restart. Those choices fight each other: a spread
// only reverts if the legs are COINTEGRATED, and an all-history mean is not a
// stationary reference. v1 loses for structural reasons, not bad luck.
//
// v2 fixes the three roots (see HEDGING_VS_SPREAD.md):
//   1. Select pairs by COINTEGRATION (Ornstein-Uhlenbeck half-life + a t-stat
//      gate on the mean-reversion coefficient), not by low correlation.
//   2. Build the spread with a real rolling hedge ratio  s = logA − β·logB,
//      and money-match the legs (leg B notional = β × leg A).
//   3. Measure the z-score against a ROLLING window, and add a half-life
//      TIME-STOP so a broken relationship is cut, not held forever.
//
// This module is a pure Tier-1 brick: no network, no globals, no DOM. Every
// function takes its data in and is unit-tested on synthetic series
// (`hedgeSignalV2Engine.test.mjs`). The same code path serves the live signal
// producer and the IS/OOS backtest, so they can never drift (Lego Principle 1).
//
// Reuses the shared bricks: metricsCore (Sharpe / PF / win-rate / drawdown).

import {
  sharpeRatio, winRate, profitFactor, expectancy, maxDrawdownFromEquity,
} from './metricsCore.js';

// ── Defaults ────────────────────────────────────────────────────────────────
export const V2_DEFAULTS = {
  betaWindow:   120,   // bars for the rolling OLS hedge ratio  (logA on logB)
  zWindow:      120,   // bars for the rolling spread mean/std  (the z reference)
  hlWindow:     250,   // bars for the half-life / cointegration fit
  entryZ:       2.0,   // |z| ≥ entryZ to open
  exitZ:        0.5,   // |z| ≤ exitZ to take the reversion
  stopZ:        3.5,   // |z| ≥ stopZ to stop out (tail blow-out)
  maxHoldMult:  2.0,   // time-stop = maxHoldMult × measured half-life (bars)
  hlMin:        2,     // reject spreads that revert faster than this (noise)
  hlMax:        120,   // reject spreads whose half-life is too long (untradeable)
  tStat:       -3.4,   // OU λ t-stat must be ≤ this — Engle-Granger 5% critical value
                       // (stricter than a plain ADF; guards against spurious cointegration)
  costLog:      0.0004,// round-trip cost in log units across BOTH legs (~4bp/leg)
  oosFrac:      0.40,  // last 40% of bars are out-of-sample
};

// ── Small numeric helpers (pure) ─────────────────────────────────────────────
const _logs = closes => closes.map(c => Math.log(Math.max(c, 1e-12)));

// OLS slope+intercept of y on x with the regression t-stat of the slope.
// Returns { beta, alpha, t } (t = slope / se(slope)); null if degenerate.
export function olsFit(y, x) {
  const n = Math.min(y.length, x.length);
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; }
  const dx = n * sxx - sx * sx;
  if (Math.abs(dx) < 1e-18) return null;
  const beta  = (n * sxy - sx * sy) / dx;
  const alpha = (sy - beta * sx) / n;
  // residual variance → standard error of the slope
  let sse = 0;
  for (let i = 0; i < n; i++) { const e = y[i] - (alpha + beta * x[i]); sse += e * e; }
  const sigma2 = n > 2 ? sse / (n - 2) : 0;
  const seBeta = Math.sqrt(Math.max(sigma2 * n / dx, 0));
  const t = seBeta > 1e-18 ? beta / seBeta : 0;
  return { beta, alpha, t };
}

// Mean / sample-std of a slice.
function _meanStd(a) {
  const n = a.length;
  if (n < 2) return { mean: n ? a[0] : 0, std: 0 };
  let m = 0; for (const v of a) m += v; m /= n;
  let s = 0; for (const v of a) s += (v - m) * (v - m);
  return { mean: m, std: Math.sqrt(s / (n - 1)) };
}

// ── Cointegration / half-life ────────────────────────────────────────────────
// Fit the Ornstein-Uhlenbeck discretisation  Δs_t = α + λ·s_{t-1} + ε.
// λ < 0 ⇒ mean-reverting; half-life = −ln(2)/λ. The slope t-stat is the
// Engle-Granger-style cointegration significance (more negative = stronger).
export function halfLife(spread) {
  if (spread.length < 5) return { halfLife: Infinity, lambda: 0, t: 0, ok: false };
  const lagged = spread.slice(0, -1);
  const delta  = [];
  for (let i = 1; i < spread.length; i++) delta.push(spread[i] - spread[i - 1]);
  const fit = olsFit(delta, lagged);
  if (!fit || fit.beta >= 0) return { halfLife: Infinity, lambda: fit?.beta ?? 0, t: fit?.t ?? 0, ok: false };
  const hl = -Math.log(2) / fit.beta;
  return { halfLife: hl, lambda: fit.beta, t: fit.t, ok: isFinite(hl) && hl > 0 };
}

// Does a (residual / spread) series pass the stationarity gate? Half-life must
// sit in the tradeable band and the OU λ t-stat must clear the threshold.
export function passesCointegration(spread, opts = {}) {
  const o  = { ...V2_DEFAULTS, ...opts };
  const hl = halfLife(spread);
  const pass = hl.ok && hl.t <= o.tStat && hl.halfLife >= o.hlMin && hl.halfLife <= o.hlMax;
  return { pass, ...hl };
}

// Engle-Granger cointegration test on a PAIR of close series: fit one static
// regression logA = α + β·logB over the window, then test the residual for
// stationarity. Using a single static β (not a rolling one) keeps the residual
// from inheriting a non-stationary β·logB drift — that's what actually decides
// whether the spread reverts. Returns the cointegrating β to use for sizing.
export function cointegrationTest(closesA, closesB, opts = {}) {
  const o = { ...V2_DEFAULTS, ...opts };
  const la = _logs(closesA), lb = _logs(closesB);
  const n = Math.min(la.length, lb.length);
  if (n < 30) return { pass: false, beta: null, halfLife: Infinity, t: 0, lambda: 0 };
  const A = la.slice(-n), B = lb.slice(-n);
  const fit = olsFit(A, B);
  if (!fit) return { pass: false, beta: null, halfLife: Infinity, t: 0, lambda: 0 };
  const resid = A.map((y, i) => y - (fit.alpha + fit.beta * B[i]));
  const gate = passesCointegration(resid, o);
  return { pass: gate.pass, beta: fit.beta, halfLife: gate.halfLife, t: gate.t, lambda: gate.lambda };
}

// ── Rolling hedge ratio + spread (no lookahead) ──────────────────────────────
// β[i] is fit from logA/logB over [i-betaWindow, i-1] (data strictly < i), so the
// spread point at i never sees its own bar. Bars before warmup get β = null.
export function rollingSpread(closesA, closesB, opts = {}) {
  const o = { ...V2_DEFAULTS, ...opts };
  const la = _logs(closesA), lb = _logs(closesB);
  const n  = Math.min(la.length, lb.length);
  const beta = new Array(n).fill(null);
  const spread = new Array(n).fill(null);
  for (let i = o.betaWindow; i < n; i++) {
    const fit = olsFit(la.slice(i - o.betaWindow, i), lb.slice(i - o.betaWindow, i));
    if (!fit) continue;
    beta[i]   = fit.beta;
    spread[i] = la[i] - fit.beta * lb[i];
  }
  return { beta, spread };
}

// Static cointegrating residual + its z, evaluated AT bar i from past data only.
// Fit logA = α + β·logB over the trailing hlWindow (strictly < i), form the
// residual at i, and z-score it against the trailing zWindow of residuals built
// with the SAME (α,β). This keeps the z reference and the held spread on one
// consistent, stationary definition — no rolling-β drift. Returns null until warm.
function _residualZ(la, lb, i, o) {
  if (i < o.hlWindow) return null;
  const fit = olsFit(la.slice(i - o.hlWindow, i), lb.slice(i - o.hlWindow, i));
  if (!fit) return null;
  const resid = j => la[j] - (fit.alpha + fit.beta * lb[j]);
  const slice = [];
  for (let k = i - o.zWindow; k < i; k++) if (k >= 0) slice.push(resid(k));
  if (slice.length < Math.max(10, o.zWindow * 0.5)) return null;
  const { mean, std } = _meanStd(slice);
  if (std < 1e-12) return null;
  return { z: (resid(i) - mean) / std, alpha: fit.alpha, beta: fit.beta };
}

// ── Per-pair backtest (the v2 state machine) ─────────────────────────────────
// Walks one pair's aligned closes, opens on |z|≥entryZ only when the trailing
// spread passes the cointegration gate, and exits on reversion / stop / time-stop.
// PnL is in spread (log) units, net of round-trip cost; long-spread = +1.
export function backtestPair(closesA, closesB, opts = {}) {
  const o = { ...V2_DEFAULTS, ...opts };
  const la = _logs(closesA), lb = _logs(closesB);
  const n = Math.min(la.length, lb.length);
  const warmup = Math.max(o.betaWindow, o.zWindow, o.hlWindow);
  const trades = [];
  // Position state — β is LOCKED at entry (you don't rebalance the hedge mid-trade).
  let pos = 0, betaEntry = 0, heldEntry = 0, entryIdx = 0, hold = 0, holdLimit = 0;
  const held = (j, b) => la[j] - b * lb[j];

  for (let i = warmup; i < n; i++) {
    const rz = _residualZ(la, lb, i, o);
    if (rz == null) continue;
    const z = rz.z;

    if (pos !== 0) {
      hold++;
      const reverted = Math.abs(z) <= o.exitZ;
      const stopped  = Math.abs(z) >= o.stopZ;
      const timedOut = hold >= holdLimit;
      if (reverted || stopped || timedOut) {
        const gross = pos * (held(i, betaEntry) - heldEntry);  // long-spread profits when spread rises
        trades.push({
          entryIdx, exitIdx: i, pos, hold, beta: +betaEntry.toFixed(4),
          pnl: gross - o.costLog,
          reason: reverted ? 'REVERT' : stopped ? 'STOP' : 'TIME',
        });
        pos = 0;
      }
      continue;
    }

    if (Math.abs(z) < o.entryZ) continue;
    // Cointegration gate on the trailing window of CLOSES (strictly past data).
    const gate = cointegrationTest(
      closesA.slice(Math.max(0, i - o.hlWindow), i),
      closesB.slice(Math.max(0, i - o.hlWindow), i), o);
    if (!gate.pass) continue;
    pos = z > 0 ? -1 : 1;          // z>0 → spread rich → short the spread
    betaEntry = gate.beta;
    heldEntry = held(i, betaEntry);
    entryIdx = i;
    hold = 0;
    holdLimit = Math.max(o.hlMin, Math.round(gate.halfLife * o.maxHoldMult));
  }
  return { trades };
}

// v1-style baseline on the SAME data: plain log(A)−log(B) spread, expanding
// (all-history) mean/std, z-only exit, NO cointegration gate, NO time-stop.
// This is what the current dashboard does — the honest thing to A/B against.
export function backtestBaseline(closesA, closesB, opts = {}) {
  const o = { ...V2_DEFAULTS, ...opts };
  const la = _logs(closesA), lb = _logs(closesB);
  const n  = Math.min(la.length, lb.length);
  const trades = [];
  let cnt = 0, mu = 0, m2 = 0;              // Welford, like v1's _spreadWelford
  let pos = 0, entrySpread = 0, entryIdx = 0;
  for (let i = 0; i < n; i++) {
    const s = la[i] - lb[i];
    cnt++; const d = s - mu; mu += d / cnt; m2 += d * (s - mu);
    if (cnt < 10) continue;
    const std = Math.sqrt(m2 / (cnt - 1));
    if (std < 1e-12) continue;
    const z = (s - mu) / std;
    if (pos !== 0) {
      if (Math.abs(z) <= o.exitZ || Math.abs(z) >= o.stopZ) {
        trades.push({ entryIdx, exitIdx: i, pos, pnl: pos * (s - entrySpread) - o.costLog,
          reason: Math.abs(z) <= o.exitZ ? 'REVERT' : 'STOP' });
        pos = 0;
      }
      continue;
    }
    if (Math.abs(z) < o.entryZ) continue;
    pos = z > 0 ? -1 : 1; entrySpread = s; entryIdx = i;
  }
  return { trades };
}

// ── Metrics + IS/OOS split (reuses metricsCore) ──────────────────────────────
export function summarizePnls(pnls) {
  if (!pnls.length) return { trades: 0, total: 0, sharpe: 0, winRate: 0, profitFactor: 0, expectancy: 0, maxDD: 0 };
  let eq = 0; const curve = pnls.map(p => (eq += p));
  return {
    trades: pnls.length,
    total: +eq.toFixed(6),
    sharpe: +sharpeRatio(pnls).toFixed(3),
    winRate: +winRate(pnls).toFixed(3),
    profitFactor: +profitFactor(pnls).toFixed(3),
    expectancy: +expectancy(pnls).toFixed(6),
    maxDD: +maxDrawdownFromEquity(curve).toFixed(6),
  };
}

// Split a portfolio's trades into IS/OOS by exit index against a bar count.
function _splitByBar(trades, splitIdx) {
  const is = [], oos = [];
  for (const t of trades) (t.exitIdx < splitIdx ? is : oos).push(t.pnl);
  return { is, oos };
}

// Run v2 vs the v1-style baseline across a map of candidate pairs and produce a
// full IS/OOS A/B card. closesMap: { SYMBOL: number[] }; pairs: [[a,b], …].
export function runComparison(closesMap, pairs, opts = {}) {
  const o = { ...V2_DEFAULTS, ...opts };
  const v2All = [], baseAll = [];
  const perPair = [];
  let maxLen = 0;
  for (const [a, b] of pairs) {
    const ca = closesMap[a], cb = closesMap[b];
    if (!ca || !cb) continue;
    const m = Math.min(ca.length, cb.length);
    maxLen = Math.max(maxLen, m);
    const A = ca.slice(-m), B = cb.slice(-m);
    const v2  = backtestPair(A, B, o);
    const base = backtestBaseline(A, B, o);
    const gate = cointegrationTest(A.slice(-o.hlWindow), B.slice(-o.hlWindow), o);
    v2All.push(...v2.trades);
    baseAll.push(...base.trades);
    perPair.push({
      pair: `${a}/${b}`,
      cointegrated: gate.pass,
      halfLife: isFinite(gate.halfLife) ? +gate.halfLife.toFixed(1) : null,
      tStat: +gate.t.toFixed(2),
      v2Trades: v2.trades.length,
      v2Total: +v2.trades.reduce((s, t) => s + t.pnl, 0).toFixed(6),
      baseTrades: base.trades.length,
      baseTotal: +base.trades.reduce((s, t) => s + t.pnl, 0).toFixed(6),
    });
  }
  const splitIdx = Math.floor(maxLen * (1 - o.oosFrac));
  const v2Split   = _splitByBar(v2All, splitIdx);
  const baseSplit = _splitByBar(baseAll, splitIdx);
  return {
    config: o,
    splitIdx, totalBars: maxLen,
    perPair: perPair.sort((x, y) => (y.cointegrated - x.cointegrated) || (y.v2Total - x.v2Total)),
    v2:   { is: summarizePnls(v2Split.is),   oos: summarizePnls(v2Split.oos),   all: summarizePnls(v2All.map(t => t.pnl)) },
    base: { is: summarizePnls(baseSplit.is), oos: summarizePnls(baseSplit.oos), all: summarizePnls(baseAll.map(t => t.pnl)) },
  };
}

// ── Live signal (latest bar) ─────────────────────────────────────────────────
// Given recent closes for one pair, return the current v2 reading: the rolling
// hedge ratio, the rolling z, the cointegration verdict, and — if it's a fresh
// entry — direction + the money-match notional ratio (leg B = β × leg A).
export function liveSignal(closesA, closesB, opts = {}) {
  const o = { ...V2_DEFAULTS, ...opts };
  const la = _logs(closesA), lb = _logs(closesB);
  const i = Math.min(la.length, lb.length) - 1;     // evaluate at the last bar
  const r = _residualZ(la, lb, i, o);               // residual uses bar i, fit uses < i
  if (r == null) return null;
  const z = r.z;
  const gate = cointegrationTest(closesA.slice(-o.hlWindow), closesB.slice(-o.hlWindow), o);
  const isEntry = gate.pass && Math.abs(z) >= o.entryZ;
  const shortSpread = z > 0;                       // rich spread → short A / long B
  const beta = gate.beta != null ? gate.beta : r.beta;
  // Would-be direction even while watching, so the UI can preview the trade.
  const dirA = shortSpread ? 'SHORT' : 'LONG';
  const dirB = shortSpread ? 'LONG'  : 'SHORT';
  return {
    z: +z.toFixed(3),
    beta: beta != null ? +beta.toFixed(4) : null,
    cointegrated: gate.pass,
    halfLife: isFinite(gate.halfLife) ? +gate.halfLife.toFixed(1) : null,
    tStat: +gate.t.toFixed(2),
    isEntry,
    direction_a: isEntry ? dirA : null,
    direction_b: isEntry ? dirB : null,
    wouldBeDirA: dirA,           // direction it WOULD take if it triggered now
    wouldBeDirB: dirB,
    priceA: closesA[closesA.length - 1] ?? null,   // latest price of each leg
    priceB: closesB[closesB.length - 1] ?? null,
    notionalRatioB: beta != null ? +Math.abs(beta).toFixed(4) : null,  // money-match: B = β × A
    holdLimitBars: isEntry && isFinite(gate.halfLife) ? Math.round(gate.halfLife * o.maxHoldMult) : null,
  };
}
