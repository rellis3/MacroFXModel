// hmm5m-train.js — Baum-Welch EM parameter learning for HMM V2
//
// Fetches 5000 M1 OANDA bars per instrument, learns emission means/variances
// and transition matrix, stores results in KV under 'hmm5m_trained_params'.
// Also fetches FRED macro snapshot (VIX, HY, GS10, GS2) and saves to KV.
//
// Exports:
//   trainHMM5mAll(pairs, oandaKey, oandaEnv)  — main training pass
//   loadTrainedParams()                         — loads params + macro from KV

import * as kv from './kv.js';
import { HMM_V2_CONFIG, extractFeatures, computeMacroContext } from './hmm5m-v2.js';

const K               = 4;
const MAX_ITER        = 40;
const CONVERGENCE_EPS = 0.5;

// Default emission means [trendZ, volZ, adxZ] per state — mirrors hmm5m-v2.js
const DEFAULT_MEANS = [
  [+1.0,  0.0, +0.7],
  [-1.0,  0.0, +0.7],
  [ 0.0,  0.0, -1.0],
  [ 0.0, +1.0,  0.0],
];

// ── Utility ────────────────────────────────────────────────────────────────────

// Gaussian log-likelihood with per-state variance
function gaussLL(x, mu, variance) {
  return -0.5 * ((x - mu) ** 2) / Math.max(variance, 1e-6) - 0.5 * Math.log(Math.max(variance, 1e-6));
}

// Log-sum-exp for an array of K values
function lseK(vals) {
  let mx = vals[0];
  for (let i = 1; i < vals.length; i++) if (vals[i] > mx) mx = vals[i];
  let sum = 0;
  for (let i = 0; i < vals.length; i++) sum += Math.exp(vals[i] - mx);
  return mx + Math.log(sum);
}

// ── OANDA bar fetcher ──────────────────────────────────────────────────────────

async function fetchTrainingBars(sym, oandaKey, oandaEnv, count = 5000) {
  const instrument = sym.replace('/', '_');
  const base = (oandaEnv || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
  try {
    const r = await fetch(
      `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=M1&count=${count}&price=M`,
      { headers: { Authorization: `Bearer ${oandaKey}` }, signal: AbortSignal.timeout(30_000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return (d.candles ?? [])
      .filter(c => c.complete !== false && c.mid)
      .map(c => ({ open: c.mid.o, high: c.mid.h, low: c.mid.l, close: c.mid.c }));
  } catch {
    return null;
  }
}

// ── FRED macro fetcher ─────────────────────────────────────────────────────────

async function fetchFredMacro(fredKey) {
  if (!fredKey) return null;
  const seriesMap = {
    vix:  'VIXCLS',
    hy:   'BAMLH0A0HYM2',
    gs10: 'DGS10',
    gs2:  'DGS2',
  };
  try {
    const results = await Promise.all(
      Object.entries(seriesMap).map(async ([key, id]) => {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${fredKey}&file_type=json&sort_order=desc&limit=2`;
        const r   = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return [key, null];
        const d = await r.json();
        // Find first observation with a valid numeric value
        const obs = (d.observations ?? []).find(o => o.value && o.value !== '.' && !isNaN(parseFloat(o.value)));
        return [key, obs ? { value: parseFloat(obs.value) } : null];
      })
    );
    const out = {};
    for (const [key, val] of results) out[key] = val;
    return out;
  } catch {
    return null;
  }
}

// ── Default params ─────────────────────────────────────────────────────────────

function getDefaultParams(sym) {
  const cfg     = HMM_V2_CONFIG[sym] ?? HMM_V2_CONFIG._default;
  const selfP   = cfg.selfProb;
  const offDiag = (1 - selfP) / 3;

  const A = Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (_, j) => j === i ? selfP : offDiag)
  );

  const means = DEFAULT_MEANS.map(row => [...row]);
  const vars  = Array.from({ length: K }, () => [1.0, 1.0, 1.0]);
  const pi    = [0.25, 0.25, 0.25, 0.25];

  return { A, means, vars, pi };
}

// ── Baum-Welch EM ──────────────────────────────────────────────────────────────

function baumWelch(features, initParams) {
  const T = features.length;
  const F = 3;
  if (T < 40) return null;

  // Deep copy initial params
  let params = {
    A:    initParams.A.map(row => [...row]),
    means: initParams.means.map(row => [...row]),
    vars:  initParams.vars.map(row => [...row]),
    pi:    [...initParams.pi],
  };

  let prevLogLik = -Infinity;
  let iterations = 0;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    iterations = iter + 1;

    const { A, means, vars, pi } = params;

    // Log transition matrix
    const logA = A.map(row => row.map(p => Math.log(Math.max(p, 1e-300))));

    // 1. Pre-compute logEmit[t][k]
    const logEmit = [];
    for (let t = 0; t < T; t++) {
      const row = new Float64Array(K);
      for (let k = 0; k < K; k++) {
        let ll = 0;
        for (let f = 0; f < F; f++) ll += gaussLL(features[t][f], means[k][f], vars[k][f]);
        row[k] = ll;
      }
      logEmit.push(row);
    }

    // 2. Forward pass: logAlpha[T][K]
    const logAlpha = [];
    {
      const a0 = new Float64Array(K);
      for (let k = 0; k < K; k++) a0[k] = Math.log(Math.max(pi[k], 1e-300)) + logEmit[0][k];
      logAlpha.push(a0);
    }
    for (let t = 1; t < T; t++) {
      const at = new Float64Array(K);
      for (let j = 0; j < K; j++) {
        const vals = new Float64Array(K);
        for (let ii = 0; ii < K; ii++) vals[ii] = logAlpha[t - 1][ii] + logA[ii][j];
        at[j] = lseK(vals) + logEmit[t][j];
      }
      logAlpha.push(at);
    }

    // 3. Total log-likelihood
    const totalLogLik = lseK(logAlpha[T - 1]);

    // 4. Convergence check
    if (iter > 3 && Math.abs(totalLogLik - prevLogLik) < CONVERGENCE_EPS) break;
    prevLogLik = totalLogLik;

    // 5. Backward pass + accumulate sufficient statistics
    const sumGamma   = new Float64Array(K);
    const sumGammaX  = Array.from({ length: K }, () => new Float64Array(F));
    const sumGammaX2 = Array.from({ length: K }, () => new Float64Array(F));
    const sumXi      = Array.from({ length: K }, () => new Float64Array(K));

    // β[T-1] = 1 → log β[T-1] = 0
    let logBeta = new Float64Array(K).fill(0);

    // Accumulate γ[T-1]
    for (let k = 0; k < K; k++) {
      const g = Math.exp(logAlpha[T - 1][k] + logBeta[k] - totalLogLik);
      sumGamma[k] += g;
      for (let f = 0; f < F; f++) {
        const x = features[T - 1][f];
        sumGammaX[k][f]  += g * x;
        sumGammaX2[k][f] += g * x * x;
      }
    }

    // Loop t from T-2 down to 0
    for (let t = T - 2; t >= 0; t--) {
      const bNext = logBeta; // save β[t+1] before overwriting

      // Compute new logBeta = β[t]
      const newLogBeta = new Float64Array(K);
      for (let ii = 0; ii < K; ii++) {
        const vals = new Float64Array(K);
        for (let j = 0; j < K; j++) vals[j] = logA[ii][j] + logEmit[t + 1][j] + bNext[j];
        newLogBeta[ii] = lseK(vals);
      }

      // Accumulate γ[t]
      for (let k = 0; k < K; k++) {
        const g = Math.exp(logAlpha[t][k] + newLogBeta[k] - totalLogLik);
        sumGamma[k] += g;
        for (let f = 0; f < F; f++) {
          const x = features[t][f];
          sumGammaX[k][f]  += g * x;
          sumGammaX2[k][f] += g * x * x;
        }
      }

      // Accumulate ξ[t][i][j] — uses bNext (β[t+1])
      for (let ii = 0; ii < K; ii++) {
        for (let j = 0; j < K; j++) {
          const xi = Math.exp(
            logAlpha[t][ii] + logA[ii][j] + logEmit[t + 1][j] + bNext[j] - totalLogLik
          );
          sumXi[ii][j] += xi;
        }
      }

      logBeta = newLogBeta;
    }

    // 6. M-step

    // New transition matrix with Laplace smoothing
    const newA = Array.from({ length: K }, (_, i) => {
      const rowSum = sumXi[i].reduce((s, v) => s + v + 0.01, 0);
      return Array.from({ length: K }, (_, j) => (sumXi[i][j] + 0.01) / rowSum);
    });
    // Renormalize rows (should already sum to 1 but guard against float drift)
    for (let i = 0; i < K; i++) {
      const s = newA[i].reduce((a, b) => a + b, 0);
      for (let j = 0; j < K; j++) newA[i][j] /= s;
    }

    // New emission means and variances
    const newMeans = Array.from({ length: K }, (_, k) =>
      Array.from({ length: F }, (_, f) => sumGammaX[k][f] / (sumGamma[k] + 1e-10))
    );
    const newVars = Array.from({ length: K }, (_, k) =>
      Array.from({ length: F }, (_, f) =>
        Math.max(0.05,
          sumGammaX2[k][f] / (sumGamma[k] + 1e-10) - newMeans[k][f] ** 2
        )
      )
    );

    // New initial state distribution
    const logAlpha0Sum = lseK(logAlpha[0]);
    const newPi = Array.from({ length: K }, (_, k) =>
      Math.exp(logAlpha[0][k] - logAlpha0Sum)
    );

    params = { A: newA, means: newMeans, vars: newVars, pi: newPi };
  }

  return { ...params, iterations, logLik: prevLogLik };
}

// ── Main training pass ─────────────────────────────────────────────────────────

export async function trainHMM5mAll(pairs, oandaKey, oandaEnv) {
  // Load existing stored params (merge — don't replace pairs not in this run)
  let storedRaw = null;
  try { storedRaw = await kv.get('hmm5m_trained_params'); } catch { /* ignore */ }
  const existing = storedRaw ? JSON.parse(storedRaw) : {};

  const results = { ...existing };
  const status  = {};

  for (const sym of pairs) {
    status[sym] = { status: 'fetching' };
    try {
      const bars = await fetchTrainingBars(sym, oandaKey, oandaEnv, 5000);
      if (!bars || bars.length < 200) {
        status[sym] = { status: 'error', reason: 'insufficient bars', nBars: bars?.length ?? 0 };
        continue;
      }

      status[sym] = { status: 'training', nBars: bars.length };

      const { features } = extractFeatures(bars, sym);
      if (!features || features.length < 40) {
        status[sym] = { status: 'error', reason: 'insufficient features', nFeatures: features?.length ?? 0 };
        continue;
      }

      const initParams = getDefaultParams(sym);
      const learned    = baumWelch(features, initParams);
      if (!learned) {
        status[sym] = { status: 'error', reason: 'baumWelch returned null' };
        continue;
      }

      results[sym] = {
        means:       learned.means,
        vars:        learned.vars,
        transMatrix: learned.A,
        pi:          learned.pi,
        learnedAt:   new Date().toISOString(),
        nBars:       bars.length,
        nFeatures:   features.length,
        iterations:  learned.iterations,
        logLik:      learned.logLik,
      };
      status[sym] = { status: 'done', iterations: learned.iterations, logLik: learned.logLik };
    } catch (e) {
      status[sym] = { status: 'error', reason: e.message };
    }
  }

  // Persist merged trained params
  await kv.put('hmm5m_trained_params', JSON.stringify(results));

  // Fetch FRED macro and persist
  try {
    const fredKey  = process.env.FRED_KEY;
    const fredData = await fetchFredMacro(fredKey);
    const macroCtx = computeMacroContext(fredData);
    await kv.put('hmm5m_macro_context', JSON.stringify({ ...macroCtx, updatedAt: new Date().toISOString() }));
  } catch (e) {
    console.error('[hmm5m-train] FRED macro fetch failed:', e.message);
  }

  return { results, status };
}

// ── Loader ─────────────────────────────────────────────────────────────────────

export async function loadTrainedParams() {
  const [trainedRaw, macroRaw] = await Promise.all([
    kv.get('hmm5m_trained_params').catch(() => null),
    kv.get('hmm5m_macro_context').catch(() => null),
  ]);

  return {
    trainedParams: trainedRaw ? JSON.parse(trainedRaw) : null,
    macroContext:  macroRaw   ? JSON.parse(macroRaw)   : null,
  };
}
