// Yield-shape regime signal — pure logic (no I/O). The live job in js/yieldShapeRegimeRoutes.js calls these.
//
// The rule (analysis/yield_shape_regime_test.py + analysis/yield_shape_regime_dayclustered.py, pre-registered
// 2026-10-02): yesterday's UST10Y (^TNX) intraday path is a known "template" today. When today's price is CURRENTLY
// tracking that template closely (|rolling 2h correlation| above the instrument's threshold), a known turn in the
// template over the next 15/30/60 min is followed by an actual turn in price more often than the unconditional
// base rate — day-clustered placebo test, not just bar-count noise. Day-clustered results per instrument/window:
//   GBPUSD 15m >0.5corr: 57.7% vs 47.6% null (39 days, p=0.016)   EURUSD 15m >0.7corr: 52.5% vs 39.3% (29d, p=0.034)
//   NZDUSD 30m >0.5corr: 56.6% vs 48.0% (36d, p=0.026)            USDCHF 60m >0.5corr: 57.6% vs 47.4% (38d, p=0.034)
// This is a forward test of a "will price turn" signal meant to layer onto other confidence, not a standalone
// trading rule — it does not predict direction with any validated accuracy (see `predictedDir` below).

export const BAR_MIN = 15;              // bucket size, minutes
export const TRAIL_BARS = 4;            // 1h trailing slope, for both the yield template's turns and live scoring
export const CORR_WINDOW_BARS = 8;      // 2h rolling correlation window used for the in-sync gate

// One row per tracked pair: the window/threshold combo that cleared the day-clustered placebo test for that pair.
export const INSTRUMENTS = [
  { key: 'eurusd', windowMin: 15, thr: 0.7 },
  { key: 'gbpusd', windowMin: 15, thr: 0.5 },
  { key: 'nzdusd', windowMin: 30, thr: 0.5 },
  { key: 'usdchf', windowMin: 60, thr: 0.5 },
];

// Floor an epoch-seconds timestamp to a BAR_MIN-minute UTC clock bucket, returned as 'HH:MM'.
export function bucketTod(epochSec) {
  const bucketSec = Math.floor(epochSec / (BAR_MIN * 60)) * (BAR_MIN * 60);
  return new Date(bucketSec * 1000).toISOString().slice(11, 16);
}

export function utcDateOf(epochSec) {
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

// Bucket a {t:[], v:[]} (or packed-style) series of (epochSec, value) pairs into an ordered [{tod, value}] array,
// one entry per BAR_MIN bucket, keeping the LAST value seen in each bucket (matches the Yahoo-data research method).
export function bucketSeries(times, values) {
  const byTod = new Map();
  for (let i = 0; i < times.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    byTod.set(bucketTod(times[i]), v);
  }
  return [...byTod.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([tod, value]) => ({ tod, value }));
}

// sign of trailing slope (i-back..i) vs sign of forward slope (i..i+fwd) in an ordered bucket array. Returns
// { trail, fwd } signs (each -1/0/1), or null if out of range.
function slopeSigns(bars, i, back, fwd) {
  if (i - back < 0 || i + fwd >= bars.length) return null;
  const trail = Math.sign(bars[i].value - bars[i - back].value);
  const forward = Math.sign(bars[i + fwd].value - bars[i].value);
  return { trail, forward };
}

// Build yesterday's yield template from its full (already-elapsed) intraday bucket array: for each configured
// window, mark which time-of-day slots show a genuine reversal (trailing 1h slope flips sign over the next H min).
export function buildYieldTemplate(date, bars) {
  const windows = [...new Set(INSTRUMENTS.map(i => i.windowMin))];
  const turns = {};
  for (const windowMin of windows) {
    const fwdBars = windowMin / BAR_MIN;
    const byTod = {};
    for (let i = 0; i < bars.length; i++) {
      const s = slopeSigns(bars, i, TRAIL_BARS, fwdBars);
      byTod[bars[i].tod] = (s && s.trail !== 0 && s.forward !== 0 && s.trail !== s.forward) ? s.forward : null;
    }
    turns[windowMin] = byTod;
  }
  const byTod = Object.fromEntries(bars.map(b => [b.tod, b.value]));
  return { date, bars, byTod, turns };
}

// Rolling Pearson correlation between the yield template's values and today's price-so-far, over the trailing
// `windowBars` common time-of-day slots ending at `todayBars[idx]`. Returns null if not enough common history.
export function rollingCorrAt(templateByTod, todayBars, idx, windowBars) {
  if (idx - windowBars + 1 < 0) return null;
  const ys = [], ps = [];
  for (let i = idx - windowBars + 1; i <= idx; i++) {
    const y = templateByTod[todayBars[i].tod];
    if (!Number.isFinite(y)) return null;
    ys.push(y);
    ps.push(todayBars[i].value);
  }
  const n = ys.length;
  const my = ys.reduce((a, b) => a + b, 0) / n, mp = ps.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vy = 0, vp = 0;
  for (let i = 0; i < n; i++) { const dy = ys[i] - my, dp = ps[i] - mp; cov += dy * dp; vy += dy * dy; vp += dp * dp; }
  if (vy === 0 || vp === 0) return null;
  return cov / Math.sqrt(vy * vp);
}

// Did price itself turn at bars[idx] (trailing 1h vs the next `fwdBars`)? Only answerable once those forward bars
// have actually elapsed -- used to SCORE a signal logged `fwdBars` ago, not to generate a new one.
export function priceTurnAt(bars, idx, fwdBars) {
  const s = slopeSigns(bars, idx, TRAIL_BARS, fwdBars);
  if (!s) return null;
  return { turned: s.trail !== 0 && s.forward !== 0 && s.trail !== s.forward, dir: s.forward };
}
