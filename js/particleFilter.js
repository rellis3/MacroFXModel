/**
 * Bootstrap particle filter — client-side 5m regime estimation (suggestion #7).
 *
 * States mirror the server-side HMM: BULL | BEAR | RANGE | CHOP
 * Observations per bar: log return + ATR-normalised range.
 * Systematic resampling keeps effective sample size above N/2.
 *
 * Controlled by FEATURE_FLAGS.PARTICLE_FILTER in config.js — set to false to
 * disable without removing the code.
 */

import { FEATURE_FLAGS } from './config.js';

const STATES      = ['BULL', 'BEAR', 'RANGE', 'CHOP'];
const N_PARTICLES = 200;
const ATR_ALPHA   = 0.15;   // EMA-ATR smoothing — matches vol.js

// Per-state emission parameters: [return mean, return σ, normalised-range mean, normalised-range σ]
// Calibrated on FX 5m data. Range is normalised by the 20-bar EMA-ATR.
const EMISSION = {
  BULL:  { mu_r:  0.00035, sig_r: 0.0040, mu_atr: 1.00, sig_atr: 0.30 },
  BEAR:  { mu_r: -0.00035, sig_r: 0.0040, mu_atr: 1.00, sig_atr: 0.30 },
  RANGE: { mu_r:  0.00000, sig_r: 0.0022, mu_atr: 0.65, sig_atr: 0.22 },
  CHOP:  { mu_r:  0.00000, sig_r: 0.0055, mu_atr: 1.35, sig_atr: 0.40 },
};

// Markov transition matrix — rows = from, cols = to (BULL, BEAR, RANGE, CHOP)
// High diagonal persistence: trending states stickier than choppy states.
const TRANSITION = [
  [0.85, 0.05, 0.06, 0.04],  // BULL
  [0.05, 0.85, 0.06, 0.04],  // BEAR
  [0.07, 0.07, 0.78, 0.08],  // RANGE
  [0.07, 0.07, 0.10, 0.76],  // CHOP
];

function gaussPdf(x, mu, sigma) {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * 2.5066282746);  // 2.506… = √(2π)
}

// Systematic resampling — lower variance than multinomial, O(N).
function systematicResample(weights) {
  const N  = weights.length;
  const cs = new Float64Array(N);
  cs[0] = weights[0];
  for (let i = 1; i < N; i++) cs[i] = cs[i - 1] + weights[i];

  const u0  = Math.random() / N;
  const idx = new Int32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const u = u0 + i / N;
    while (j < N - 1 && cs[j] < u) j++;
    idx[i] = j;
  }
  return idx;
}

/**
 * @param {Array<{open,high,low,close}>} bars  5m bars, newest-first (S.ohlc5m format)
 * @param {number} [nParticles]
 * @returns {{ regime, confidence, pBull, pBear, pRange, pChop } | null}
 */
export function runParticleFilter(bars, nParticles = N_PARTICLES) {
  if (!FEATURE_FLAGS.PARTICLE_FILTER) return null;
  if (!bars || bars.length < 30) return null;

  // Work chronologically on the most recent 200 bars (~17h of 5m data)
  const chron = bars.slice(0, 200).reverse();
  const n     = chron.length;

  // Compute returns and true ranges
  const logRets = new Float64Array(n - 1);
  const trueRng = new Float64Array(n - 1);
  for (let i = 1; i < n; i++) {
    const c  = parseFloat(chron[i].close ?? chron[i].mid?.c);
    const pc = parseFloat(chron[i - 1].close ?? chron[i - 1].mid?.c);
    const h  = parseFloat(chron[i].high ?? chron[i].mid?.h);
    const l  = parseFloat(chron[i].low  ?? chron[i].mid?.l);
    logRets[i - 1] = pc > 0 ? Math.log(c / pc) : 0;
    trueRng[i - 1] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }

  // EMA-ATR for range normalisation
  let emaATR = trueRng[0] || 1e-6;
  for (let i = 1; i < trueRng.length; i++) {
    emaATR = ATR_ALPHA * trueRng[i] + (1 - ATR_ALPHA) * emaATR;
  }
  if (emaATR <= 0) return null;

  // Initialise particles uniformly across states
  const nS  = STATES.length;
  let parts = new Int8Array(nParticles);
  let wts   = new Float64Array(nParticles).fill(1 / nParticles);
  for (let i = 0; i < nParticles; i++) parts[i] = i % nS;

  // Sequential importance resampling
  for (let t = 0; t < logRets.length; t++) {
    const r   = logRets[t];
    const atr = trueRng[t] / emaATR;

    // Propagate each particle through transition matrix
    const next = new Int8Array(nParticles);
    for (let i = 0; i < nParticles; i++) {
      const row = TRANSITION[parts[i]];
      const u   = Math.random();
      let cum = 0, ns = nS - 1;
      for (let s = 0; s < nS; s++) {
        cum += row[s];
        if (u < cum) { ns = s; break; }
      }
      next[i] = ns;
    }
    parts = next;

    // Weight by emission likelihood
    let sumW = 0;
    const newW = new Float64Array(nParticles);
    for (let i = 0; i < nParticles; i++) {
      const em  = EMISSION[STATES[parts[i]]];
      const lk  = gaussPdf(r, em.mu_r, em.sig_r) * gaussPdf(atr, em.mu_atr, em.sig_atr);
      newW[i]   = Math.max(wts[i] * lk, 1e-300);
      sumW     += newW[i];
    }
    for (let i = 0; i < nParticles; i++) newW[i] /= sumW;
    wts = newW;

    // Resample when ESS drops below N/2
    let sumSq = 0;
    for (let i = 0; i < nParticles; i++) sumSq += wts[i] * wts[i];
    if (1 / sumSq < nParticles / 2) {
      const idx  = systematicResample(wts);
      const rp   = new Int8Array(nParticles);
      const rw   = new Float64Array(nParticles).fill(1 / nParticles);
      for (let i = 0; i < nParticles; i++) rp[i] = parts[idx[i]];
      parts = rp;
      wts   = rw;
    }
  }

  // Aggregate final state probabilities
  const probs = new Float64Array(nS);
  for (let i = 0; i < nParticles; i++) probs[parts[i]] += wts[i];

  let bestState = 0;
  for (let s = 1; s < nS; s++) if (probs[s] > probs[bestState]) bestState = s;

  return {
    regime:     STATES[bestState],
    confidence: Math.round(probs[bestState] * 100),
    pBull:      Math.round(probs[0] * 100),
    pBear:      Math.round(probs[1] * 100),
    pRange:     Math.round(probs[2] * 100),
    pChop:      Math.round(probs[3] * 100),
  };
}
