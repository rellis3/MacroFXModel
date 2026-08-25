/**
 * Tests for vwapImpulseEntryV1Engine — synthetic data, no network.
 *
 *   1. pullback_continuation: a crafted HTF impulse + pullback-to-VWAP + rally
 *      produces exactly one BUY filled AT the VWAP zone, resolving 'win', and
 *      the fill happens strictly AFTER the trigger bar's close (causality).
 *   2. band_reentry_fade: impulse closing beyond +2 fixed-σ, then the first M1
 *      close back inside fires a SELL toward VWAP, resolving 'win'; fill
 *      strictly after the trigger bar's close.
 *   3. Quiet control: uniform wiggle days produce zero impulses/trades.
 *
 * Run: node js/vwapImpulseEntryV1Engine.test.mjs
 */

import { runVwapImpulseEntry } from './vwapImpulseEntryV1Engine.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
}

const DAY = 86400;
const BASE_T = Date.UTC(2024, 0, 1) / 1000;

// Bars with REAL bodies: each bar opens at the prior close — an HTF resample
// of these has body = net move, which is what the impulse detector reads.
// days = array of arrays of closes.
function packDaysOC(days) {
  const times = [], opens = [], highs = [], lows = [], closes = [], volumes = [];
  days.forEach((arr, d) => {
    let prev = arr[0];
    arr.forEach((c, m) => {
      const o = m === 0 ? c : prev;
      times.push(BASE_T + d * DAY + m * 60);
      opens.push(o); highs.push(Math.max(o, c)); lows.push(Math.min(o, c)); closes.push(c); volumes.push(1);
      prev = c;
    });
  });
  return { n: times.length, times: Int32Array.from(times), opens: Float32Array.from(opens),
           highs: Float32Array.from(highs), lows: Float32Array.from(lows),
           closes: Float32Array.from(closes), volumes: Float32Array.from(volumes) };
}

// Quiet day: gentle sine around 100 (small but nonzero hourly bodies).
const quietDay = (nBars = 400) =>
  Array.from({ length: nBars }, (_, m) => 100 + 0.3 * Math.sin(2 * Math.PI * m / 240));

console.log('1. pullback_continuation on a crafted impulse + pullback + rally');
{
  const warm = Array.from({ length: 15 }, () => quietDay());
  const test = [];
  for (let m = 0; m < 120; m++) test.push(100 + 0.2 * Math.sin(m / 20));         // quiet
  for (let m = 0; m < 60; m++) test.push(100 + (m + 1) / 60 * 3);                // impulse hour → 103 (bucket 120-179)
  for (let m = 0; m < 120; m++) test.push(103 - (m + 1) / 120 * 2.3);            // pullback to 100.7 (tags VWAP, stays above the ATR stop)
  for (let m = 0; m < 180; m++) test.push(100.7 + (m + 1) / 180 * 2.9);          // rally through the impulse high
  const packed = packDaysOC([...warm, test]);
  const { trades, meta } = runVwapImpulseEntry(packed, {
    mode: 'pullback_continuation', triggerTfMin: 60, minBarsPerDay: 300,
  });
  const testDate = new Date((BASE_T + 15 * DAY) * 1000).toISOString().slice(0, 10);
  const dayTrades = trades.filter(t => t.date === testDate);
  assert(meta.impulses >= 1, `impulse detector fired (${meta.impulses} impulses over the history)`);
  assert(dayTrades.length === 1, `exactly one trade on the crafted day (got ${dayTrades.length})`);
  const t = dayTrades[0];
  if (t) {
    assert(t.side === 'BUY', `with-impulse direction (BUY, got ${t.side})`);
    const activeAt = BASE_T + 15 * DAY + 180 * 60;   // impulse bucket 120-179 closes at minute 180
    assert(t.fillTime >= activeAt, `fill (${t.fillTime}) is at/after the trigger bar's CLOSE (${activeAt}) — causality`);
    assert(t.entry < 101.5 && t.entry > 99.5, `entry is at the VWAP zone (~100.x, got ${t.entry})`);
    assert(Math.abs(t.tp - 103) < 0.05, `target is the impulse extreme (~103, got ${t.tp})`);
    assert(t.outcome === 'win', `the rally through the impulse high resolves 'win' (got ${t.outcome})`);
  }
}

console.log('2. band_reentry_fade on a crafted stretch + re-entry + reversion');
{
  const warm = Array.from({ length: 15 }, () => quietDay());
  const test = [];
  for (let m = 0; m < 60; m++) test.push(100 + 0.2 * Math.sin(m / 20));          // quiet hour
  for (let m = 0; m < 60; m++) test.push(100 + Math.min(1, (m + 1) / 15) * 3);   // impulse hour → 103, closes there
  for (let m = 0; m < 40; m++) test.push(103);                                   // hold beyond the band
  for (let m = 0; m < 140; m++) test.push(103 - (m + 1) / 140 * 2.9);            // decline: re-enters band, then through VWAP
  for (let m = 0; m < 180; m++) test.push(100.1);                                // settle
  const packed = packDaysOC([...warm, test]);
  const { trades, meta } = runVwapImpulseEntry(packed, {
    mode: 'band_reentry_fade', triggerTfMin: 60, minBarsPerDay: 300,
  });
  const testDate = new Date((BASE_T + 15 * DAY) * 1000).toISOString().slice(0, 10);
  const dayTrades = trades.filter(t => t.date === testDate);
  assert(dayTrades.length === 1, `exactly one fade trade on the crafted day (got ${dayTrades.length})`);
  const t = dayTrades[0];
  if (t) {
    assert(t.side === 'SELL', `fade of an up-impulse is a SELL (got ${t.side})`);
    const activeAt = BASE_T + 15 * DAY + 120 * 60;
    assert(t.fillTime >= activeAt, `fill (${t.fillTime}) is at/after the trigger bar's CLOSE (${activeAt}) — causality`);
    assert(t.entry > t.tp, `short entry sits above the VWAP target (entry ${t.entry}, tp ${t.tp})`);
    assert(t.outcome === 'win', `the reversion through VWAP resolves 'win' (got ${t.outcome})`);
  }
}

console.log('3. Quiet control: no impulses, no trades');
{
  const packed = packDaysOC(Array.from({ length: 20 }, () => quietDay()));
  for (const mode of ['pullback_continuation', 'band_reentry_fade']) {
    const { trades } = runVwapImpulseEntry(packed, { mode, triggerTfMin: 60, minBarsPerDay: 300 });
    assert(trades.length === 0, `${mode}: uniform wiggle days produce zero trades (got ${trades.length})`);
  }
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
