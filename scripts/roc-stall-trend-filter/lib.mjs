// scripts/roc-stall-trend-filter/lib.mjs: the trend-state split of the banked ROC_50 stall (forge/ROC_STALL_TREND_FILTER_PREREG.md).
// Everything the parent study fixed (flags, de-clustering, control exclusion, outcomes, bootstrap) is imported unchanged from
// scripts/roc-stall/lib.mjs; this file adds the trend state at each session, a 40-session return, and sums restricted to one arm.
// Everything at session i uses closes <= i.
import { features as baseFeatures, eventsAndControl, START } from '../roc-stall/lib.mjs';
export { loadDaily, eventsAndControl, pooled, eventCount, monthFilter, bootstrap, pTwoSided, holm, rng, START, END, DISC_END, HOLD_START, HALF_SPLIT } from '../roc-stall/lib.mjs';

export const SMA_N = 200, SLOPE_N = 20;          // the filter: close against the 200-session simple average, whose slope is read over 20 sessions
export const ARMS = { UP: 1, DOWN: -1, MIXED: 0 };

/** Trend state at i: +1 above a rising SMA, -1 below a falling SMA, 0 otherwise (or not yet defined). */
export function trendState(c, n = SMA_N, slopeN = SLOPE_N) {
  const N = c.length, sma = new Float64Array(N).fill(NaN), st = new Int8Array(N);
  let s = 0;
  for (let i = 0; i < N; i++) { s += c[i]; if (i >= n) s -= c[i - n]; if (i >= n - 1) sma[i] = s / n; }
  for (let i = 0; i < N; i++) {
    if (i < n - 1 + slopeN) continue;
    const slope = sma[i] - sma[i - slopeN];
    if (c[i] > sma[i] && slope > 0) st[i] = 1; else if (c[i] < sma[i] && slope < 0) st[i] = -1;
  }
  return { sma, state: st };
}

/** The parent features plus the trend state and the 40-session return (same unit: trailing-250 daily sd x sqrt(h)). */
export function features(rows, opts = {}) {
  const F = baseFeatures(rows, opts);
  const { sma, state } = trendState(F.c, opts.smaN ?? SMA_N, opts.slopeN ?? SLOPE_N);
  F.sma = sma; F.trend = state;
  const z40 = new Float64Array(F.N).fill(NaN);
  for (let i = 0; i + 40 < F.N; i++) if (Number.isFinite(F.sig250[i]) && F.sig250[i] > 0) z40[i] = Math.log(F.c[i + 40] / F.c[i]) / (F.sig250[i] * Math.sqrt(40));
  F.Z[40] = z40;
  return F;
}

/**
 * Per-month sums of the outcome over events and controls for one series, both restricted to sessions whose trend state is `arm`.
 * Events = the parent's de-clustered flags (de-clustered BEFORE the split, so the arms partition the parent's events); the control
 * exclusion (the flag and the 20 sessions after it, any arm) is the parent's. shift = placebo rotation of the flags; the arm is read
 * at the rotated position, so the placebo asks whether a stall is special given the trend state.
 */
export function sumsArm(F, flag, outcome, h, arm, shift = 0) {
  const { ev, near } = eventsAndControl(F, flag, shift), out = outcome === 'Z' ? F.Z[h] : F.LV[h], rec = new Map();
  const get = m => { let r = rec.get(m); if (!r) { r = { es: 0, en: 0, cs: 0, cn: 0 }; rec.set(m, r); } return r; };
  const isEv = new Uint8Array(F.N); for (const i of ev) isEv[i] = 1;
  for (let i = 0; i < F.N; i++) {
    if (F.date[i] < START || !Number.isFinite(out[i]) || F.trend[i] !== arm) continue;
    if (isEv[i]) { const r = get(F.mon[i]); r.es += out[i]; r.en++; }
    else if (!near[i]) { const r = get(F.mon[i]); r.cs += out[i]; r.cn++; }
  }
  return rec;
}

/** the one scored cell (fixed in the prereg): the 20-session return, the parent study's primary horizon */
export const CELLS = [
  { id: 'T1', flag: 'TOP', arm: 1, outcome: 'Z', h: 20, expect: +1, bar: 0.15, k: 1, label: 'TOP stall above a rising SMA200 -> 20-session return (z) vs same-state controls' },
];
/** reported cells (descriptive, no pass/fail weight; each carries its own MDE so a reader can see what it could have found) */
export const REPORTED = [
  { id: 'T2', flag: 'TOP', arm: 1, outcome: 'Z', h: 40, expect: +1, bar: 0.15, k: 2, label: 'TOP stall above a rising SMA200 -> 40-session return (z)' },
  { id: 'T3', flag: 'TOP', arm: 1, outcome: 'Z', h: 60, expect: +1, bar: 0.15, k: 3, label: 'TOP stall above a rising SMA200 -> 60-session return (z)' },
  { id: 'T4', flag: 'TOP', arm: 1, outcome: 'LV', h: 20, expect: -1, bar: 0.10, k: 1, label: 'TOP stall above a rising SMA200 -> next-20 realised vol vs trailing 60 (log ratio)' },
  { id: 'T5', flag: 'TOP', arm: -1, outcome: 'Z', h: 20, expect: -1, bar: 0.15, k: 1, label: 'TOP stall below a falling SMA200 -> 20-session return (z)' },
  { id: 'M1', flag: 'BOT', arm: -1, outcome: 'Z', h: 20, expect: -1, bar: 0.15, k: 1, label: 'MIRROR: BOTTOM stall below a falling SMA200 -> 20-session return (z) vs same-state controls' },
  { id: 'M2', flag: 'BOT', arm: 1, outcome: 'Z', h: 20, expect: +1, bar: 0.15, k: 1, label: 'BOTTOM stall above a rising SMA200 -> 20-session return (z)' },
];
export const ALL_CELLS = [...CELLS, ...REPORTED];
