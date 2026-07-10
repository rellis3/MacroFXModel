// mve/validation.js — Phase 0. The harness that must exist BEFORE any model is
// believed. Purged/embargoed walk-forward splits, forecast-band calibration
// (are the σ's honest?), pinball/MAE scoring, and a re-export of the repo's
// existing deflated-Sharpe (js/backtestStats.js) so trials-adjusted significance
// lives in one place. Pure, no network.
//
//   import { walkForwardSplits, bandCalibration, deflatedSharpe } from './validation.js';

import { deflatedSharpe as _deflatedSharpe } from '../backtestStats.js';

export const deflatedSharpe = _deflatedSharpe;   // López de Prado DSR, reused not recopied

// ── Purged / embargoed walk-forward splits ──────────────────────────────────
// Returns an array of { trainStart, trainEnd, testStart, testEnd } index ranges
// (end exclusive). Between train and test there is an `embargo`-bar gap so a
// slow-decaying feature computed at the train boundary cannot leak into the test
// window (the "purge"). `anchored:true` grows the train window from 0; false
// slides a fixed `trainSize` window.
export function walkForwardSplits(n, {
  trainSize = Math.floor(n * 0.5),
  testSize  = Math.floor(n * 0.1),
  embargo   = 0,
  anchored  = true,
} = {}) {
  const splits = [];
  if (n <= 0 || testSize <= 0) return splits;
  let testStart = (anchored ? trainSize : trainSize) + embargo;
  while (testStart + testSize <= n) {
    const trainEnd   = testStart - embargo;
    const trainStart = anchored ? 0 : Math.max(0, trainEnd - trainSize);
    if (trainEnd - trainStart >= 4) {
      splits.push({ trainStart, trainEnd, testStart, testEnd: testStart + testSize });
    }
    testStart += testSize;
  }
  return splits;
}

// ── Forecast-band calibration ────────────────────────────────────────────────
// Given realized errors (actual − forecast) and the forecast σ's, what fraction
// of errors fell inside ±zσ for each nominal coverage level? A well-calibrated
// model returns coverage ≈ the nominal level. Over-confident σ ⇒ coverage < nominal.
const Z = { 0.68: 0.9944579, 0.80: 1.2815515, 0.95: 1.959964 };
export function bandCalibration(errors, sigmas, levels = [0.68, 0.95]) {
  const out = {};
  const n = Math.min(errors.length, sigmas.length);
  for (const lvl of levels) {
    const z = Z[lvl] ?? 1.959964;
    let inside = 0, valid = 0;
    for (let i = 0; i < n; i++) {
      const s = sigmas[i];
      if (!(s > 0) || !Number.isFinite(errors[i])) continue;
      valid++;
      if (Math.abs(errors[i]) <= z * s) inside++;
    }
    out[lvl] = { nominal: lvl, coverage: valid ? inside / valid : null, n: valid };
  }
  return out;
}

// ── Point-forecast scores ────────────────────────────────────────────────────
export function mae(errors) {
  const e = errors.filter(Number.isFinite);
  return e.length ? e.reduce((s, x) => s + Math.abs(x), 0) / e.length : null;
}
export function bias(errors) {
  const e = errors.filter(Number.isFinite);
  return e.length ? e.reduce((s, x) => s + x, 0) / e.length : null;
}
export function rmse(errors) {
  const e = errors.filter(Number.isFinite);
  return e.length ? Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length) : null;
}
// Pinball (quantile) loss at quantile q — a proper score for probabilistic bands.
export function pinball(actual, forecast, q) {
  const d = actual - forecast;
  return d >= 0 ? q * d : (q - 1) * d;
}

// ── One-call walk-forward evaluator ─────────────────────────────────────────
// fitPredict(trainIdx, testIdx) must return { forecasts:[], actuals:[], sigmas:[] }
// aligned across the test window. Aggregates errors + calibration across folds.
export function walkForwardEvaluate(n, fitPredict, opts = {}) {
  const splits = walkForwardSplits(n, opts);
  const errors = [], sigmas = [];
  let folds = 0;
  for (const s of splits) {
    const res = fitPredict(s);
    if (!res || !res.forecasts?.length) continue;
    folds++;
    for (let i = 0; i < res.forecasts.length; i++) {
      const e = res.actuals[i] - res.forecasts[i];
      errors.push(e);
      sigmas.push(res.sigmas ? res.sigmas[i] : NaN);
    }
  }
  return {
    folds,
    n: errors.length,
    mae: mae(errors),
    bias: bias(errors),
    rmse: rmse(errors),
    calibration: bandCalibration(errors, sigmas),
    errors, sigmas,
  };
}
