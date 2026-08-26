/**
 * Tests for rangeFibVwapEntryV1Engine — synthetic data, no network.
 *
 * σ is pinned to 1 via the engine's documented `_fsOverride` test hook so the
 * on-VWAP / stretched thresholds are deterministic (the real σ series is
 * equivalence-tested separately in vwapFixedSigmaEngine.test.mjs).
 *
 * BASE_T is Mon 2024-01-01 (London == UTC in January), so Monday-range level
 * sources are active during the week — deliberately included, since that is
 * the engine's real behavior.
 *
 *   1. Rule A: a ladder level sitting on VWAP, touched, then extended →
 *      one BUY at the level, resolving 'win', filled after Asia closes.
 *   2. Rule B: a touch of a level ≥2σ from VWAP with a full retrace →
 *      one SELL toward VWAP, resolving 'win', filled after Asia closes.
 *   3. Quiet control: wiggle-only days (all levels well inside 2σ) →
 *      zero rule-B trades.
 *
 * Run: node js/rangeFibVwapEntryV1Engine.test.mjs
 */

import { runRangeFibVwap } from './rangeFibVwapEntryV1Engine.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
}

const DAY = 86400;
const BASE_T = Date.UTC(2024, 0, 1) / 1000;

function packDaysOC(days) {
  const times = [], opens = [], highs = [], lows = [], closes = [], volumes = [];
  days.forEach((arr, d) => {
    let prev = arr[0];
    arr.forEach((cl, m) => {
      const o = m === 0 ? cl : prev;
      times.push(BASE_T + d * DAY + m * 60);
      opens.push(o); highs.push(Math.max(o, cl)); lows.push(Math.min(o, cl)); closes.push(cl); volumes.push(1);
      prev = cl;
    });
  });
  return { n: times.length, times: Int32Array.from(times), opens: Float32Array.from(opens),
           highs: Float32Array.from(highs), lows: Float32Array.from(lows),
           closes: Float32Array.from(closes), volumes: Float32Array.from(volumes) };
}

// Warm day: small ±0.2 wiggle around 100 (nonzero ATR, tight Monday ranges).
const warmDay = () => Array.from({ length: 800 }, (_, m) => 100 + (m % 2 === 0 ? 0.2 : -0.2));
const asiaEnd = d => BASE_T + d * DAY + 6 * 3600;

console.log('1. Rule A — level on VWAP, touched, extends');
{
  const warm = Array.from({ length: 15 }, warmDay);
  // Test-day Asia (min 0-359): quiet ±0.05 around 100 (touches no Monday-grid
  // level besides the skipped 0.5 mid, so nothing can fire inside Asia).
  // After Asia: settle at 100, rise slowly — the first qualifying touch is an
  // above-mid ladder level sitting on VWAP; the rise carries it to its target.
  const test = [];
  for (let m = 0; m < 360; m++) test.push(m % 2 === 0 ? 99.95 : 100.05);   // ends on the high side
  for (let m = 0; m < 120; m++) test.push(100.05 + (m + 1) * 0.005);       // rise straight off the range high
  for (let m = 0; m < 320; m++) test.push(100.65);
  const packed = packDaysOC([...warm, test]);
  const { trades } = runRangeFibVwap(packed, { mode: 'line_on_vwap_extension', minBarsPerDay: 300, _fsOverride: 1 });
  const testDate = new Date((BASE_T + 15 * DAY) * 1000).toISOString().slice(0, 10);
  const dayTrades = trades.filter(t => t.date === testDate);
  assert(dayTrades.length === 1, `exactly one rule-A trade on the crafted day (got ${dayTrades.length})`);
  const t = dayTrades[0];
  if (t) {
    assert(t.side === 'BUY', `above-mid level → BUY (got ${t.side})`);
    assert(t.fillTime >= asiaEnd(15), 'fill is after the Asia session closed (causality)');
    assert(t.entry > 99.9 && t.entry < 100.6, `entry at a near-VWAP ladder level (got ${t.entry})`);
    assert(t.tp > t.entry, `target is the next ladder level out (got ${t.tp} > ${t.entry})`);
    assert(t.outcome === 'win', `the extension resolves 'win' (got ${t.outcome})`);
  }
}

console.log('2. Rule B — stretched level touched, fades back to VWAP');
{
  const warm = Array.from({ length: 15 }, warmDay);
  // Asia range [99,101] → lv 2 sits at 103. Run to 103.1 (≥2σ from VWAP≈100.x),
  // then a full retrace to 100 → the SELL's VWAP target is hit.
  const test = [];
  for (let m = 0; m < 360; m++) test.push(m % 2 === 0 ? 101 : 99);
  for (let m = 0; m < 120; m++) test.push(100 + (m + 1) / 120 * 3.1);
  for (let m = 0; m < 180; m++) test.push(103.1 - (m + 1) / 180 * 3.1);
  for (let m = 0; m < 140; m++) test.push(100);
  const packed = packDaysOC([...warm, test]);
  const { trades } = runRangeFibVwap(packed, { mode: 'line_fade_stretched', minBarsPerDay: 300, _fsOverride: 1 });
  const testDate = new Date((BASE_T + 15 * DAY) * 1000).toISOString().slice(0, 10);
  const dayTrades = trades.filter(t => t.date === testDate);
  assert(dayTrades.length === 1, `exactly one rule-B trade on the crafted day (got ${dayTrades.length})`);
  const t = dayTrades[0];
  if (t) {
    assert(t.side === 'SELL', `level above VWAP → SELL toward VWAP (got ${t.side})`);
    assert(t.fillTime >= asiaEnd(15), 'fill is after the Asia session closed (causality)');
    assert(t.entry >= 102 && t.distSigma >= 2, `entry at a stretched level (got ${t.entry}, ${t.distSigma}σ)`);
    assert(t.tp < t.entry && t.outcome === 'win', `the retrace to VWAP resolves 'win' (got ${t.outcome})`);
  }
}

console.log('3. Quiet control — no stretched touches, no rule-B trades');
{
  const packed = packDaysOC(Array.from({ length: 20 }, warmDay));
  const { trades } = runRangeFibVwap(packed, { mode: 'line_fade_stretched', minBarsPerDay: 300, _fsOverride: 1 });
  assert(trades.length === 0, `wiggle-only days produce zero fade trades (got ${trades.length})`);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
