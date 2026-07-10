// mve/confidence.js — Phase 4. The confidence engine: a calibrated probability
// that the fair value is trustworthy and the gap will converge, built as a
// logistic over independent standardized evidences (MARKET_VALUATION_ENGINE.md
// Part 4). Reuses the log-odds pattern from js/macro.js computeBayesianScore.
//
// Inputs (all optional; each contributes only if present):
//   agreement   — 1−normalized dispersion (models agree ⇒ ↑)
//   fit         — mean member r² / cointegration quality (↑)
//   calibration — OOS band coverage close to nominal (↑); |coverage−nominal| (↓)
//   regimeStable— HMM self-transition prob / (1−changePointProb) (↑)
//   corrStable  — rolling-correlation stability of the drivers (↑)
//   reversion   — OU health: fast, significant half-life (↑)
//   volWeight   — Bucket-B vol confidence (↓ when vol expanding)
//   posWeight   — Bucket-B positioning confidence

const clamp01 = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0.5));

// Each evidence e in [0,1] contributes β·logit(e). Weights are a small principled
// table, not swept knobs. Returns { confidence, contributions }.
export function confidenceEngine(inp = {}) {
  const W = {
    agreement:    1.1,
    fit:          1.0,
    calibration:  1.2,
    regimeStable: 0.9,
    corrStable:   0.7,
    reversion:    1.0,
    volWeight:    0.8,
    posWeight:    0.4,
  };
  let logOdds = 0;
  const contributions = {};
  for (const key of Object.keys(W)) {
    if (inp[key] == null) continue;
    const e = clamp01(inp[key]);
    const c = W[key] * Math.log(Math.max(1e-4, e) / Math.max(1e-4, 1 - e));
    logOdds += c;
    contributions[key] = { evidence: +e.toFixed(3), contribution: +c.toFixed(3) };
  }
  return { confidence: 1 / (1 + Math.exp(-logOdds)), contributions };
}

// Helper: convert ensemble dispersion (member disagreement) + consensus σ into an
// agreement score in [0,1] — tight agreement ⇒ ≈1.
export function agreementScore(dispersion, sigma) {
  if (!(sigma > 0)) return 0.5;
  const ratio = dispersion / sigma;          // 0 = perfect agreement
  return clamp01(1 - Math.min(1, ratio));
}

// Helper: calibration → score. coverage near nominal ⇒ ≈1; badly off ⇒ →0.
export function calibrationScore(calib) {
  if (!calib) return null;
  const parts = Object.values(calib).filter(c => c.coverage != null);
  if (!parts.length) return null;
  const err = parts.reduce((s, c) => s + Math.abs(c.coverage - c.nominal), 0) / parts.length;
  return clamp01(1 - 2 * err);               // 0.5 coverage error ⇒ score 0
}

export { clamp01 };
