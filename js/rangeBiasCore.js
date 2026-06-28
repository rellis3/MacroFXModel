/**
 * Range-Bias Core — the live entry-bias feature set as ONE shared brick.
 *
 * These five features + their helpers were private to levels.js (the engine that
 * writes ai_entries → Telegram). Lifting them into a brick lets the Asia-range
 * BACKTEST score levels with the SAME range-bias conviction the live bot grades
 * on — closing part of the live↔backtest gap (CONFLUENCE_LIVE_VS_BACKTEST.md).
 * Extracted verbatim; `js/rangeBiasCore.test.mjs` proves bit-for-bit equality
 * with the original levels.js code, so wiring levels.js to it changes no alert.
 *
 * Contract: bars are OLDEST-FIRST with { high, low, close } (string or number).
 * Each feature → { signal: 'long' | 'short' | null, key, val }. `entryDir` is the
 * direction being evaluated ('long' | 'short'); a feature `signal === entryDir`
 * confirms it, the opposite conflicts, null abstains.
 */

// Bar accessors (parseFloat, matching levels.js exactly).
const bH = b => parseFloat(b.high);
const bL = b => parseFloat(b.low);
const bC = b => parseFloat(b.close);

// ── ADX (oldest-first bars) ──────────────────────────────────────────────────
export function computeADX(bars, period = 14) {
  if (bars.length < period + 2) return null;
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < bars.length; i++) {
    const h  = bH(bars[i]), l = bL(bars[i]), pc = bC(bars[i - 1]);
    const ph = bH(bars[i - 1]), pl = bL(bars[i - 1]);
    const up = h - ph, dn = pl - l;
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const smooth = (arr) => {
    let val = arr.slice(0, period).reduce((s, x) => s + x, 0);
    const out = [val];
    for (let i = period; i < arr.length; i++) { val = val - val / period + arr[i]; out.push(val); }
    return out;
  };
  const sTR = smooth(tr), sPDM = smooth(plusDM), sMDM = smooth(minusDM);
  const pDI = sPDM.map((v, i) => sTR[i] > 0 ? (v / sTR[i]) * 100 : 0);
  const mDI = sMDM.map((v, i) => sTR[i] > 0 ? (v / sTR[i]) * 100 : 0);
  const dx  = pDI.map((v, i) => { const s = v + mDI[i]; return s > 0 ? Math.abs(v - mDI[i]) / s * 100 : 0; });
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adx = (adx * (period - 1) + dx[i]) / period;
  return { adx, plusDI: pDI[pDI.length - 1], minusDI: mDI[mDI.length - 1] };
}

// ── Hurst exponent via R/S analysis (array of closes, any order) ─────────────
export function computeHurst(closes) {
  const n = closes.length;
  if (n < 8) return 0.5;
  const lags = [2, 4, 8, 16].filter(l => l < n / 2);
  if (!lags.length) return 0.5;
  const logLags = [], logRS = [];
  for (const lag of lags) {
    const chunks = [];
    for (let start = 0; start + lag <= n; start += lag) {
      const sub  = closes.slice(start, start + lag);
      const mean = sub.reduce((a, b) => a + b, 0) / lag;
      let cum = 0;
      const cumDev = sub.map(v => { cum += v - mean; return cum; });
      const range = Math.max(...cumDev) - Math.min(...cumDev);
      const std   = Math.sqrt(sub.reduce((s, v) => s + (v - mean) ** 2, 0) / lag);
      if (std > 0) chunks.push(range / std);
    }
    if (chunks.length) {
      logLags.push(Math.log(lag));
      logRS.push(Math.log(chunks.reduce((a, b) => a + b, 0) / chunks.length));
    }
  }
  if (logLags.length < 2) return 0.5;
  const n2    = logLags.length;
  const meanX = logLags.reduce((a, b) => a + b, 0) / n2;
  const meanY = logRS.reduce((a, b) => a + b, 0) / n2;
  const num   = logLags.reduce((s, x, i) => s + (x - meanX) * (logRS[i] - meanY), 0);
  const den   = logLags.reduce((s, x) => s + (x - meanX) ** 2, 0);
  return den > 0 ? Math.max(0, Math.min(1, num / den)) : 0.5;
}

// ── EMA (oldest-first prices; SMA-seeded, returns last value) ────────────────
export function ema(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let e = prices.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < prices.length; i++) e = prices[i] * k + e * (1 - k);
  return e;
}

// ── Feature 1: ADX regime (30m bars) ─────────────────────────────────────────
export function featureADX(bars30m, entryDir) {
  if (!bars30m || bars30m.length < 40) return { signal: null, key: 'adx', val: 'ADX: need 40+ bars' };
  const res = computeADX(bars30m.slice(-200), 14);
  if (!res) return { signal: null, key: 'adx', val: 'ADX: insufficient' };
  const { adx, plusDI, minusDI } = res;
  const opposite = entryDir === 'long' ? 'short' : 'long';
  if (adx < 20) return { signal: entryDir,  key: 'adx', val: `ADX ${adx.toFixed(1)} range-bound` };
  if (adx > 28) return { signal: opposite,  key: 'adx', val: `ADX ${adx.toFixed(1)} trending` };
  const trendUp  = plusDI > minusDI;
  const aligned  = (entryDir === 'long' && trendUp) || (entryDir === 'short' && !trendUp);
  return { signal: aligned ? entryDir : null, key: 'adx', val: `ADX ${adx.toFixed(1)} neutral` };
}

// ── Feature 2: Swing regime CHoCH/BOS (30m bars) ─────────────────────────────
export function featureSwingRegime(bars30m, entryDir) {
  if (!bars30m || bars30m.length < 20) return { signal: null, key: 'swing', val: 'Swing: need 20+ bars' };
  const recent = bars30m.slice(-60);
  const N = 3;
  const highs = [], lows = [];
  for (let i = N; i < recent.length - N; i++) {
    const h = bH(recent[i]), l = bL(recent[i]);
    let isH = true, isL = true;
    for (let j = i - N; j <= i + N; j++) {
      if (j !== i && bH(recent[j]) >= h) isH = false;
      if (j !== i && bL(recent[j]) <= l) isL = false;
    }
    if (isH) highs.push(h);
    if (isL)  lows.push(l);
  }
  if (highs.length < 2 || lows.length < 2) return { signal: null, key: 'swing', val: 'Swing: not enough swings' };
  const hh = highs[highs.length - 1] > highs[highs.length - 2];
  const hl = lows[lows.length - 1]   > lows[lows.length - 2];
  const lh = highs[highs.length - 1] < highs[highs.length - 2];
  const ll = lows[lows.length - 1]   < lows[lows.length - 2];
  if (hh && hl) return { signal: 'long',  key: 'swing', val: 'BOS Bullish HH+HL' };
  if (lh && ll) return { signal: 'short', key: 'swing', val: 'BOS Bearish LH+LL' };
  return { signal: null, key: 'swing', val: 'CHoCH / mixed structure' };
}

// ── Feature 3: TWAP slope (last 12 × 5m bars) ────────────────────────────────
export function featureTwap(bars5m, entryDir) {
  if (!bars5m || bars5m.length < 12) return { signal: null, key: 'twap', val: 'TWAP: need 12+ bars' };
  const recent = bars5m.slice(-12);
  const hlc3 = recent.map(b => (bH(b) + bL(b) + bC(b)) / 3);
  const n = hlc3.length;
  const sx = (n * (n - 1)) / 2, sx2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const sy = hlc3.reduce((s, v) => s + v, 0);
  const sxy = hlc3.reduce((s, v, i) => s + i * v, 0);
  const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
  if (slope > 0) return { signal: 'long',  key: 'twap', val: `TWAP slope +${slope.toFixed(6)}` };
  if (slope < 0) return { signal: 'short', key: 'twap', val: `TWAP slope ${slope.toFixed(6)}` };
  return { signal: null, key: 'twap', val: 'TWAP flat' };
}

// ── Feature 4: EMA20/50 + RSI14 (daily bars) ─────────────────────────────────
export function featureEmaRsi(dailyBars, entryDir) {
  if (!dailyBars || dailyBars.length < 20) return { signal: null, key: 'ema', val: 'EMA: need 20+ daily bars' };
  const closes = dailyBars.map(bC);
  const e20 = ema(closes, 20);
  const e50 = closes.length >= 50 ? ema(closes, 50) : null;
  const emaSignal = e50 ? (e20 > e50 ? 'long' : 'short') : null;
  const period = 14;
  if (closes.length < period + 2) return { signal: emaSignal, key: 'ema', val: emaSignal ? `EMA ${emaSignal}` : 'EMA neutral' };
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  const rsi = avgLoss > 0 ? 100 - 100 / (1 + avgGain / avgLoss) : 100;
  const rsiSignal = rsi > 60 ? 'long' : rsi < 40 ? 'short' : null;
  const combined  = (emaSignal && rsiSignal && emaSignal === rsiSignal) ? emaSignal
                  : emaSignal ?? rsiSignal ?? null;
  return { signal: combined, key: 'ema', val: `EMA ${emaSignal ?? 'neutral'} RSI ${rsi.toFixed(0)}` };
}

// ── Feature 5: Hurst exponent (daily closes) ─────────────────────────────────
export function featureHurst(dailyBars, entryDir) {
  if (!dailyBars || dailyBars.length < 20) return { signal: null, key: 'hurst', val: 'Hurst: need 20+ daily bars' };
  const closes  = dailyBars.slice(-80).map(bC).filter(v => !isNaN(v));
  const H       = computeHurst(closes);
  const hStr    = H.toFixed(2);
  const opposite = entryDir === 'long' ? 'short' : 'long';
  if (H < 0.45) return { signal: entryDir, key: 'hurst', val: `Hurst ${hStr} mean-reverting` };
  if (H > 0.55) return { signal: opposite, key: 'hurst', val: `Hurst ${hStr} trending` };
  return { signal: null, key: 'hurst', val: `Hurst ${hStr} neutral` };
}

// ── Aggregate range-bias conviction from the 5 features ──────────────────────
// `sym` is accepted for signature parity with levels.js (unused in the math).
export function computeRangeBiasServer(sym, entryDir, bars5m, bars30m, dailyBars) {
  const features = [
    featureADX(bars30m, entryDir),
    featureSwingRegime(bars30m, entryDir),
    featureTwap(bars5m, entryDir),
    featureEmaRsi(dailyBars, entryDir),
    featureHurst(dailyBars, entryDir),
  ];
  const active        = features.filter(f => f.signal !== null);
  const confirmCount  = active.filter(f => f.signal === entryDir).length;
  const conflictCount = active.filter(f => f.signal !== entryDir).length;
  const total         = confirmCount + conflictCount;
  const conviction    = total > 0 ? (confirmCount - conflictCount) / total : 0;
  return { confirmCount, conflictCount, conviction, features };
}

// ── Weekly pivots from daily bars ────────────────────────────────────────────
export function computeWeeklyPivots(dailyBars) {
  if (!dailyBars || dailyBars.length < 5) return null;
  const prev = dailyBars.slice(-7, -2);
  if (!prev.length) return null;
  const H  = Math.max(...prev.map(bH));
  const L  = Math.min(...prev.map(bL));
  const C  = bC(prev[prev.length - 1]);
  const PP = (H + L + C) / 3;
  return { PP, R1: 2 * PP - L, R2: PP + (H - L), S1: 2 * PP - H, S2: PP - (H - L) };
}
