/**
 * Tests for vwapStretchCore — synthetic data only, no network.
 * Run: node js/vwapStretchCore.test.mjs
 */

import { sessionOf, computeFrozenSigma, computeStretchSnapshot, computeVwapStretch } from './vwapStretchCore.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
}
function approx(a, b, tol, msg) { assert(a != null && Math.abs(a - b) <= tol, `${msg} (${a} ≈ ${b} ±${tol})`); }

const DAY = 86400;
const BASE_T = Date.UTC(2024, 0, 1) / 1000;   // Mon 2024-01-01 00:00 UTC

// Same synthetic packed-M1 builder as vwapFixedSigmaEngine.test.mjs (flat bars,
// o=h=l=c, volume constant 1 -> VWAP = running mean of closes).
function packDays(days) {
  const times = [], opens = [], highs = [], lows = [], closes = [], volumes = [];
  days.forEach((closesArr, d) => {
    closesArr.forEach((c, m) => {
      times.push(BASE_T + d * DAY + m * 60);
      opens.push(c); highs.push(c); lows.push(c); closes.push(c); volumes.push(1);
    });
  });
  const n = times.length;
  return { n, times: Int32Array.from(times), opens: Float32Array.from(opens),
           highs: Float32Array.from(highs), lows: Float32Array.from(lows),
           closes: Float32Array.from(closes), volumes: Float32Array.from(volumes) };
}
const wiggleDay = (base, amp, nBars = 400) => Array.from({ length: nBars }, (_, m) => base + (m % 2 === 0 ? amp : -amp));
const barsOf = closes => closes.map((c, m) => ({ time: BASE_T + m * 60, open: c, high: c, low: c, close: c, volume: 1 }));

console.log('[sessionOf]');
{
  assert(sessionOf(2) === 'Asia', 'hour 2 UTC -> Asia');
  assert(sessionOf(9) === 'London', 'hour 9 UTC -> London');
  assert(sessionOf(15) === 'NY', 'hour 15 UTC -> NY');
  assert(sessionOf(23) === 'Asia', 'hour 23 UTC -> Asia (wraps)');
}

console.log('[computeFrozenSigma]');
{
  // 25 days, alternating ±1 wiggle around 100 -> each day's RMS ≈ 1.
  const days = Array.from({ length: 25 }, () => wiggleDay(100, 1));
  const packed = packDays(days);
  const afterAll = BASE_T + 25 * DAY;

  const insufficient = computeFrozenSigma(packDays(days.slice(0, 5)), { now: BASE_T + 5 * DAY, historySessions: 20, minHistory: 10, minBarsPerDay: 200 });
  assert(insufficient === null, 'fewer than minHistory sessions -> null');

  const full = computeFrozenSigma(packed, { now: afterAll, historySessions: 20, minHistory: 10, minBarsPerDay: 200 });
  assert(full !== null, 'enough history -> a result');
  approx(full.sigma, 1, 0.05, 'sigma matches the wiggle amplitude (~1)');
  assert(full.sessionsUsed === 20, `capped at historySessions (got ${full?.sessionsUsed})`);

  // No-lookahead: cut off at day 20 (0-indexed 0..19 available) -- days 20-24
  // must not be visible, and with only 20 days available and minHistory=10,
  // sessionsUsed must be <=20, never the full 25.
  const cutoff = BASE_T + 20 * DAY;
  const early = computeFrozenSigma(packed, { now: cutoff, historySessions: 20, minHistory: 10, minBarsPerDay: 200 });
  assert(early !== null && early.sessionsUsed <= 20, 'cutoff respected: sessionsUsed never exceeds sessions actually before `now`');
  assert(early.lastSessionDate < new Date(afterAll * 1000).toISOString().slice(0, 10), 'lastSessionDate is before the cutoff, not the full archive');

  // A volatility regime far in the past (>lookbackDays back) must not leak
  // into today's frozen sigma once enough recent sessions exist.
  const mixed = [...Array.from({ length: 10 }, () => wiggleDay(100, 10)), ...Array.from({ length: 25 }, () => wiggleDay(100, 1))];
  const mixedPacked = packDays(mixed);
  const mixedNow = BASE_T + 35 * DAY;
  const mixedResult = computeFrozenSigma(mixedPacked, { now: mixedNow, historySessions: 20, minHistory: 10, minBarsPerDay: 200 });
  approx(mixedResult.sigma, 1, 0.05, 'old high-vol regime outside the trailing window does not leak into sigma');
}

console.log('[computeStretchSnapshot]');
{
  // 100 flat bars at 100 settle VWAP ~100, then a final bar jumps to 103.
  const closes = [...Array.from({ length: 100 }, () => 100), 103];
  const snap = computeStretchSnapshot({ todayBars: barsOf(closes), sigma: 1, minBars: 8 });
  assert(snap !== null, 'enough bars -> a reading');
  approx(snap.z, 2.97, 0.1, 'z ~= (price - vwap)/sigma');
  assert(snap.band === 2, `floor(|z|) = 2 (got ${snap?.band})`);
  assert(snap.side === 'up', 'price above vwap -> side up');
  approx(snap.price, 103, 1e-9, 'price = last close');

  const downClose = [...Array.from({ length: 100 }, () => 100), 96];
  const downSnap = computeStretchSnapshot({ todayBars: barsOf(downClose), sigma: 1, minBars: 8 });
  assert(downSnap.side === 'dn', 'price below vwap -> side dn');
  assert(downSnap.band === 3, `floor(|z|) = 3 for a -3.9-ish z (got ${downSnap?.band})`);

  const tooFew = computeStretchSnapshot({ todayBars: barsOf(closes.slice(0, 3)), sigma: 1, minBars: 8 });
  assert(tooFew === null, 'fewer than minBars -> null (no noisy early-session reading)');

  const noSigma = computeStretchSnapshot({ todayBars: barsOf(closes), sigma: 0, minBars: 8 });
  assert(noSigma === null, 'sigma <= 0 -> null');
}

console.log('[computeVwapStretch — composition]');
{
  const days = Array.from({ length: 25 }, () => wiggleDay(100, 1));
  const historyPacked = packDays(days);
  const now = BASE_T + 25 * DAY + 3 * 3600;   // 25 full days of history, 03:00 UTC "today"
  const todayBars = barsOf([...Array.from({ length: 100 }, () => 100), 102]);
  const result = computeVwapStretch({ historyPacked, todayBars, now, cfg: { historySessions: 20, minHistory: 10, minBarsPerDay: 200 } });
  assert(result !== null, 'full pipeline: enough history + enough today bars -> a reading');
  assert(result.session === 'Asia', `03:00 UTC -> Asia session (got ${result?.session})`);

  assert(computeVwapStretch({ historyPacked: null, todayBars, now }) === null, 'missing history -> null');
  assert(computeVwapStretch({ historyPacked, todayBars: null, now }) === null, 'missing today bars -> null');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
