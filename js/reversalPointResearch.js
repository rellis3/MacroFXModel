/**
 * Reversal-Point Research — a SEPARATE calc from the vol forecast (leaves it alone).
 *
 * The vol forecast answers "how FAR will price travel" (a range σ). This answers a
 * different question: "WHERE does price actually reverse?" — by extracting the
 * intraday swing highs/lows that HELD and turned (the real exhaustion points), and
 * measuring them against the SAME anchors the forecaster uses:
 *   • the London-midnight OPEN  — the Open-Close anchor, and
 *   • the RUNNING intraday extreme — the dynamic High-Low anchor (how far the move
 *     ran from the day's running low/high before it exhausted).
 *
 * First deliverable (this file): the label extractor + the empirical distribution of
 * where reversals cluster — so we can SEE whether reversals happen at the median
 * (~P50) / 75th, or at some other distance entirely. That is the honest foundation
 * before any model: is the median even where price turns?
 *
 * Pure + synthetic-testable. Reuses buildLondonDaily for the London-day boundary;
 * builds a NEW target (the realized reversal price), never the σ range. Copies nothing.
 */
import { buildLondonDaily } from './volEstimatorAB.js';
import { _londonParts, SESSIONS } from './sessionStats.js';

const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const _sortNum = a => [...a].sort((x, y) => x - y);
const _median = a => { if (!a.length) return 0; const s = _sortNum(a); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const _pctile = (a, p) => { if (!a.length) return 0; const s = _sortNum(a); const i = p / 100 * (s.length - 1); const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r2 = x => Math.round(x * 1000) / 1000;

function _session(tMs) {
  const h = _londonParts(new Date(tMs)).hour;
  for (const [s, [h0, h1]] of Object.entries(SESSIONS)) if (h >= h0 && h < h1) return s;
  return 'other';
}

// ZigZag reversal detector: confirms the last extreme as a pivot once price retraces
// ≥ `thr` (price units) from it, then flips direction. Each pivot is a swing that
// HELD and reversed by at least the threshold — i.e. a real intraday exhaustion point.
// Returns [{ idx, price, kind:'high'|'low', _t }] in chronological order.
export function _zigzag(bars, thr) {
  const piv = [];
  if (!bars || bars.length < 2 || !(thr > 0)) return piv;
  let dir = 0, extPx = bars[0].close, extIdx = 0;   // dir 0/-1 seek a low; +1 seek a high
  for (let i = 1; i < bars.length; i++) {
    const hi = bars[i].high, lo = bars[i].low;
    if (dir <= 0) {
      if (lo < extPx) { extPx = lo; extIdx = i; }
      if (hi - extPx >= thr) { piv.push({ idx: extIdx, price: extPx, kind: 'low', _t: bars[extIdx]._t }); dir = 1; extPx = hi; extIdx = i; }
    } else {
      if (hi > extPx) { extPx = hi; extIdx = i; }
      if (extPx - lo >= thr) { piv.push({ idx: extIdx, price: extPx, kind: 'high', _t: bars[extIdx]._t }); dir = -1; extPx = lo; extIdx = i; }
    }
  }
  return piv;
}

// intraday: raw M1/M5 bars ({ time, open, high, low, close }), any granularity.
// opts.revFrac: reversal threshold as a fraction of the pair's median daily range
// (adaptive → auto-scales per instrument). Default 0.25 (a swing ≥ 25% of a typical
// day's range counts as a reversal).
export function reversalStudy(intraday, opts = {}) {
  const { revFrac = 0.25, minBarsPerDay = 6, dropFirstPivot = true } = opts;
  const lond = buildLondonDaily(intraday);
  if (lond.length < 20) return { insufficient: true, nDays: lond.length };
  const dayRanges = lond.map(d => d.high - d.low).filter(x => x > 0);
  const medRange = _median(dayRanges);                 // price units
  const refPx = lond.at(-1).open || lond[0].open || 1;  // for %-of-price scaling
  const thr = revFrac * medRange;
  const fromOpen = [], runExt = [], perDay = [], mags = [];
  const bySession = {};
  for (const d of lond) {
    if (!d.bars || d.bars.length < minBarsPerDay || !(d.open > 0) || !(thr > 0)) continue;
    const bars = d.bars;
    let pivots = _zigzag(bars, thr);
    if (dropFirstPivot && pivots.length) pivots = pivots.slice(1);   // first pivot is seed-dependent
    perDay.push(pivots.length);
    let rl = bars[0].low, rh = bars[0].high, ptr = 0;
    // Running extreme up to each pivot (single pass — pivots are in order).
    for (const p of pivots) {
      while (ptr <= p.idx) { if (bars[ptr].low < rl) rl = bars[ptr].low; if (bars[ptr].high > rh) rh = bars[ptr].high; ptr++; }
      fromOpen.push(Math.abs((p.price - d.open) / d.open * 100));                       // reversal distance from the London open
      const rePct = p.kind === 'high' ? (p.price - rl) / d.open * 100 : (rh - p.price) / d.open * 100;  // run from the running extreme
      if (rePct > 0) { runExt.push(rePct); mags.push(rePct); }
      bySession[_session(p._t)] = (bySession[_session(p._t)] || 0) + 1;
    }
  }
  const dist = a => a.length ? { n: a.length, p25: r2(_pctile(a, 25)), p50: r2(_pctile(a, 50)), p75: r2(_pctile(a, 75)), p90: r2(_pctile(a, 90)), mean: r2(_mean(a)) } : { n: 0 };
  return {
    nDays: lond.length, dateFrom: lond[0].date, dateTo: lond.at(-1).date,
    revFrac, thresholdPct: r2(thr / refPx * 100), medRangePct: r2(medRange / refPx * 100),
    reversalsPerDay: r2(_mean(perDay)), nReversals: runExt.length,
    // Where reversals sit relative to the OPEN (O-C anchor), |% of price|.
    fromOpenPct: dist(fromOpen),
    // How far the move ran from the RUNNING extreme before reversing (H-L dynamic anchor).
    // THIS is the empirical exhaustion distance — compare its P50 to the forecast median.
    runFromExtremePct: dist(runExt),
    bySession,
  };
}
