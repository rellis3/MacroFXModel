// hmm5m-v2.js — Shadow V2 HMM Regime Classifier (4-state, Baum-Welch learned params)
//
// Runs alongside hmm5m.js — does not replace it.
// Adds: 4th CHOP state (high-vol directionless), learned emission parameters,
// session-aware transition stickiness, FRED macro context overlay.
//
// computeHMM5mV2(bars, sym, trainedParams, macroCtx)
//   bars:          oldest-first M1 bar array { open, high, low, close }
//   sym:           instrument symbol
//   trainedParams: learned params from KV (null = use defaults)
//   macroCtx:      FRED macro snapshot object (null = skip overlay)
//
// Returns { regime, pBull, pBear, pRange, pChop, confidence, rawConfidence,
//           trendZ, volZ, adxZ, isLearned, sessionLabel, macroContext, computedAt }
// or null when there is insufficient data.

// States: 0=BULL 1=BEAR 2=RANGE 3=CHOP (K=4)
const K = 4;
const STATE_NAMES = ['BULL', 'BEAR', 'RANGE', 'CHOP'];

export const HMM_V2_CONFIG = {
  'XAU/USD':    { selfProb: 0.88, linregN: 40, adxN: 30 },
  'NAS100_USD': { selfProb: 0.94, linregN: 60, adxN: 40 },
  'SPX500_USD': { selfProb: 0.93, linregN: 55, adxN: 40 },
  'DE30_USD':   { selfProb: 0.93, linregN: 55, adxN: 40 },
  'UK100_GBP':  { selfProb: 0.93, linregN: 55, adxN: 40 },
  'US30_USD':   { selfProb: 0.93, linregN: 55, adxN: 40 },
  'US2000_USD': { selfProb: 0.93, linregN: 55, adxN: 40 },
  _default:     { selfProb: 0.92, linregN: 50, adxN: 50 },
};

// Default emission means [trendZ, volZ, adxZ] per state
//
// CHOP = directionless + elevated vol + BELOW-average ADX.
// Using adxZ=0 was wrong: a steady overnight trend builds ADX above average,
// so CHOP was firing for grind-up moves that are clearly not directionless.
// Requiring adxZ=-0.8 for CHOP separates "volatile grind" (ADX > avg = BULL)
// from "true chop" (high vol, no sustained direction, ADX < avg).
const DEFAULT_MEANS = [
  [ 1.0,  0.0,  0.7],  // BULL  — positive trend, normal vol, above-avg ADX
  [-1.0,  0.0,  0.7],  // BEAR  — negative trend, normal vol, above-avg ADX
  [ 0.0,  0.0, -1.0],  // RANGE — flat, quiet, low ADX
  [ 0.0,  0.8, -0.8],  // CHOP  — elevated vol + BELOW-avg ADX (genuinely directionless)
];

function getCfg(sym) {
  return HMM_V2_CONFIG[sym] ?? HMM_V2_CONFIG._default;
}

// ── Feature extraction (duplicated from hmm5m.js pattern) ────────────────────

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
  // Propagate to last bar so rollingZ at index L-1 never sees 0
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

// ── HMM utilities ─────────────────────────────────────────────────────────────

// Gaussian log-likelihood with per-state variance
function gaussLLV(x, mu, variance) {
  return -0.5 * ((x - mu) ** 2) / Math.max(variance, 1e-6) - 0.5 * Math.log(Math.max(variance, 1e-6));
}

// Log-sum-exp for an array of K values
function lseK(vals) {
  let mx = vals[0];
  for (let i = 1; i < vals.length; i++) if (vals[i] > mx) mx = vals[i];
  let s = 0;
  for (let i = 0; i < vals.length; i++) s += Math.exp(vals[i] - mx);
  return mx + Math.log(s);
}

// Build a diagonal-dominant K×K transition matrix
function buildDefaultTransMatrix(selfProb) {
  const off = (1 - selfProb) / (K - 1);
  return Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (_, j) => j === i ? selfProb : off)
  );
}

// ── Session helpers ───────────────────────────────────────────────────────────

export function sessionLabel(hourUTC) {
  if (hourUTC >= 7  && hourUTC < 9)  return 'LONDON_OPEN';
  if (hourUTC >= 9  && hourUTC < 12) return 'LONDON';
  if (hourUTC >= 12 && hourUTC < 17) return 'NY';
  if (hourUTC >= 2  && hourUTC < 7)  return 'ASIA';
  if (hourUTC >= 22 || hourUTC < 2)  return 'THIN';
  return 'ACTIVE';
}

// Boost self-transition probability during genuinely dead THIN hours only.
// ASIA (02:00–07:00 UTC) is a real session where trends develop — do NOT
// over-sticky there, or a mis-labelled CHOP from the small hours stays stuck
// all through Asia even when NAS/FX is clearly grinding in one direction.
function sessionTransMatrix(A, hourUTC) {
  if (hourUTC >= 2 && hourUTC < 17) return A;  // ASIA + active hours: no boost
  // THIN (22:00–02:00 UTC): boost to reduce noise flip-flopping in dead markets
  return A.map((row, i) => {
    const selfP = row[i];
    const boost = Math.min(0.97, selfP + (1 - selfP) * 0.2);
    const scale = (1 - boost) / Math.max(1 - selfP, 1e-10);
    return row.map((p, j) => j === i ? boost : p * scale);
  });
}

// ── Macro context overlay ─────────────────────────────────────────────────────

export function computeMacroContext(fredData) {
  const vix   = parseFloat(fredData?.vix?.value  ?? 15);
  const hy    = parseFloat(fredData?.hy?.value   ?? 3.5);
  const gs10  = parseFloat(fredData?.gs10?.value ?? 4.2);
  const gs2   = parseFloat(fredData?.gs2?.value  ?? 4.5);

  let mult = 1.0;

  if      (vix > 30) mult *= 0.65;
  else if (vix > 25) mult *= 0.80;
  else if (vix > 20) mult *= 0.90;
  else if (vix < 13) mult *= 1.10;

  if      (hy > 7) mult *= 0.75;
  else if (hy > 5) mult *= 0.90;

  const curve = gs10 - gs2;
  if (curve < -0.75) mult *= 0.90;

  mult = Math.min(1.15, Math.max(0.45, mult));

  const label = vix > 25 ? 'STRESS' : vix > 18 ? 'CAUTION' : 'CALM';

  return {
    mult:     parseFloat(mult.toFixed(4)),
    vix:      parseFloat(vix.toFixed(2)),
    hySpread: parseFloat(hy.toFixed(2)),
    curve:    parseFloat(curve.toFixed(3)),
    label,
  };
}

// ── Feature extraction export ─────────────────────────────────────────────────

export function extractFeatures(bars, sym) {
  const cfg    = getCfg(sym);
  const N      = bars.length;
  const LN     = cfg.linregN;
  const warmup = LN + 50;

  const closes = bars.map(b => parseFloat(b.close));
  const atr    = buildATR(bars, 20);
  const adx    = buildADX(bars, cfg.adxN ?? 14);

  const trend = new Float64Array(N);
  for (let i = LN - 1; i < N; i++) {
    trend[i] = linregSlopeAt(closes, i - LN + 1, LN);
  }

  const features = [];
  for (let i = warmup; i < N; i++) {
    const tz = rollingZ(trend, i, 200);
    const vz = rollingZ(atr,   i, 200);
    const az = rollingZ(adx,   i, 200);
    features.push([tz, vz, az]);
  }

  return { features, warmup };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeHMM5mV2(bars, sym, trainedParams, macroCtx) {
  const cfg    = getCfg(sym);
  const N      = bars.length;
  const LN     = cfg.linregN;
  if (N < LN + 50) return null;

  // Determine emission params
  let means, vars, baseA, isLearned;
  const learned = trainedParams?.[sym];
  if (learned?.means && learned?.vars && learned?.transMatrix) {
    // Force the corrected CHOP emission regardless of what Baum-Welch learned.
    // The old CHOP means [0, 1, 0] had no ADX penalty; Baum-Welch locked in
    // that wrong definition. Preserve BULL/BEAR/RANGE from training but always
    // use DEFAULT_MEANS[3] for CHOP so the fix applies even with trained params.
    means     = learned.means.map((m, i) => i === 3 ? DEFAULT_MEANS[3] : m);
    vars      = learned.vars;
    baseA     = learned.transMatrix;
    isLearned = true;
  } else {
    means     = DEFAULT_MEANS;
    vars      = Array.from({ length: K }, () => [1.0, 1.0, 1.0]);
    baseA     = buildDefaultTransMatrix(cfg.selfProb);
    isLearned = false;
  }

  // Session-aware transition matrix
  const hourUTC = new Date().getUTCHours();
  const A       = sessionTransMatrix(baseA, hourUTC);

  // Log transition matrix
  const logA = A.map(row => row.map(p => Math.log(Math.max(p, 1e-300))));

  // ── Feature series ──────────────────────────────────────────────────────────
  const closes = bars.map(b => parseFloat(b.close));
  const atr    = buildATR(bars, 20);
  const adx    = buildADX(bars, cfg.adxN ?? 14);

  const trend = new Float64Array(N);
  for (let i = LN - 1; i < N; i++) {
    trend[i] = linregSlopeAt(closes, i - LN + 1, LN);
  }

  // ── Forward algorithm (log-space, K=4) ──────────────────────────────────────
  const LOG_INIT = Math.log(1 / K);

  // Collect feature observations starting at warmup
  const warmup = LN + 50;
  const obs = [];
  for (let i = warmup; i < N; i++) {
    obs.push([
      rollingZ(trend, i, 200),
      rollingZ(atr,   i, 200),
      rollingZ(adx,   i, 200),
    ]);
  }

  if (obs.length === 0) return null;

  // Initialise alpha at first observation
  let lA = new Float64Array(K);
  for (let k = 0; k < K; k++) {
    let em = 0;
    for (let f = 0; f < 3; f++) em += gaussLLV(obs[0][f], means[k][f], vars[k][f]);
    lA[k] = LOG_INIT + em;
  }

  // Recurse over remaining observations
  for (let t = 1; t < obs.length; t++) {
    const newLA = new Float64Array(K);
    for (let j = 0; j < K; j++) {
      const trans = new Float64Array(K);
      for (let i = 0; i < K; i++) trans[i] = lA[i] + logA[i][j];
      let em = 0;
      for (let f = 0; f < 3; f++) em += gaussLLV(obs[t][f], means[j][f], vars[j][f]);
      newLA[j] = lseK(trans) + em;
    }
    lA = newLA;
  }

  // ── Softmax → probabilities ─────────────────────────────────────────────────
  const mx  = Math.max(...lA);
  const exp = Array.from(lA, v => Math.exp(v - mx));
  const sum = exp.reduce((s, v) => s + v, 0);
  const probs = exp.map(v => v / sum);

  let bestIdx = 0;
  for (let k = 1; k < K; k++) if (probs[k] > probs[bestIdx]) bestIdx = k;

  const rawConfidence = parseFloat((probs[bestIdx] * 100).toFixed(1));

  // Macro context
  const mc = macroCtx ?? computeMacroContext(null);
  const adjConf = parseFloat(Math.min(rawConfidence, rawConfidence * mc.mult).toFixed(1));

  // Last-bar feature values for output
  const last = N - 1;
  const trendZ = parseFloat(rollingZ(trend, last, 200).toFixed(2));
  const volZ   = parseFloat(rollingZ(atr,   last, 200).toFixed(2));
  const adxZ   = parseFloat(rollingZ(adx,   last, 200).toFixed(2));

  return {
    regime:       STATE_NAMES[bestIdx],
    pBull:        parseFloat((probs[0] * 100).toFixed(1)),
    pBear:        parseFloat((probs[1] * 100).toFixed(1)),
    pRange:       parseFloat((probs[2] * 100).toFixed(1)),
    pChop:        parseFloat((probs[3] * 100).toFixed(1)),
    confidence:   adjConf,
    rawConfidence,
    trendZ,
    volZ,
    adxZ,
    isLearned,
    sessionLabel: sessionLabel(hourUTC),
    macroContext: mc,
    computedAt:   Date.now(),
  };
}
