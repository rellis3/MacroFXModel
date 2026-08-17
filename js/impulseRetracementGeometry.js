/**
 * Impulse/Retracement Geometry — a DESCRIPTIVE inference brick, not a P&L
 * engine. Answers a narrower, more honest question than a backtest can:
 * across real historical impulsive legs, where does price actually turn
 * during the pullback, as a fraction of the impulse's own size — and does
 * that depend on how big the impulse was, or on the EMA state at the turn?
 *
 * No entries, no stops, no costs, no Sharpe. Pure geometry + a light
 * unsupervised pass (1D k-means over the turning-point fraction) to let the
 * data say where it clusters, instead of assuming a Fib level up front.
 *
 * Contract (pure; no I/O):
 *   findImpulseRetracements(bars, opts) → Occurrence[]
 *     bars = [{time,open,high,low,close}] (any timeframe — caller resamples)
 *     Occurrence = {
 *       aIdx, bIdx, aPrice, bPrice, dir: 'up'|'down',
 *       legSize, legAtrMult,            // impulse leg size, raw + ATR-normalized
 *       outcome: 'continued'|'invalidated'|'timeout',
 *       turnIdx, turnPrice, retraceFrac,  // 0 = no pullback, 1 = fully back to origin
 *       barsToTurn, emaAgreeAtTurn,       // fast EMA vs slow EMA agrees with leg dir at the turn
 *     }
 *
 * "Continued" = price pulled back, then made a NEW extreme beyond the leg's
 * own extreme (b) WITHOUT first fully retracing past the leg's origin (a) —
 * this is the "impulse → pullback → resumption" shape the screenshots show.
 * "Invalidated" = price fully retraced past the origin first (the pullback
 * became a reversal, not a continuation). "Timeout" = neither happened
 * within `maxForwardBars`.
 */

import { pivotHighs, pivotLows, computeATR } from './patternEngine.js';
import { ema } from './indicatorCore.js';

export const DEFAULT_OPTS = {
  pivotN: 5,
  atrPeriod: 14,
  minImpulseAtr: 2.0,     // leg must be >= this x ATR to count as "impulsive" at all
  maxForwardBars: 3000,   // safety cap on the forward scan
  emaFast: 9,
  emaSlow: 21,
};

export function findImpulseRetracements(bars, opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts };
  const atr = computeATR(bars, o.atrPeriod);
  const closes = bars.map(b => b.close);
  const emaFastSeries = ema(closes, o.emaFast);
  const emaSlowSeries = ema(closes, o.emaSlow);

  const piv = [
    ...pivotHighs(bars, o.pivotN).map(p => ({ ...p, kind: 'H' })),
    ...pivotLows(bars, o.pivotN).map(p => ({ ...p, kind: 'L' })),
  ].sort((x, y) => x.idx - y.idx);

  const out = [];
  for (let i = 1; i < piv.length; i++) {
    const a = piv[i - 1], b = piv[i];
    if (a.kind === b.kind) continue;               // need alternating H/L for a leg
    const legSize = Math.abs(b.price - a.price);
    const atrAtB = atr[b.idx];
    if (!(atrAtB > 0) || legSize < o.minImpulseAtr * atrAtB) continue;

    const dirUp = b.price > a.price;                // leg went low(a)->high(b) or high(a)->low(b)
    let extremeRetrace = b.price, extremeIdx = b.idx;
    let outcome = null;
    const lastK = Math.min(bars.length - 1, b.idx + o.maxForwardBars);
    for (let k = b.idx + 1; k <= lastK; k++) {
      const bar = bars[k];
      const px = dirUp ? bar.low : bar.high;
      if (dirUp ? px < extremeRetrace : px > extremeRetrace) { extremeRetrace = px; extremeIdx = k; }
      const resumed = dirUp ? bar.high > b.price : bar.low < b.price;
      if (resumed) { outcome = 'continued'; break; }
      const invalidated = dirUp ? bar.low < a.price : bar.high > a.price;
      if (invalidated) { outcome = 'invalidated'; break; }
    }
    if (!outcome) outcome = 'timeout';

    const retraceFrac = legSize > 0 ? Math.abs(b.price - extremeRetrace) / legSize : 0;
    const fastAbove = emaFastSeries[extremeIdx] > emaSlowSeries[extremeIdx];
    const emaAgreeAtTurn = dirUp ? fastAbove : !fastAbove;   // does EMA already agree with the leg's own direction at the turn

    out.push({
      aIdx: a.idx, bIdx: b.idx, aPrice: a.price, bPrice: b.price, dir: dirUp ? 'up' : 'down',
      legSize, legAtrMult: legSize / atrAtB,
      outcome, turnIdx: extremeIdx, turnPrice: extremeRetrace, retraceFrac,
      barsToTurn: extremeIdx - b.idx, emaAgreeAtTurn,
      time: bars[b.idx].time,
    });
  }
  return out;
}

// ── 1D k-means over an array of numbers (retraceFrac, typically) ────────────
// Deterministic seeding (evenly-spaced order statistics), not random — so
// results are reproducible without a seeded RNG dependency.
export function kmeans1D(values, k, iters = 100) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return { centroids: [], assign: () => -1 };
  const kk = Math.min(k, sorted.length);
  let centroids = Array.from({ length: kk }, (_, i) => sorted[Math.floor((i + 0.5) * sorted.length / kk)]);
  for (let it = 0; it < iters; it++) {
    const sums = new Array(kk).fill(0), counts = new Array(kk).fill(0);
    for (const v of values) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < kk; c++) { const d = Math.abs(v - centroids[c]); if (d < bd) { bd = d; bi = c; } }
      sums[bi] += v; counts[bi]++;
    }
    const next = sums.map((s, c) => counts[c] ? s / counts[c] : centroids[c]);
    if (next.every((v, c) => Math.abs(v - centroids[c]) < 1e-9)) { centroids = next; break; }
    centroids = next;
  }
  centroids.sort((a, b) => a - b);
  return {
    centroids,
    counts: (() => {
      const c = new Array(kk).fill(0);
      for (const v of values) {
        let bi = 0, bd = Infinity;
        for (let ci = 0; ci < kk; ci++) { const d = Math.abs(v - centroids[ci]); if (d < bd) { bd = d; bi = ci; } }
        c[bi]++;
      }
      return c;
    })(),
  };
}

// Fixed-width histogram, [0,1] range by default (retraceFrac domain).
export function histogram(values, binSize = 0.05, min = 0, max = 1) {
  const nBins = Math.round((max - min) / binSize);
  const bins = new Array(nBins).fill(0);
  for (const v of values) {
    if (v < min || v > max) continue;
    const bi = Math.min(nBins - 1, Math.floor((v - min) / binSize));
    bins[bi]++;
  }
  return bins.map((count, i) => ({ lo: +(min + i * binSize).toFixed(3), hi: +(min + (i + 1) * binSize).toFixed(3), count }));
}
