// mve/signalAdapter.js — Phase 4, OPT-IN. A pure adapter that shows how the MVE
// valuation would fold into the existing conviction stack WITHOUT touching live
// code. Nothing in the repo imports this yet — wiring it into js/signal.js
// computeSignalScore is a deliberate, separate step (see MVE_RUN_GUIDE.md §7).
//
// Design: MVE becomes a 6th factor alongside the existing five in
// computeSignalScore (HMM 20 / Bayesian 30 / tiers 25 / range 15 / structure 10).
// We renormalise to make room for a valuation weight without changing the others'
// RELATIVE proportions.

// Map an MVE valuation to a [0,1] factor score for a given trade direction.
// A cheap read supports longs, rich supports shorts; magnitude scaled by
// convergence probability and confidence so a weak/low-confidence gap barely moves it.
export function mveFactorScore(valuation, direction /* 'long' | 'short' */) {
  if (!valuation || !valuation.ok || !valuation.mispricing) return 0.5;
  const m = valuation.mispricing;
  const supportsLong = !m.rich;                      // cheap → long
  const aligned = (direction === 'long') === supportsLong;
  const strength = Math.min(1, Math.abs(m.z) / 2.5); // 2.5σ ≈ full strength
  const pConv = valuation.convergence?.pRevert ?? 0.5;
  const conf = valuation.confidence ?? 0.5;
  const magnitude = strength * pConv * conf;         // all three must be present to matter
  return aligned ? 0.5 + 0.5 * magnitude : 0.5 - 0.5 * magnitude;
}

// Blend the MVE factor into an existing 0–100 signal score. `mveWeight` is the
// share (e.g. 0.20) the valuation factor takes; the incumbent score keeps 1−share.
export function augmentSignalScore(existingScore0to100, valuation, direction, mveWeight = 0.20) {
  const base = Math.max(0, Math.min(1, existingScore0to100 / 100));
  const mve = mveFactorScore(valuation, direction);
  const blended = (1 - mveWeight) * base + mveWeight * mve;
  return {
    score: Math.round(blended * 100),
    mveFactor: +mve.toFixed(3),
    mveWeight,
    delta: Math.round((blended - base) * 100),
  };
}

// Example wiring (documentation only — do NOT paste into signal.js unprompted):
//
//   import { runMVE } from './mve/index.js';
//   import { augmentSignalScore } from './mve/signalAdapter.js';
//   const val = runMVE(buildCtxFromCompassAndFred(sym));   // live adapter you write
//   const { score } = augmentSignalScore(computeSignalScore(entry, tierData, hmm), val, entry.direction);
