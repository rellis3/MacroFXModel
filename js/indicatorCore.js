/**
 * Indicator Core — the technical-indicator baseplate brick. EMA, true range and
 * the Wilder-smoothed ATR / ADX that were copied across hmm5m.js, hmm5m-v2.js
 * and the regime backtests, plus RSI. One implementation so a live regime gate
 * and its backtest can never disagree on "what ADX is".
 *
 * IMPORTANT — there is more than one legitimate ATR in this codebase and they
 * are NOT interchangeable. Keep them named, never silently swap:
 *   • atrWilder   — Wilder EMA smoothing, k = 1/n. Matches hmm5m.js buildATR
 *                   (the regime engines / live HMM bots).
 *   • atrEma      — EMA of true range with an explicit alpha (the Python bots'
 *                   bot/utils/indicators.py uses alpha = 0.15 "to match vol.js").
 *   • barUtils.calcATR — simple mean of the last `period` true ranges on a
 *                   resampled timeframe (the session-range backtests).
 * Picking the wrong one shifts every stop width — so the caller names it.
 *
 * Bars may carry string or numeric OHLC; everything is coerced with Number().
 */

const num = v => (typeof v === 'number' ? v : parseFloat(v));

// ── EMA ──────────────────────────────────────────────────────────────────────
// Standard EMA over a numeric array, span -> k = 2/(span+1), seeded at values[0].
export function ema(values, span) {
  if (!values.length) return [];
  const k = 2 / (span + 1);
  const out = new Array(values.length);
  out[0] = num(values[0]);
  for (let i = 1; i < values.length; i++) {
    const v = num(values[i]);
    out[i] = Number.isFinite(v) ? k * v + (1 - k) * out[i - 1] : out[i - 1];
  }
  return out;
}

// ── True range ───────────────────────────────────────────────────────────────
export function trueRange(high, low, prevClose) {
  const h = num(high), l = num(low), pc = num(prevClose);
  return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
}

// ── ATR — Wilder EMA smoothing (k = 1/n) ─────────────────────────────────────
// Returns a Float64Array aligned to bars. Bar 0 seeds with its own H-L. This is
// the regime engines' ATR — bit-faithful to hmm5m.js buildATR.
export function atrWilder(bars, n = 20) {
  const out = new Float64Array(bars.length);
  if (bars.length < 1) return out;
  out[0] = Math.abs(num(bars[0].high) - num(bars[0].low));
  const k = 1 / n;
  for (let i = 1; i < bars.length; i++) {
    const tr = trueRange(bars[i].high, bars[i].low, bars[i - 1].close);
    out[i] = (Number.isFinite(tr) && tr > 0) ? k * tr + (1 - k) * out[i - 1] : out[i - 1];
  }
  return out;
}

// ── ATR — EMA of true range with explicit alpha ──────────────────────────────
// The Python live bots' variant (alpha 0.15). Seeded at the first true range.
export function atrEma(bars, alpha = 0.15) {
  const out = new Float64Array(bars.length);
  if (bars.length < 2) return out;
  out[1] = trueRange(bars[1].high, bars[1].low, bars[0].close);
  for (let i = 2; i < bars.length; i++) {
    const tr = trueRange(bars[i].high, bars[i].low, bars[i - 1].close);
    out[i] = alpha * tr + (1 - alpha) * out[i - 1];
  }
  return out;
}

// ── ADX — Wilder smoothing ───────────────────────────────────────────────────
// Returns a Float64Array aligned to bars (0 until enough data). Bit-faithful to
// hmm5m.js buildADX, including the last-bar propagation so a rolling-z read at
// the final index never sees a stale 0.
export function adxWilder(bars, n = 14) {
  const out = new Float64Array(bars.length);
  const L = bars.length;
  if (L < n * 2 + 2) return out;

  const dmp = new Float64Array(L - 1);
  const dmm = new Float64Array(L - 1);
  const tr  = new Float64Array(L - 1);
  for (let i = 1; i < L; i++) {
    const h  = num(bars[i].high),     l  = num(bars[i].low);
    const ph = num(bars[i - 1].high), pl = num(bars[i - 1].low);
    const pc = num(bars[i - 1].close);
    const up = h - ph, dn = pl - l;
    dmp[i - 1] = up > dn && up > 0 ? up : 0;
    dmm[i - 1] = dn > up && dn > 0 ? dn : 0;
    tr[i - 1]  = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }

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

  if (dx.length < n) return out;
  let adx = dx.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const off = n * 2;
  if (off < L) out[off] = adx;
  for (let i = n; i < dx.length; i++) {
    adx = (adx * (n - 1) + dx[i]) / n;
    if (i + n < L) out[i + n] = adx;
  }
  if (out[L - 1] === 0 && L > 1) out[L - 1] = out[L - 2];
  return out;
}

// ── RSI — Wilder smoothing ───────────────────────────────────────────────────
// Returns a Float64Array of RSI(0..100) aligned to closes (NaN until seeded).
export function rsiWilder(closes, n = 14) {
  const L = closes.length;
  const out = new Float64Array(L).fill(NaN);
  if (L < n + 1) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = num(closes[i]) - num(closes[i - 1]);
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / n, avgL = loss / n;
  out[n] = avgL < 1e-12 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = n + 1; i < L; i++) {
    const d = num(closes[i]) - num(closes[i - 1]);
    const g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
    avgG = (avgG * (n - 1) + g) / n;
    avgL = (avgL * (n - 1) + l) / n;
    out[i] = avgL < 1e-12 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}
