// mve/ensemble.js — Phase 3. Combines the Bucket-A anchor estimates into ONE
// consensus fair value with an honest uncertainty and a dispersion (member
// disagreement). Precision-weighted by default; when a member correlation matrix
// is supplied it uses the min-variance (generalized least squares) combination so
// correlated members — e.g. compass, yield and carry all keyed off rates — are
// not double-counted (see MARKET_VALUATION_ENGINE.md Part 3).

import { inv } from './linalg.js';
import { regimeMultiplier } from './regimeWeights.js';

// Precision weights wᵢ ∝ 1/σᵢ², optionally scaled by per-member confidence and
// the regime multiplier, then renormalized to sum 1.
function baseWeights(anchors, regime) {
  const raw = anchors.map(a => {
    const prec = 1 / (a.sigma * a.sigma);
    const conf = a.confidence ?? 1;
    return prec * conf * regimeMultiplier(a.name, regime);
  });
  const s = raw.reduce((x, y) => x + y, 0) || 1;
  return raw.map(w => w / s);
}

// Min-variance weights given a member covariance Σ (from correlation × σ's):
//   w ∝ Σ⁻¹·1, renormalized. Falls back to precision weights if Σ is singular.
function minVarWeights(anchors, corr, regime) {
  const k = anchors.length;
  if (!corr || corr.length !== k) return baseWeights(anchors, regime);
  const Sigma = corr.map((row, i) => row.map((r, j) => r * anchors[i].sigma * anchors[j].sigma));
  const Si = inv(Sigma);
  if (!Si) return baseWeights(anchors, regime);
  const ones = new Array(k).fill(1);
  let w = Si.map(row => row.reduce((s, v, j) => s + v * ones[j], 0));
  // fold in confidence + regime tilt, clamp negatives to 0 (long-only fair-value blend)
  w = w.map((wi, i) => Math.max(0, wi) * (anchors[i].confidence ?? 1) * regimeMultiplier(anchors[i].name, regime));
  const s = w.reduce((x, y) => x + y, 0);
  return s > 0 ? w.map(x => x / s) : baseWeights(anchors, regime);
}

// Combine anchors → consensus. opts: { regime, corr (k×k correlation of member
// errors) }. Returns fairValue, sigma (of the consensus), dispersion (weighted
// std of member fair values), weights, and the per-member breakdown.
export function combine(anchors, { regime = 'NEUTRAL', corr = null } = {}) {
  if (!anchors || anchors.length === 0) return null;
  if (anchors.length === 1) {
    const a = anchors[0];
    return { fairValue: a.fairValue, sigma: a.sigma, dispersion: 0,
             weights: [1], members: [{ name: a.name, fairValue: a.fairValue, sigma: a.sigma, weight: 1 }], regime };
  }
  const w = corr ? minVarWeights(anchors, corr, regime) : baseWeights(anchors, regime);
  const fairValue = anchors.reduce((s, a, i) => s + w[i] * a.fairValue, 0);

  // Consensus variance: wᵀΣw (uses corr if given, else assumes independence).
  let varC = 0;
  if (corr) {
    for (let i = 0; i < anchors.length; i++)
      for (let j = 0; j < anchors.length; j++)
        varC += w[i] * w[j] * corr[i][j] * anchors[i].sigma * anchors[j].sigma;
  } else {
    varC = anchors.reduce((s, a, i) => s + w[i] * w[i] * a.sigma * a.sigma, 0);
  }
  const sigma = Math.sqrt(Math.max(1e-18, varC));

  // Dispersion = weighted std of member fair values around the consensus. High
  // dispersion = models disagree = confidence should fall (Part 4).
  const dispersion = Math.sqrt(
    anchors.reduce((s, a, i) => s + w[i] * (a.fairValue - fairValue) ** 2, 0),
  );

  // Effective number of independent bets (inverse HHI of weights) — a diagnostic
  // that flags when the "ensemble" is really one model wearing five hats.
  const hhi = w.reduce((s, x) => s + x * x, 0);
  const effN = hhi > 0 ? 1 / hhi : anchors.length;

  return {
    fairValue, sigma, dispersion, effN, regime,
    weights: w,
    members: anchors.map((a, i) => ({ name: a.name, fairValue: a.fairValue, sigma: a.sigma, weight: +w[i].toFixed(3) })),
  };
}
