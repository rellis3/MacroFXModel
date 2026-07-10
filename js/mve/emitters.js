// mve/emitters.js — Phase 1. Concrete fair-value models, each returning the
// standard Estimate (contract.js). All pure: you pass in aligned series, they
// return (fairValue, sigma, confidence). No network — a live adapter (see
// MVE_RUN_GUIDE.md) is responsible for sourcing OANDA/FRED and calling these.
//
// Bucket A (anchors, emit a price):
//   regressionEmitter — the generalised compassDivergence: price ~ macro factors.
//   ar1Emitter        — statistical mean-reversion fair value (AR(1) on price).
// Bucket B (weights, no price):
//   volWeightEmitter        — high vol / vol-of-vol lowers confidence.
//   positioningWeightEmitter— crowded positioning lowers confidence.

import { makeEstimate, KIND } from './contract.js';
import { rollingFitLatest } from './ols.js';
import { mean, stdev } from '../statsCore.js';

// ── Bucket A: multi-factor macro regression fair value ──────────────────────
// price:   number[] newest-last (the instrument level, or log-level).
// factors: [{ name, series:number[] }] aligned to price (same length, newest-last).
// window:  trailing bars used for the rolling fit.
// confidence blends fit quality (r²) and sample adequacy; the honest σ is the
// prediction σ (folds in β estimation error), supplied by ols.predictSigma.
export function regressionEmitter({ name = 'macro_fv', price, factors, window = 120, asOf = null } = {}) {
  if (!price || price.length < 10 || !factors?.length) return null;
  const n = price.length;
  const len = Math.min(n, ...factors.map(f => f.series.length));
  const y = price.slice(price.length - len);
  const F = [];
  for (let i = 0; i < len; i++) F.push(factors.map(f => f.series[f.series.length - len + i]));
  const fit = rollingFitLatest({ y, F }, window);
  if (!fit) return null;
  const r2 = Math.max(0, fit.r2);
  const confidence = 0.35 + 0.6 * r2 * Math.min(1, fit.n / window);   // fit × adequacy
  return makeEstimate({
    name, kind: KIND.ANCHOR,
    fairValue: fit.fairValue, sigma: fit.sigma, confidence, asOf,
    meta: { r2: +r2.toFixed(3), beta: fit.beta.map(b => +b.toFixed(4)), window: fit.n, kind: 'regression' },
  });
}

// ── Bucket A: statistical (pure-price) mean-reversion fair value ─────────────
// AR(1) on levels: fair value = μ + φ·(P_t − μ). When |φ|<1 the process reverts
// toward μ, so the 1-step "fair value" is where an unforced price would sit.
// This is the model-free cousin of arima-price.js. σ = residual std.
export function ar1Emitter({ name = 'stat_fv', price, window = 120, asOf = null } = {}) {
  if (!price || price.length < 20) return null;
  const w = Math.min(window, price.length);
  const p = price.slice(price.length - w);
  const y = p.slice(1), x = p.slice(0, -1);
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx; sxy += dx * (y[i] - my); sxx += dx * dx; }
  if (sxx <= 0) return null;
  const phi = Math.max(-0.999, Math.min(0.999, sxy / sxx));
  const c = my - phi * mx;
  const resid = y.map((v, i) => v - (c + phi * x[i]));
  const sigma = stdev(resid, 1) || 1e-9;
  const last = p[p.length - 1];
  const fairValue = c + phi * last;                 // 1-step-ahead unforced level
  const mu = phi !== 1 ? c / (1 - phi) : last;       // long-run mean
  // Confidence rises as φ sits in the reverting band and residuals are tight.
  const revert = 1 - Math.abs(phi);                  // 0 = random walk, 1 = instant revert
  const confidence = 0.3 + 0.5 * Math.max(0, Math.min(1, revert * 2));
  return makeEstimate({
    name, kind: KIND.ANCHOR, fairValue, sigma, confidence, asOf,
    meta: { phi: +phi.toFixed(3), mu: +mu.toFixed(6), kind: 'ar1' },
  });
}

// ── Bucket B: volatility weight (no price) ──────────────────────────────────
// Elevated realized vol / vol-of-vol means any fair-value gap is noisier and
// more likely to keep running — so it LOWERS confidence without moving fair value.
export function volWeightEmitter({ name = 'vol_weight', returns, window = 60, asOf = null } = {}) {
  if (!returns || returns.length < window) return null;
  const recent = returns.slice(-window);
  const half = Math.floor(window / 2);
  const volNow = stdev(recent.slice(-half), 1);
  const volPrev = stdev(recent.slice(0, half), 1) || 1e-12;
  const ratio = volNow / volPrev;                    // >1 = expanding vol
  // Map expansion → confidence in [0.35, 1]. Contracting vol = reversion-friendly.
  const confidence = Math.max(0.35, Math.min(1, 1.15 - 0.5 * Math.max(0, ratio - 0.85)));
  return makeEstimate({ name, kind: KIND.WEIGHT, confidence, asOf,
    meta: { volRatio: +ratio.toFixed(2), kind: 'vol' } });
}

// ── Bucket B: positioning weight (no price) ─────────────────────────────────
// crowdPct in [0,100] (e.g. COT spec percentile). Extreme crowding IN the gap's
// direction is exhaustion fuel (raises confidence a little); we keep it simple:
// mid readings = neutral, extremes = slightly higher conviction of reversion.
export function positioningWeightEmitter({ name = 'pos_weight', crowdPct = 50, asOf = null } = {}) {
  if (!Number.isFinite(crowdPct)) return null;
  const extreme = Math.abs(crowdPct - 50) / 50;      // 0 (neutral) → 1 (fully crowded)
  const confidence = 0.5 + 0.4 * extreme;
  return makeEstimate({ name, kind: KIND.WEIGHT, confidence, asOf,
    meta: { crowdPct, kind: 'positioning' } });
}
