/**
 * forecastCore tests — fill-bar causality + one-step-ahead σ.
 * Offline, synthetic data only (no network). Run: node js/forecastCore.test.mjs
 *
 * Pins the two 2026-07 lookahead fixes:
 *   1. walkBars / walkDynamicHL may NOT resolve a limit-entry TP on the fill
 *      bar (the TP region is traversed on the way TO the band — fatal on D1
 *      window bars). Stop-entry TP on the fill bar IS causal (price must pass
 *      the entry to reach it).
 *   2. dynamic-HL anchors use extremes STRICTLY BEFORE the tested bar (seeded
 *      with the session open) — never the bar's own extreme.
 *   3. nextSigma(bars[0..n-1]) === volSigmaSeries(bars[0..n])[n] for every
 *      asset class (the producer's "σ for today" contract).
 */

import { walkBars, simulateEntry, computeBands, volSigmaSeries, nextSigma } from './forecastCore.js';

let pass = 0, failCount = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failCount++; console.error(`  ✗ ${name}`); }
}
const near = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;

// Deterministic PRNG (mulberry32) — synthetic bars must be reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function syntheticBars(n, seed, start = 100) {
  const r = rng(seed);
  const bars = [];
  let close = start;
  for (let i = 0; i < n; i++) {
    const open = close * (1 + (r() - 0.5) * 0.002);
    close = open * (1 + (r() - 0.5) * 0.02);
    const high = Math.max(open, close) * (1 + r() * 0.008);
    const low = Math.min(open, close) * (1 - r() * 0.008);
    bars.push({ open, high, low, close, time: i });
  }
  return bars;
}

console.log('[walkBars fill-bar causality]');
{
  // Limit SELL fade: open 100, entry 102, TP 101 (between open and entry), SL 103.
  // One bar spans open→TP→entry (low 99.5 touched the TP region BEFORE the fill
  // could exist). The old walker booked this as a win; it must not be one.
  const bar = { open: 100, high: 102.5, low: 99.5, close: 102.2, time: 1 };
  const r = walkBars([bar], 102, 101, 103, false, 'limit', 100);
  ok('limit fill-bar TP is NOT booked as a win', r.filled === true && r.outcome !== 'win');
  ok('unresolved fill-bar trade marks to window close', near(r.pnlPct, (102 - 102.2) / 100 * 100));

  // Same trade, but the NEXT bar trades down through the TP → legitimate win.
  const bar2 = { open: 102.2, high: 102.3, low: 100.9, close: 101.2, time: 2 };
  const r2 = walkBars([bar, bar2], 102, 101, 103, false, 'limit', 100);
  ok('TP resolves normally from the bar AFTER the fill', r2.outcome === 'win' && r2.exitTime === 2);

  // SL on the fill bar still books the loss (pessimistic, causally sound for a fade).
  const barSl = { open: 100, high: 103.4, low: 99.8, close: 103.0, time: 1 };
  const r3 = walkBars([barSl], 102, 101, 103, false, 'limit', 100);
  ok('SL on the fill bar still books a loss', r3.outcome === 'loss');

  // STOP (follow) BUY: entry 102, TP 103 — reaching 103 from below REQUIRES
  // passing 102 first, so a fill-bar TP is causal and must still count.
  // (Bar low stays above the 101 SL so SL-first pessimism doesn't fire.)
  const barStop = { open: 101.6, high: 103.2, low: 101.5, close: 102.8, time: 1 };
  const r4 = walkBars([barStop], 102, 103, 101, true, 'stop', 100);
  ok('stop-entry TP on the fill bar still counts (far side of entry)', r4.outcome === 'win');
}

console.log('[dynamic-HL anchor lag]');
{
  // hl75 ≈ 5% of open: sigma chosen so BM_P75 × fx-corr × σ ≈ 0.05.
  // fx hl_75_corr was recalibrated 2026-07-07 (0.912→0.817); σ divisor tracks it
  // so the setup still yields hl75 = 5% (the intent) for the anchor-lag checks.
  const bands = computeBands(100, 0.05 / (2.049 * 0.817), 'fx');
  ok('test setup: hl75 ≈ 5%', Math.abs(bands.hl75 - 0.05) < 1e-9);

  // Single bar {high 104, low 96}. With the OLD self-anchoring, the sell level
  // was 96×1.05 = 100.8 ≤ 104 → self-fulfilling fill off the bar's own final
  // low. With the open-seeded lagged anchor the level is 100×1.05 = 105 > 104
  // → no fill. (This is BUG_LIST #8's defect, now unrepresentable.)
  const oneBar = { open: 100, high: 104, low: 96, close: 100, time: 1 };
  const r = simulateEntry({ open: 100, bars: [oneBar] }, bands,
    { band: 'hl75', action: 'fade', dir: 'up', dynamicHL: true, costPct: 0, slipPct: 0 });
  ok('dynamic level cannot fill against the bar that sets its anchor', r.filled === false);

  // Two bars: bar0 makes a low of 99 (completed, knowable); bar1's level is
  // 99×1.05 = 103.95 and bar1 trades to 105.2 → a legitimate lagged-anchor fill.
  const b0 = { open: 100, high: 101, low: 99, close: 100.5, time: 1 };
  const b1 = { open: 100.5, high: 105.2, low: 100.2, close: 104.0, time: 2 };
  const r2 = simulateEntry({ open: 100, bars: [b0, b1] }, bands,
    { band: 'hl75', action: 'fade', dir: 'up', dynamicHL: true, costPct: 0, slipPct: 0 });
  ok('dynamic level fills off the PRIOR bar\'s extreme', r2.filled === true && r2.fillTime === 2);
  // And the fill-bar TP rule applies here too: the static OC target below the
  // entry was traversed before the fill — bar1 cannot also be the win bar.
  ok('dynamic fill-bar TP is not booked as a win', r2.outcome !== 'win');
}

console.log('[nextSigma golden identity]');
{
  for (const ac of ['fx', 'index', 'commodity']) {
    const bars = syntheticBars(120, 42);
    let allMatch = true;
    for (const n of [60, 75, 100, 119]) {
      const predicted = nextSigma(bars.slice(0, n), ac);       // knows bars < n only
      const truth = volSigmaSeries(bars.slice(0, n + 1), ac)[n]; // real bar n appended
      if (!near(predicted, truth, 1e-15)) allMatch = false;
    }
    ok(`nextSigma(bars[0..n-1]) === volSigmaSeries(bars[0..n])[n]  (${ac})`, allMatch);
  }
  // The producer contract: nextSigma must differ from the raw last element
  // (which predicts yesterday) whenever vol is moving — i.e. the fix is live.
  const bars = syntheticBars(120, 7);
  const raw = volSigmaSeries(bars, 'fx');
  ok('nextSigma is one step AHEAD of the raw last element',
     !near(nextSigma(bars, 'fx'), raw[raw.length - 1], 1e-15));
  // DI seam: an injected fake series function is passed through untouched.
  const fake = (b) => Float64Array.from({ length: b.length }, (_, i) => i);
  ok('nextSigma passes an injected seriesFn through (DI seam)',
     nextSigma(bars, 'fx', fake) === bars.length); // fake gets bars+phantom → last idx = length
}

console.log(`\n${pass} passed, ${failCount} failed`);
if (failCount) process.exit(1);
