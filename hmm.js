// hmm.js — 2-state Gaussian Hidden Markov Model for market regime detection
//
// States:
//   0 = RANGE  (mean-reverting, small return variance — ideal for fade trades)
//   1 = TREND  (directional, large return variance — fade trades carry more risk)
//
// Observations: daily log returns (scalar per bar)
// Algorithm: Baum-Welch EM for parameter estimation, Viterbi for state decoding
// Numerically stable via per-timestep scaling in the forward pass.

// ── Gaussian PDF ──────────────────────────────────────────────────────────────

function gaussian(x, mu, sigma) {
  if (sigma <= 0) return 0;
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

// ── Scaled forward pass ───────────────────────────────────────────────────────
// Returns { alpha: T×N, scales: T } where each alpha[t] sums to 1.

function forward(obs, A, B, pi) {
  const T = obs.length, N = A.length;
  const alpha = [], scales = [];

  let row = pi.map((p, i) => p * gaussian(obs[0], B[i].mu, B[i].sigma));
  let c = row.reduce((s, x) => s + x, 0) || 1e-300;
  scales.push(c);
  alpha.push(row.map(x => x / c));

  for (let t = 1; t < T; t++) {
    row = B.map((b, j) => {
      let sum = 0;
      for (let i = 0; i < N; i++) sum += alpha[t - 1][i] * A[i][j];
      return sum * gaussian(obs[t], b.mu, b.sigma);
    });
    c = row.reduce((s, x) => s + x, 0) || 1e-300;
    scales.push(c);
    alpha.push(row.map(x => x / c));
  }

  return { alpha, scales };
}

// ── Scaled backward pass ──────────────────────────────────────────────────────

function backward(obs, A, B, scales) {
  const T = obs.length, N = A.length;
  const beta = Array.from({ length: T }, () => new Array(N).fill(0));

  for (let i = 0; i < N; i++) beta[T - 1][i] = 1 / (scales[T - 1] || 1);

  for (let t = T - 2; t >= 0; t--) {
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = 0; j < N; j++) {
        sum += A[i][j] * gaussian(obs[t + 1], B[j].mu, B[j].sigma) * beta[t + 1][j];
      }
      beta[t][i] = sum / (scales[t] || 1);
    }
  }

  return beta;
}

// ── Viterbi decoding ──────────────────────────────────────────────────────────

function viterbi(obs, A, B, pi) {
  const T = obs.length, N = A.length;
  const delta = [], psi = [];

  // Use log probabilities to avoid underflow
  const logA = A.map(row => row.map(v => Math.log(Math.max(v, 1e-300))));
  const logPi = pi.map(v => Math.log(Math.max(v, 1e-300)));

  const logB = (j, x) => {
    const p = gaussian(x, B[j].mu, B[j].sigma);
    return Math.log(Math.max(p, 1e-300));
  };

  delta.push(pi.map((_, i) => logPi[i] + logB(i, obs[0])));
  psi.push(new Array(N).fill(0));

  for (let t = 1; t < T; t++) {
    const dt = [], pt = [];
    for (let j = 0; j < N; j++) {
      let maxVal = -Infinity, maxState = 0;
      for (let i = 0; i < N; i++) {
        const v = delta[t - 1][i] + logA[i][j];
        if (v > maxVal) { maxVal = v; maxState = i; }
      }
      dt.push(maxVal + logB(j, obs[t]));
      pt.push(maxState);
    }
    delta.push(dt);
    psi.push(pt);
  }

  const states = new Array(T);
  states[T - 1] = delta[T - 1].indexOf(Math.max(...delta[T - 1]));
  for (let t = T - 2; t >= 0; t--) states[t] = psi[t + 1][states[t + 1]];

  return states;
}

// ── Baum-Welch EM ─────────────────────────────────────────────────────────────

function baumWelch(obs, maxIter = 25) {
  const T = obs.length;
  const N = 2;

  const mean = obs.reduce((s, x) => s + x, 0) / T;
  const variance = obs.reduce((s, x) => s + (x - mean) ** 2, 0) / T;
  const std = Math.sqrt(variance) || 1e-6;

  // State 0 = RANGE (tight distribution), State 1 = TREND (wide distribution)
  let A  = [[0.93, 0.07], [0.12, 0.88]];
  let B  = [
    { mu: 0.0, sigma: std * 0.65 },
    { mu: 0.0, sigma: std * 1.60 },
  ];
  let pi = [0.60, 0.40];

  for (let iter = 0; iter < maxIter; iter++) {
    const { alpha, scales } = forward(obs, A, B, pi);
    const beta = backward(obs, A, B, scales);

    // gamma[t][i] = P(state=i | obs, params)
    const gamma = alpha.map((at, t) =>
      at.map((a, i) => {
        const val = a * beta[t][i];
        return isFinite(val) ? val : 0;
      })
    );
    // Normalise each row
    for (const row of gamma) {
      const s = row.reduce((a, x) => a + x, 0) || 1;
      row.forEach((_, i) => (row[i] /= s));
    }

    // xi[t][i][j] = P(state_t=i, state_t+1=j | obs, params)
    const xi = [];
    for (let t = 0; t < T - 1; t++) {
      const xt = Array.from({ length: N }, () => new Array(N).fill(0));
      let s = 0;
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          xt[i][j] = alpha[t][i] * A[i][j] * gaussian(obs[t + 1], B[j].mu, B[j].sigma) * beta[t + 1][j];
          s += xt[i][j];
        }
      s = s || 1;
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) xt[i][j] /= s;
      xi.push(xt);
    }

    // Re-estimate pi
    pi = gamma[0].slice();

    // Re-estimate A
    for (let i = 0; i < N; i++) {
      const den = xi.reduce((s, xt) => s + gamma[gamma.indexOf(gamma[xi.indexOf(xt)])][i], 0);
      // simpler denominator: sum gamma[0..T-2][i]
      const denI = gamma.slice(0, T - 1).reduce((s, g) => s + g[i], 0) || 1e-300;
      for (let j = 0; j < N; j++) {
        A[i][j] = xi.reduce((s, xt) => s + xt[i][j], 0) / denI;
      }
      // Normalise row
      const rowSum = A[i].reduce((s, x) => s + x, 0) || 1;
      A[i] = A[i].map(v => v / rowSum);
    }

    // Re-estimate B (Gaussian emissions)
    for (let j = 0; j < N; j++) {
      const gammaJ = gamma.map(g => g[j]);
      const gSum = gammaJ.reduce((s, x) => s + x, 0) || 1e-300;
      const mu = gammaJ.reduce((s, g, t) => s + g * obs[t], 0) / gSum;
      const sig = Math.sqrt(
        gammaJ.reduce((s, g, t) => s + g * (obs[t] - mu) ** 2, 0) / gSum
      );
      B[j] = { mu, sigma: Math.max(sig, std * 0.05) };
    }
  }

  return { A, B, pi };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fit a 2-state HMM on an array of daily log returns.
 *
 * Returns:
 *   regime    — 'RANGE' | 'TREND'
 *   trendDir  — 'BULL' | 'BEAR' | null  (only set when regime === 'TREND')
 *   rangeProb — probability of being in the RANGE state (0–1)
 *   trendProb — 1 - rangeProb
 *   computedAt — ISO timestamp
 */
export function fitHMM(returns) {
  if (!returns || returns.length < 20) return null;

  try {
    const { A, B, pi } = baumWelch(returns);
    const states = viterbi(returns, A, B, pi);

    // Label states: smaller sigma = RANGE, larger sigma = TREND
    const rangeState = B[0].sigma <= B[1].sigma ? 0 : 1;
    const trendState = 1 - rangeState;

    const currentState = states[states.length - 1];
    const regime = currentState === rangeState ? 'RANGE' : 'TREND';

    // Current regime probability from forward pass (last timestep)
    const { alpha } = forward(returns, A, B, pi);
    const lastAlpha  = alpha[returns.length - 1];
    const alphaSum   = lastAlpha.reduce((s, x) => s + x, 0) || 1;
    const rangeProb  = lastAlpha[rangeState] / alphaSum;

    // Trend direction: mean of the last 10 log returns
    const recent      = returns.slice(-10);
    const recentMean  = recent.reduce((s, x) => s + x, 0) / recent.length;
    const trendDir    = regime === 'TREND' ? (recentMean >= 0 ? 'BULL' : 'BEAR') : null;

    // Sigma ratio: how clearly separated the two states are
    const sigmaRatio = Math.max(B[rangeState].sigma, 1e-9) > 0
      ? B[trendState].sigma / B[rangeState].sigma
      : 1;

    return {
      regime,
      trendDir,
      rangeProb,
      trendProb: 1 - rangeProb,
      sigmaRatio,       // >1.5 = well-separated states, <1.2 = ambiguous
      computedAt: new Date().toISOString(),
    };
  } catch (e) {
    return null;
  }
}

/**
 * Compute the HMM contribution to signalScore (0–1).
 *
 * For a reversion/fade system:
 *  - RANGE regime with high rangeProb → ideal, score near 0.90
 *  - TREND with trade direction WITH trend → pullback play, score ~0.55
 *  - TREND with trade direction AGAINST trend → counter-trend, score ~0.25
 */
export function hmmSignalScore(direction, hmmResult) {
  if (!hmmResult || !direction) return 0.50;

  if (hmmResult.regime === 'RANGE') {
    // rangeProb typically 0.55–0.95 when in RANGE state
    return Math.min(0.90, 0.45 + hmmResult.rangeProb * 0.50);
  }

  // TREND state
  const isLong           = direction === 'long';
  const trendIsBull      = hmmResult.trendDir === 'BULL';
  const tradingWithTrend = (isLong && trendIsBull) || (!isLong && !trendIsBull);

  return tradingWithTrend ? 0.55 : 0.25;
}

/**
 * Detect intraday swing structure (BOS / CHoCH) from 30m bars.
 * Uses N=3 pivot detection on the last 60 bars (~30 hours).
 * Returns { regime: 'TREND'|'RANGE', dir: 'BULL'|'BEAR'|null, label }
 */
export function compute30mSwingRegime(bars30m) {
  if (!bars30m || bars30m.length < 20) return null;
  const recent = bars30m.slice(-60);
  const N = 3;
  const highs = [], lows = [];
  for (let i = N; i < recent.length - N; i++) {
    const h = parseFloat(recent[i].high), l = parseFloat(recent[i].low);
    let isH = true, isL = true;
    for (let j = i - N; j <= i + N; j++) {
      if (j !== i && parseFloat(recent[j].high) >= h) isH = false;
      if (j !== i && parseFloat(recent[j].low)  <= l) isL = false;
    }
    if (isH) highs.push(h);
    if (isL) lows.push(l);
  }
  if (highs.length < 2 || lows.length < 2)
    return { regime: 'RANGE', dir: null, label: 'Insufficient swings' };
  const hh = highs[highs.length - 1] > highs[highs.length - 2];
  const hl = lows[lows.length - 1]   > lows[lows.length - 2];
  const lh = highs[highs.length - 1] < highs[highs.length - 2];
  const ll = lows[lows.length - 1]   < lows[lows.length - 2];
  if (hh && hl) return { regime: 'TREND', dir: 'BULL', label: 'BOS Bullish HH+HL' };
  if (lh && ll) return { regime: 'TREND', dir: 'BEAR', label: 'BOS Bearish LH+LL' };
  return { regime: 'RANGE', dir: null, label: 'CHoCH / mixed structure' };
}
