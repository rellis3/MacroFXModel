// mve/mispricing.js — Phase 2. Turns (price, fairValue, σ) into a statistically
// principled mispricing score, and provides the multi-factor Mahalanobis metric
// for the ensemble case. See MARKET_VALUATION_ENGINE.md Part 5.
//
// Ranking (weakest→strongest): raw diff < %diff < price-z < standardized residual
// < prediction-interval-adjusted t-stat < Mahalanobis (multi-factor).

import { inv, quad } from './linalg.js';
import { normCdf } from './ou.js';

// Standardized mispricing. σ SHOULD be the prediction σ from ols.predictSigma
// (already folds in β estimation error), making this the strongest single-model
// score. Positive z = price ABOVE fair value (rich); negative = cheap.
export function standardizedMispricing(price, fairValue, sigma) {
  if (!(sigma > 0) || !Number.isFinite(price) || !Number.isFinite(fairValue)) return null;
  const gap = price - fairValue;
  const z = gap / sigma;
  return {
    gap,                                // price units
    z,                                  // standard deviations
    rich: z > 0,
    tailProb: 2 * (1 - normCdf(Math.abs(z))),   // two-sided p that a deviation this big is noise
    label: z > 0 ? 'rich' : 'cheap',
  };
}

// Mahalanobis distance of the joint deviation vector across correlated factors —
// the correct multi-factor generalization (standardizes by the covariance so
// correlated cheapness isn't double-counted). vec/mean length k; cov is k×k.
export function mahalanobis(vec, meanVec, cov) {
  const d = vec.map((v, i) => v - meanVec[i]);
  const ci = inv(cov);
  if (!ci) return null;
  const m2 = quad(d, ci);
  return Math.sqrt(Math.max(0, m2));    // distance in σ-equivalent units
}

// Bayesian posterior that a genuine mispricing exists, combining independent
// pieces of evidence as log-odds (reuses the naive-Bayes pattern from
// js/macro.js computeBayesianScore). evidences: [{ p, weight }] with p in (0,1)
// = each source's probability the gap is real. Returns posterior probability.
export function bayesianMispriceProb(evidences, prior = 0.5) {
  let logOdds = Math.log(prior / (1 - prior));
  for (const e of evidences) {
    const p = Math.max(1e-4, Math.min(1 - 1e-4, e.p));
    const w = e.weight ?? 1;
    logOdds += w * Math.log(p / (1 - p));
  }
  return 1 / (1 + Math.exp(-logOdds));
}
