// mve/ssm.js — Phase 5. The state-space / dynamic-linear upgrade of the static
// ensemble. Treats consensus fair value as a HIDDEN STATE that evolves, with each
// emitter a NOISY OBSERVATION of it (observation variance = σᵢ²). A Kalman filter
// fuses them recursively — time-varying precision weighting and forward-propagated
// uncertainty fall out for free (MARKET_VALUATION_ENGINE.md Part 9.1). Reuses the
// same Kalman idea already in js/macro.js compute5mKalmanDev / beta_estimator.py.
//
// State model (local-level / random-walk fair value):
//   xₜ = xₜ₋₁ + wₜ ,  w ~ N(0, q)          (q = how fast fair value can drift)
//   yₜⁱ = xₜ + vₜⁱ ,  vⁱ ~ N(0, σᵢ²)        (each emitter is a reading of xₜ)

// One filter step: predict then fold in every observation of this timestep.
// state {x, P}; obs = [{ value, r }] (r = observation variance = σ²). Returns new state.
export function kalmanStep(state, obs, q) {
  // Predict
  let x = state.x;
  let P = state.P + q;
  // Sequentially update with each emitter observation
  for (const o of obs) {
    if (!Number.isFinite(o.value) || !(o.r > 0)) continue;
    const K = P / (P + o.r);            // Kalman gain
    x = x + K * (o.value - x);
    P = (1 - K) * P;
  }
  return { x, P };
}

// Run the filter over a time series of emitter observations.
// obsSeries: array (per timestep) of [{ value, r }] emitter readings.
// Returns { state:[{x,P}], last:{x,P,sigma} }.
export function runSSM(obsSeries, { q = null, init = null } = {}) {
  if (!obsSeries || !obsSeries.length) return null;
  // Auto-pick q from the scale of the observations if not given: a small fraction
  // of the observation variance keeps fair value slow-moving but not frozen.
  let qq = q;
  if (qq == null) {
    const firstVals = obsSeries.flat().map(o => o.value).filter(Number.isFinite);
    const m = firstVals.reduce((s, v) => s + v, 0) / (firstVals.length || 1);
    const scale = firstVals.reduce((s, v) => s + (v - m) ** 2, 0) / (firstVals.length || 1);
    qq = Math.max(1e-12, scale * 1e-3);
  }
  const first = obsSeries[0].find(o => Number.isFinite(o.value));
  let state = init || { x: first ? first.value : 0, P: first ? first.r : 1 };
  const out = [];
  for (const obs of obsSeries) {
    state = kalmanStep(state, obs, qq);
    out.push({ x: state.x, P: state.P });
  }
  const last = out[out.length - 1];
  return { state: out, last: { x: last.x, P: last.P, sigma: Math.sqrt(Math.max(0, last.P)) }, q: qq };
}

// Convenience: fuse a SINGLE timestep of anchor estimates into one state estimate,
// seeded from a prior (e.g. the previous consensus). Returns { fairValue, sigma }.
export function fuseOnce(anchors, prior, q = null) {
  const obs = anchors.map(a => ({ value: a.fairValue, r: a.sigma * a.sigma }));
  const scale = obs.length ? obs.reduce((s, o) => s + o.r, 0) / obs.length : 1;
  const qq = q ?? scale * 1e-2;
  const p0 = prior || { x: obs[0]?.value ?? 0, P: (obs[0]?.r ?? 1) * 4 };
  const s = kalmanStep(p0, obs, qq);
  return { fairValue: s.x, sigma: Math.sqrt(Math.max(0, s.P)), state: s };
}
