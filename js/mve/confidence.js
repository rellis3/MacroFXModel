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
//
// Design notes (why it no longer prints 100%):
//   • A SKEPTICAL PRIOR (negative intercept) means thin/absent evidence lands at a
//     modest confidence, not certainty. Confidence has to be EARNED.
//   • `baseRateReality` is the most important input: how well the model's own
//     convergence probability matches the MEASURED empirical snap-back base rate.
//     When the model says 96% and history says 0%, this crushes confidence — the
//     exact contradiction that used to hide behind a 100% badge.
//   • `fit` evidence is capped (a levels-regression r² is partly spurious/auto-
//     correlated, so a 0.95 r² must not buy near-certainty).
//   • Output is capped to [0.03, 0.90]: no honest macro fair value is ever 100%,
//     and none is ever truly 0.
export function confidenceEngine(inp = {}) {
  const W = {
    baseRateReality: 1.6,   // model P(convergence) vs empirical snap-back base rate
    agreement:       0.9,   // independence-scaled by the caller
    calibration:     1.2,
    fit:             0.9,
    reversion:       0.8,
    regimeStable:    0.9,
    corrStable:      0.7,
    volWeight:       0.8,
    posWeight:       0.4,
  };
  const INTERCEPT = -0.7;   // skeptical prior: empty evidence ⇒ σ(-0.7) ≈ 0.33
  // Global clamp so NO single input can saturate and dominate the logit. Evidence at
  // 0/1 produces a ±9 log-odds swing; a lone noisy signal (e.g. a maxed "vol is calm")
  // must not be able to cancel a legitimate reality-check penalty. Cap each input's
  // pull into a sane band before weighting.
  const EV_LO = 0.06, EV_HI = 0.94;
  let logOdds = INTERCEPT;
  const contributions = { _prior: { evidence: null, contribution: INTERCEPT } };
  for (const key of Object.keys(W)) {
    if (inp[key] == null) continue;
    let e = clamp01(inp[key]);
    if (key === 'fit') e = Math.min(0.85, e);   // cap: don't over-credit a levels r²
    e = Math.max(EV_LO, Math.min(EV_HI, e));    // global anti-saturation clamp
    const c = W[key] * Math.log(e / (1 - e));
    logOdds += c;
    contributions[key] = { evidence: +e.toFixed(3), contribution: +c.toFixed(3) };
  }
  const raw = 1 / (1 + Math.exp(-logOdds));
  return { confidence: Math.max(0.03, Math.min(0.90, raw)), contributions };
}

// Independence-scale an agreement score: N models agreeing is weak evidence when
// they're really one factor wearing N hats. Pulls agreement toward 0.5 (neutral)
// as the effective number of independent bets (effN) falls toward 1.
export function scaleAgreementByIndependence(agreement, effN) {
  if (!Number.isFinite(agreement)) return null;
  const w = Math.max(0, Math.min(1, (effN - 1) / 2));   // effN 1→0, 3→1
  return 0.5 + (agreement - 0.5) * w;
}

// Reality-check evidence: 1 when the model's convergence probability matches the
// measured empirical base rate, →0 as they diverge. Only meaningful with enough
// historical events; returns null (ignored) otherwise.
export function baseRateReality(modelP, snapback, minEvents = 5) {
  if (modelP == null || !snapback || snapback.baseRate == null || snapback.events < minEvents) return null;
  return clamp01(1 - Math.min(1, Math.abs(modelP - snapback.baseRate)));
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
