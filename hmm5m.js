// hmm5m.js — Live 5-minute HMM Market Regime Classifier
//
// Algorithm: linreg slope(N) + ATR(20) + ADX(14), each z-scored against a
// trailing 200-bar window, fed into a 3-state Forward HMM (BULL | BEAR | RANGE).
//
// Per-instrument config adjusts regime stickiness (selfProb) and the linreg
// window (linregN) — the z-scoring handles pip-size differences automatically.

export const HMM5M_CONFIG = {
  'XAU/USD':    { selfProb: 0.88, linregN: 40, minConfDisplay: 0.60, minConfBot: 0.70 },
  'NAS100_USD': { selfProb: 0.94, linregN: 60, minConfDisplay: 0.60, minConfBot: 0.65 },
  _default:     { selfProb: 0.92, linregN: 50, minConfDisplay: 0.55, minConfBot: 0.60 },
};

function getCfg(sym) {
  return HMM5M_CONFIG[sym] ?? HMM5M_CONFIG._default;
}

// Slope of the OLS regression line through `len` closes starting at `start`
function linregSlopeAt(closes, start, len) {
  if (len < 2) return 0;
  const xm = (len - 1) / 2;
  let sXY = 0, sX2 = 0;
  for (let i = 0; i < len; i++) {
    const xi = i - xm;
    sXY += xi * closes[start + i];
    sX2 += xi * xi;
  }
  return sX2 > 0 ? sXY / sX2 : 0;
}

// ATR(n) via Wilder EMA smoothing — O(N) over the full bars array
function buildATR(bars, n = 20) {
  const out = new Float64Array(bars.length);
  if (bars.length < 1) return out;
  out[0] = Math.abs(parseFloat(bars[0].high) - parseFloat(bars[0].low));
  const k = 1 / n;
  for (let i = 1; i < bars.length; i++) {
    const h  = parseFloat(bars[i].high);
    const l  = parseFloat(bars[i].low);
    const pc = parseFloat(bars[i - 1].close);
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    out[i] = (Number.isFinite(tr) && tr > 0) ? k * tr + (1 - k) * out[i - 1] : out[i - 1];
  }
  return out;
}

// ADX(n) via Wilder smoothing — O(N). Early entries = 0 (insufficient data).
function buildADX(bars, n = 14) {
  const out = new Float64Array(bars.length);
  const L   = bars.length;
  if (L < n * 2 + 2) return out;

  const dmp = new Float64Array(L - 1);
  const dmm = new Float64Array(L - 1);
  const tr  = new Float64Array(L - 1);
  for (let i = 1; i < L; i++) {
    const h  = parseFloat(bars[i].high),     l  = parseFloat(bars[i].low);
    const ph = parseFloat(bars[i - 1].high), pl = parseFloat(bars[i - 1].low);
    const pc = parseFloat(bars[i - 1].close);
    const up = h - ph, dn = pl - l;
    dmp[i - 1] = up > dn && up > 0 ? up : 0;
    dmm[i - 1] = dn > up && dn > 0 ? dn : 0;
    tr[i - 1]  = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }

  // Wilder initial sum
  let sDMp = 0, sDMm = 0, sTR = 0;
  for (let i = 0; i < n; i++) { sDMp += dmp[i]; sDMm += dmm[i]; sTR += tr[i]; }

  const dx = [];
  for (let i = n; i < dmp.length; i++) {
    sDMp = sDMp - sDMp / n + dmp[i];
    sDMm = sDMm - sDMm / n + dmm[i];
    sTR  = sTR  - sTR  / n + tr[i];
    if (sTR < 1e-10) { dx.push(0); continue; }
    const dip = (sDMp / sTR) * 100, dim = (sDMm / sTR) * 100;
    dx.push(dip + dim > 0 ? Math.abs(dip - dim) / (dip + dim) * 100 : 0);
  }

  // Smooth DX into ADX
  if (dx.length < n) return out;
  let adx   = dx.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const off = n * 2;
  if (off < L) out[off] = adx;
  for (let i = n; i < dx.length; i++) {
    adx = (adx * (n - 1) + dx[i]) / n;
    if (i + n < L) out[i + n] = adx;
  }
  // The loop writes up to out[L-2] — propagate to the last bar so rollingZ
  // at index L-1 never sees 0 instead of the current ADX value.
  if (out[L - 1] === 0 && L > 1) out[L - 1] = out[L - 2];
  return out;
}

// Rolling z-score of arr[idx] against the trailing `period` values
function rollingZ(arr, idx, period = 200) {
  const start = Math.max(0, idx - period + 1);
  const n     = idx - start + 1;
  if (n < 5) return 0;
  let mean = 0;
  for (let i = start; i <= idx; i++) mean += arr[i];
  mean /= n;
  let v = 0;
  for (let i = start; i <= idx; i++) { const d = arr[i] - mean; v += d * d; }
  const std = Math.sqrt(v / n);
  return std < 1e-12 ? 0 : (arr[idx] - mean) / std;
}

// Numerically-stable log-sum-exp for three values
function lse3(a, b, c) {
  const mx = Math.max(a, b, c);
  return mx + Math.log(Math.exp(a - mx) + Math.exp(b - mx) + Math.exp(c - mx));
}

// Gaussian log-likelihood, unit variance (no normalisation constant needed)
const gaussLL = (x, mu) => -0.5 * (x - mu) ** 2;

// ── Main export ───────────────────────────────────────────────────────────────
//
// bars: array of { open, high, low, close } objects (oldest-first, complete bars only)
// sym:  instrument symbol — used to select per-instrument HMM config
//
// Returns { regime, pBull, pBear, pRange, confidence, trendZ, volZ, adxZ, computedAt }
// or null when there is insufficient data.

export function computeHMM5m(bars, sym) {
  const cfg  = getCfg(sym);
  const N    = bars.length;
  const LN   = cfg.linregN;
  if (N < LN + 50) return null;

  const selfP  = cfg.selfProb;
  const otherP = (1 - selfP) / 2;
  const logS   = Math.log(selfP);
  const logO   = Math.log(otherP);

  // ── Feature series ──────────────────────────────────────────────────────────
  const closes = bars.map(b => parseFloat(b.close));
  const atr    = buildATR(bars, 20);
  const adx    = buildADX(bars, 14);

  // Linreg slope at each bar — O(N × LN), ~15 000 ops for N=300, LN=50
  const trend = new Float64Array(N);
  for (let i = LN - 1; i < N; i++) {
    trend[i] = linregSlopeAt(closes, i - LN + 1, LN);
  }

  // ── Forward algorithm ───────────────────────────────────────────────────────
  const LOG_INIT = Math.log(1 / 3);
  let lA = [LOG_INIT, LOG_INIT, LOG_INIT]; // [bull, bear, range]

  for (let i = 1; i < N; i++) {
    const tz = rollingZ(trend, i, 200);
    const vz = rollingZ(atr,   i, 200);
    const az = rollingZ(adx,   i, 200);

    // Emission log-likelihoods per the spec's state profiles
    const eB  = gaussLL(tz, +1) + gaussLL(az, +1) + gaussLL(vz, 0);
    const eBr = gaussLL(tz, -1) + gaussLL(az, +1) + gaussLL(vz, 0);
    const eR  = gaussLL(tz,  0) + gaussLL(az, -1) + gaussLL(vz, 0);

    // Predict (marginalise over previous states)
    const pBull  = lse3(lA[0] + logS, lA[1] + logO, lA[2] + logO);
    const pBear  = lse3(lA[0] + logO, lA[1] + logS, lA[2] + logO);
    const pRange = lse3(lA[0] + logO, lA[1] + logO, lA[2] + logS);

    // Update (add emission in log space)
    lA = [pBull + eB, pBear + eBr, pRange + eR];
  }

  // ── Softmax → probabilities ─────────────────────────────────────────────────
  const mx  = Math.max(...lA);
  const exp = lA.map(v => Math.exp(v - mx));
  const sum = exp[0] + exp[1] + exp[2];
  const [pBull, pBear, pRange] = exp.map(v => v / sum);

  const regime = pBull >= pBear && pBull >= pRange ? 'BULL'
               : pBear >= pBull && pBear >= pRange ? 'BEAR'
               : 'RANGE';

  const last = N - 1;
  return {
    regime,
    pBull:      +((pBull  * 100).toFixed(1)),
    pBear:      +((pBear  * 100).toFixed(1)),
    pRange:     +((pRange * 100).toFixed(1)),
    confidence: +((Math.max(pBull, pBear, pRange) * 100).toFixed(1)),
    trendZ:     +(rollingZ(trend, last, 200).toFixed(2)),
    volZ:       +(rollingZ(atr,   last, 200).toFixed(2)),
    adxZ:       +(rollingZ(adx,   last, 200).toFixed(2)),
    computedAt: Date.now(),
  };
}
