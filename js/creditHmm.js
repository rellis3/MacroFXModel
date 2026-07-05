// ── creditHmm.js ──────────────────────────────────────────────────────────────
// A standalone 2-state (calm / stress) Gaussian Hidden Markov Model for a 1-D
// series — the credit spread or its daily change. It gives the *principled*
// persistence ("theta") term the credit signal wants: probabilistic regime
// labels, self-transition probabilities, expected regime durations, and the
// current-regime posterior — instead of a hand-drawn "days above the average".
//
// Pure: number[] in, object out. No DOM, network, or globals. Log-space
// forward-backward (Baum-Welch EM) + Viterbi — numerically stable for the
// few-hundred daily observations this runs on. Deterministic (fixed init), so
// the same series always yields the same fit.
//
// Design & rationale: docs/CREDIT_SIGNAL_SPEC.md §2 (persistence / theta).

const LOG_2PI = Math.log(2 * Math.PI);
const NEG_INF = -Infinity;

function logGauss(x, mu, sigma) {
  const s = Math.max(sigma, 1e-6);
  const z = (x - mu) / s;
  return -0.5 * LOG_2PI - Math.log(s) - 0.5 * z * z;
}

// logsumexp over an array
function lse(arr) {
  let m = NEG_INF;
  for (const v of arr) if (v > m) m = v;
  if (m === NEG_INF) return NEG_INF;
  let s = 0;
  for (const v of arr) s += Math.exp(v - m);
  return m + Math.log(s);
}

const meanOf = a => a.reduce((s, x) => s + x, 0) / a.length;
const stdOf = (a, m) => Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length);

// ── Fit a K=2 Gaussian HMM ────────────────────────────────────────────────────
// obs: number[] (e.g. z-scored spread level, or daily Δbps)
// Returns { states, mu, sigma, A, pi, gamma, path, logLik, iters } or null.
export function fitGaussianHMM2(obs, { iters = 200, tol = 1e-6, stickiness = 0.9 } = {}) {
  const T = (obs ?? []).filter(v => Number.isFinite(v)).length;
  if (!obs || obs.length !== T || T < 20) return null;   // need clean, sufficient data
  const K = 2;

  // Deterministic init: two means at ±0.6σ around the sample mean, sticky transitions.
  const m0 = meanOf(obs), sd0 = stdOf(obs, m0) || 1;
  let mu = [m0 - 0.6 * sd0, m0 + 0.6 * sd0];   // state 0 = lower (calm), 1 = higher (stress)
  let sigma = [sd0, sd0];
  let logPi = [Math.log(0.5), Math.log(0.5)];
  let logA = [
    [Math.log(stickiness), Math.log(1 - stickiness)],
    [Math.log(1 - stickiness), Math.log(stickiness)],
  ];

  let prevLL = NEG_INF, gamma = null, logAlpha = null;
  for (let it = 0; it < iters; it++) {
    // Emissions
    const logB = obs.map(x => [logGauss(x, mu[0], sigma[0]), logGauss(x, mu[1], sigma[1])]);

    // Forward (log)
    logAlpha = Array.from({ length: T }, () => [0, 0]);
    for (let k = 0; k < K; k++) logAlpha[0][k] = logPi[k] + logB[0][k];
    for (let t = 1; t < T; t++)
      for (let k = 0; k < K; k++)
        logAlpha[t][k] = lse([logAlpha[t - 1][0] + logA[0][k], logAlpha[t - 1][1] + logA[1][k]]) + logB[t][k];

    const logLik = lse(logAlpha[T - 1]);
    if (!Number.isFinite(logLik)) return null;

    // Backward (log)
    const logBeta = Array.from({ length: T }, () => [0, 0]);
    for (let t = T - 2; t >= 0; t--)
      for (let k = 0; k < K; k++)
        logBeta[t][k] = lse([
          logA[k][0] + logB[t + 1][0] + logBeta[t + 1][0],
          logA[k][1] + logB[t + 1][1] + logBeta[t + 1][1],
        ]);

    // Posteriors
    gamma = Array.from({ length: T }, () => [0, 0]);
    for (let t = 0; t < T; t++)
      for (let k = 0; k < K; k++)
        gamma[t][k] = Math.exp(logAlpha[t][k] + logBeta[t][k] - logLik);

    // Transition posteriors ξ (summed over t)
    const xiSum = [[0, 0], [0, 0]];
    for (let t = 0; t < T - 1; t++)
      for (let i = 0; i < K; i++)
        for (let j = 0; j < K; j++)
          xiSum[i][j] += Math.exp(logAlpha[t][i] + logA[i][j] + logB[t + 1][j] + logBeta[t + 1][j] - logLik);

    // M-step
    logPi = [Math.log(gamma[0][0] + 1e-12), Math.log(gamma[0][1] + 1e-12)];
    for (let i = 0; i < K; i++) {
      const denom = xiSum[i][0] + xiSum[i][1] + 1e-12;
      logA[i] = [Math.log((xiSum[i][0] + 1e-12) / denom), Math.log((xiSum[i][1] + 1e-12) / denom)];
    }
    for (let k = 0; k < K; k++) {
      let gs = 0, gm = 0;
      for (let t = 0; t < T; t++) { gs += gamma[t][k]; gm += gamma[t][k] * obs[t]; }
      gs = gs || 1e-12;
      mu[k] = gm / gs;
      let gv = 0;
      for (let t = 0; t < T; t++) gv += gamma[t][k] * (obs[t] - mu[k]) * (obs[t] - mu[k]);
      sigma[k] = Math.max(Math.sqrt(gv / gs), 1e-4);
    }

    if (Math.abs(logLik - prevLL) < tol) { prevLL = logLik; break; }
    prevLL = logLik;
  }

  // Viterbi hard path (log)
  const logB = obs.map(x => [logGauss(x, mu[0], sigma[0]), logGauss(x, mu[1], sigma[1])]);
  const delta = Array.from({ length: T }, () => [0, 0]);
  const psi = Array.from({ length: T }, () => [0, 0]);
  for (let k = 0; k < K; k++) delta[0][k] = logPi[k] + logB[0][k];
  for (let t = 1; t < T; t++)
    for (let k = 0; k < K; k++) {
      const c0 = delta[t - 1][0] + logA[0][k], c1 = delta[t - 1][1] + logA[1][k];
      psi[t][k] = c0 >= c1 ? 0 : 1;
      delta[t][k] = Math.max(c0, c1) + logB[t][k];
    }
  const path = new Array(T);
  path[T - 1] = delta[T - 1][0] >= delta[T - 1][1] ? 0 : 1;
  for (let t = T - 2; t >= 0; t--) path[t] = psi[t + 1][path[t + 1]];

  return { states: K, mu, sigma, A: logA.map(r => r.map(Math.exp)), pi: logPi.map(Math.exp),
    gamma, path, logLik: prevLL };
}

// ── Persistence read for the credit gate ("theta") ────────────────────────────
// Wraps the fit and reports the stress-regime persistence in plain numbers.
export function creditRegime(obs, opts = {}) {
  const fit = fitGaussianHMM2(obs, opts);
  if (!fit) return null;
  const stress = fit.mu[1] >= fit.mu[0] ? 1 : 0;   // higher-mean state = wider spreads = stress
  const calm = 1 - stress;
  const T = fit.path.length;
  const pStayStress = fit.A[stress][stress];
  const pStayCalm = fit.A[calm][calm];
  const expDurStress = 1 / Math.max(1 - pStayStress, 1e-6);
  const expDurCalm = 1 / Math.max(1 - pStayCalm, 1e-6);
  const curState = fit.path[T - 1] === stress ? 'stress' : 'calm';
  const curStressProb = fit.gamma[T - 1][stress];
  // days already spent in the current (Viterbi) regime
  let daysInRegime = 1;
  for (let t = T - 2; t >= 0 && fit.path[t] === fit.path[T - 1]; t--) daysInRegime++;
  const pStayCur = curState === 'stress' ? pStayStress : pStayCalm;
  const expDurCur = curState === 'stress' ? expDurStress : expDurCalm;
  return {
    curState, curStressProb,
    daysInRegime,
    persistence: pStayCur,                    // self-transition prob of the current regime
    expectedDuration: expDurCur,              // ~ 1/(1-p_stay), in observations (days)
    expectedRemaining: Math.max(expDurCur - daysInRegime, 0),
    stress: { mean: fit.mu[stress], pStay: pStayStress, expDuration: expDurStress },
    calm:   { mean: fit.mu[calm],   pStay: pStayCalm,   expDuration: expDurCalm },
    logLik: fit.logLik,
  };
}
