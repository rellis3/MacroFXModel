/**
 * Yield-Coupling Core — the price↔yield-spread coupling compute (measure-first).
 *
 * Purpose (this stage): a pure, offline-testable engine that takes an FX price
 * series and one or more bond-CFD "yield-spread" series on the same time grid and
 * emits the four primitives the whole idea reduces to:
 *
 *   • coupling  — rolling Pearson correlation of the two standardized series
 *                 (are price and the yield spread in sync *right now*?)
 *   • gap       — standardized price minus standardized spread (the error-
 *                 correction residual: how far price has detached from what the
 *                 yield spread implies)
 *   • lead-lag  — the bar offset that maximises |correlation| (does the yield
 *                 spread lead price, and by how much?)
 *   • direction — the sign the spread is pulling price toward (from the recent
 *                 slope of the standardized spread, gated by coupling)
 *
 * This is the nascent shared brick for the five planned consumers (daily brief,
 * z-score strategy, directional hook, regime filter, divergence alert). It is
 * deliberately horizon/-resolution-agnostic — the caller resamples to M1/M5/M15
 * and passes bars in; nothing here hard-codes a granularity.
 *
 * Lego notes:
 *   • Pure & dependency-light. No network, no asset knowledge, no DOM — data is
 *     passed in. Reuses `statsCore` moments; `pearson` / `rollingCorr` live here
 *     for now and are flagged candidates to promote into `statsCore` once a
 *     second consumer wants them (see LEGO_MODULES.md §2).
 *   • Bond price is the INVERSE of yield. Spread construction takes a signed
 *     coefficient per leg (on bond PRICE) so the caller encodes the yield sign
 *     once, explicitly — never a hidden default that drifts.
 */

import { mean, stdev } from './statsCore.js';

// ── Standardize (population z over the whole window) ──────────────────────────
// Returns { z:number[], mean, std }. Non-finite inputs pass through as NaN.
// std===0 → all-zero z (a flat series has no shape to compare).
export function standardize(values) {
  const finite = values.filter(Number.isFinite);
  const m = mean(finite);
  const s = stdev(finite, 0);
  const z = values.map(v => (Number.isFinite(v) && s > 0 ? (v - m) / s : (Number.isFinite(v) ? 0 : NaN)));
  return { z, mean: m, std: s };
}

// ── Align a set of {t, v} series on their common timestamps (inner join) ──────
// Each series is [{ t:string, v:number }] (t is a sortable time key). Returns
// { times:string[], columns:number[][] } where columns[k][i] is series k at
// times[i]. Missing bars in any series drop that timestamp from the join.
export function alignByTime(seriesList) {
  if (!seriesList.length) return { times: [], columns: [] };
  const maps = seriesList.map(s => {
    const m = new Map();
    for (const { t, v } of s) m.set(t, v);
    return m;
  });
  // Common timestamps = present in every series, sorted ascending.
  const times = [...maps[0].keys()]
    .filter(t => maps.every(m => m.has(t) && Number.isFinite(m.get(t))))
    .sort();
  const columns = maps.map(m => times.map(t => m.get(t)));
  return { times, columns };
}

// ── Build a yield-spread series from signed bond-price legs ───────────────────
// legs: [{ price:number[], k:number }]  — k is the coefficient on bond PRICE.
// Because yield ≈ −price, encode the FX-bullish orientation via k (e.g. for
// EUR/USD 10Y: +USB10Y − DE10YB ∝ yield_DE − yield_US, bullish EUR when > 0).
// All leg arrays must be the same length (align first). Returns number[].
export function buildSpread(legs) {
  if (!legs.length) return [];
  const n = legs[0].price.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let acc = 0, ok = true;
    for (const { price, k } of legs) {
      if (!Number.isFinite(price[i])) { ok = false; break; }
      acc += k * price[i];
    }
    out[i] = ok ? acc : NaN;
  }
  return out;
}

// ── Pearson correlation of two equal-length arrays (finite pairs only) ────────
export function pearson(a, b) {
  const xs = [], ys = [];
  for (let i = 0; i < a.length; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) { xs.push(a[i]); ys.push(b[i]); }
  }
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = mean(xs), my = mean(ys);
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    cov += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  if (vx <= 0 || vy <= 0) return NaN;
  return cov / Math.sqrt(vx * vy);
}

// ── Rolling Pearson correlation over a trailing window ────────────────────────
// out[i] = corr(a[i-window+1 .. i], b[same]); NaN until the window is full.
export function rollingCorr(a, b, window) {
  const out = new Array(a.length).fill(NaN);
  for (let i = window - 1; i < a.length; i++) {
    out[i] = pearson(a.slice(i - window + 1, i + 1), b.slice(i - window + 1, i + 1));
  }
  return out;
}

// ── Gap (error-correction residual) between two standardized series ───────────
// Both inputs should already be standardized (unitless). gap = a − b in σ-units.
export function gapSeries(aZ, bZ) {
  return aZ.map((v, i) => (Number.isFinite(v) && Number.isFinite(bZ[i]) ? v - bZ[i] : NaN));
}

// ── Lead-lag: the shift of `b` that best matches `a` ──────────────────────────
// Scans lag ∈ [−maxLag, +maxLag]; a positive lag means `b` LEADS `a` (shifting b
// forward in time aligns it onto a). Returns { lag, corr } maximising |corr|,
// plus the full profile for plotting. lag=0 corr is the coincident correlation.
export function bestLag(a, b, maxLag) {
  const profile = [];
  let best = { lag: 0, corr: NaN };
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    // Compare a[i] with b[i-lag]: positive lag → b's earlier value predicts a.
    const xs = [], ys = [];
    for (let i = 0; i < a.length; i++) {
      const j = i - lag;
      if (j < 0 || j >= b.length) continue;
      if (Number.isFinite(a[i]) && Number.isFinite(b[j])) { xs.push(a[i]); ys.push(b[j]); }
    }
    const c = pearson(xs, ys);
    profile.push({ lag, corr: c });
    if (Number.isFinite(c) && (!Number.isFinite(best.corr) || Math.abs(c) > Math.abs(best.corr))) {
      best = { lag, corr: c };
    }
  }
  return { ...best, profile };
}

// ── Direction: recent slope of the standardized spread, gated by coupling ─────
// Returns { sign:-1|0|1, slope, coupling } — the spread's pull on price over the
// last `look` bars, only asserted (non-zero) when |coupling| ≥ minCoupling.
// `couplingSign` is the sign of the coincident correlation, so a negative
// (inverse) coupling still yields the correct price direction.
export function directionSignal(spreadZ, coupling, { look = 12, minCoupling = 0.4 } = {}) {
  const tail = spreadZ.slice(-look).filter(Number.isFinite);
  if (tail.length < 2) return { sign: 0, slope: 0, coupling };
  const slope = tail[tail.length - 1] - tail[0];
  const couplingSign = Number.isFinite(coupling) && coupling < 0 ? -1 : 1;
  const strong = Number.isFinite(coupling) && Math.abs(coupling) >= minCoupling;
  const raw = slope > 0 ? 1 : slope < 0 ? -1 : 0;
  return { sign: strong ? raw * couplingSign : 0, slope, coupling };
}

// ── Top-level convenience: everything from aligned raw price + spread ─────────
// price, spread: equal-length raw number[] on the SAME time grid (align first).
// Returns the standardized overlay series + the four primitives.
export function computeCoupling(price, spread, { corrWindow = 60, maxLag = 24, dirLook = 12, minCoupling = 0.4 } = {}) {
  const priceZ  = standardize(price).z;
  const spreadZ = standardize(spread).z;
  const corr    = rollingCorr(priceZ, spreadZ, corrWindow);
  const gap     = gapSeries(priceZ, spreadZ);
  const lag     = bestLag(priceZ, spreadZ, maxLag);
  const coincident = pearson(priceZ, spreadZ);
  const lastCorr = [...corr].reverse().find(Number.isFinite);
  const direction = directionSignal(spreadZ, lastCorr ?? coincident, { look: dirLook, minCoupling });
  return { priceZ, spreadZ, corr, gap, lag, coincident, direction };
}
