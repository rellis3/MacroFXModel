// js/terminal/legChartCore.js: the PURE half of the terminal's "Rates vs price" panel (legChartView.js draws it). No DOM, no fetch.
//
// One generic chart: a price candle for any market, with any rate leg or spread drawn over it on its own axis, the line movable forward and back
// by bars, a "find the best lag" button that works on the bars currently on screen, and a rolling correlation of the line's changes with price
// returns. The maths is js/cogChartMath.js (shared with cog-chart.html); this file adds the glue and the rolling correlation.
//
// DESCRIPTION ONLY. The shift moves what is drawn and nothing else. The lag finder measures changes (not levels) and tests the best lag against a
// placebo (see lagProfile): "nothing beats luck" is the usual and honest answer (STIR rates vs Nasdaq: same bar, no lead).
import { TF_SEC, legOnChart, carryForward, legRaw, spreadRaw, changesOf } from '../cogChartMath.js';

export const TFS = ['5m', '15m', '1h', '4h'];
/** Lines on offer. kind 'spread' = EUR leg - USD leg (rates, bp, the C.OG indicator's logic); 'leg' = one leg. rolling names follow cog-chart.html. */
export const PRESETS = [
  { id: 'cog', label: 'SOFR minus Euribor futures spread (bp)', kind: 'spread', eur: 'I2', usd: 'SR3U6', asRate: true, invert: true, inBps: true },
  { id: 'us2y', label: 'US 2y yield', kind: 'leg', leg: 'Y_US2', asRate: false, invert: false, inBps: false },
  { id: 'us10y', label: 'US 10y yield', kind: 'leg', leg: 'Y_US10', asRate: false, invert: false, inBps: false },
  { id: 'us5y', label: 'US 5y yield', kind: 'leg', leg: 'Y_US5', asRate: false, invert: false, inBps: false },
  { id: 'us30y', label: 'US 30y yield', kind: 'leg', leg: 'Y_US30', asRate: false, invert: false, inBps: false },
  { id: 'curve', label: 'US curve 10y minus 2y (bp)', kind: 'spread', eur: 'Y_US10', usd: 'Y_US2', asRate: false, invert: false, inBps: true },
  { id: 'real10', label: 'US 10y real yield (daily)', kind: 'leg', leg: 'Y_USR10', asRate: false, invert: false, inBps: false },
  { id: 'be10', label: 'US 10y breakeven inflation (daily)', kind: 'leg', leg: 'Y_USBE10', asRate: false, invert: false, inBps: false },
  { id: 'de10', label: 'German 10y Bund yield', kind: 'leg', leg: 'Y_DE10', asRate: false, invert: false, inBps: false },
  { id: 'bundust', label: 'Bund minus UST 10y (bp)', kind: 'spread', eur: 'Y_DE10', usd: 'Y_US10', asRate: false, invert: false, inBps: true },
];
// a macro tab opens on the main FX pair at an hourly view, not on Nasdaq 15m (owner review 2026-11-27); a saved choice still wins
export const DEFAULT_STATE = { asset: 'EURUSD', tf: '1h', overlays: ['us2y'], active: 'us2y', maxLag: 48, win: 96 };

/** One leg's prices on the chart's times (5m/15m legs; 1h/4h use the h1 history when held). Gaps carried forward like the indicator's fixnan; the leg's data end is respected. */
export function legPrices(L, times, step, { src = 'close', carry = true } = {}) {
  if (!L) return times.map(() => null);
  const useM5 = step <= 900 && L.m5?.length > 0 && step <= 300, useH1 = step >= 3600 && L.h1?.length > 0;
  const bars = useM5 ? L.m5 : useH1 ? L.h1 : L.m15;
  const legStep = useM5 ? 300 : useH1 ? 3600 : 900;
  if (!bars?.length) return times.map(() => null);
  const px = legOnChart(bars, times, step, src, step, legStep), out = carry ? carryForward(px) : px;
  const lastT = bars[bars.length - 1].t + step;       // carrying the last print past the data's end would draw a flat line that looks like data
  return out.map((v, i) => (times[i] >= lastT ? null : v));
}

/** The raw line (the number a statistic uses) for a preset, on the candles' times. legs = { name: { m5, m15, h1 } }. */
export function lineRaw(preset, legs, times, step, smooth = 1) {
  const o = { asRate: preset.asRate, invert: preset.invert, inBps: preset.inBps, smooth };
  if (preset.kind === 'spread') return spreadRaw(legPrices(legs[preset.eur], times, step), legPrices(legs[preset.usd], times, step), o);
  return legRaw(legPrices(legs[preset.leg], times, step), o);
}

export const neededLegs = preset => (preset.kind === 'spread' ? [preset.eur, preset.usd] : [preset.leg]);

function pearson(xs, ys) {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < xs.length; i++) { const a = xs[i], b = ys[i]; if (a == null || b == null) continue; n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b; }
  if (n < 20) return null;
  const vx = sxx - sx * sx / n, vy = syy - sy * sy / n;
  return vx > 0 && vy > 0 ? (sxy - sx * sy / n) / Math.sqrt(vx * vy) : null;
}

/**
 * Rolling correlation of the line's bar-to-bar changes with price log returns over the trailing `win` bars, at `lag` bars (lag > 0 = the line leads price,
 * the same sign as the Shift). Returns [{ i, r }] aligned to the candle index of the price bar; null r where there is too little overlap.
 */
export function rollingCorr(line, closes, win = 96, lag = 0) {
  const { dx, ry } = changesOf(line, closes), L = dx.length, out = [];
  for (let end = win; end < L; end++) {
    const xs = [], ys = [];
    for (let i = end - win + 1; i <= end; i++) { const j = i + lag; if (j < 0 || j >= L) continue; xs.push(dx[i]); ys.push(ry[j]); }
    out.push({ i: end + Math.max(0, lag), r: pearson(xs, ys) });
  }
  return out;
}

/** The slice [from, to] of the arrays that is on screen (logical range from the chart), clamped; returns { from, to } or null when too short to test. */
export function visibleSpan(range, length, minBars = 120) {
  if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to)) return null;
  const from = Math.max(0, Math.floor(range.from)), to = Math.min(length - 1, Math.ceil(range.to));
  return to - from + 1 >= minBars ? { from, to } : null;
}
