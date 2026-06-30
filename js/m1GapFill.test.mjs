/**
 * Offline tests for m1GapFill — the build-time M1 gap top-up (no network).
 * Run: node js/m1GapFill.test.mjs
 */
import {
  toEpochSec, lastPackedEpoch, computeGap, chunkMinuteRange,
  fetchM1Gap, mergeBarsIntoPacked, gapFillPacked,
} from './m1GapFill.js';

let failures = 0;
const ok = (name, cond) => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}`); if (!cond) failures++; };

const MIN = 60;
// A small packed series ending at t0 (epoch seconds).
function packedEndingAt(t0, count = 3) {
  const times = [], o = [], h = [], l = [], c = [], v = [];
  for (let i = count - 1; i >= 0; i--) { times.push(t0 - i * MIN); o.push(1); h.push(2); l.push(0.5); c.push(1.5); v.push(10); }
  return { n: count, times, opens: o, highs: h, lows: l, closes: c, volumes: v };
}

console.log('[m1GapFill]');

// ── time normalisation ──
ok('toEpochSec passes seconds through', toEpochSec(1_700_000_000) === 1_700_000_000);
ok('toEpochSec converts ms', toEpochSec(1_700_000_000_000) === 1_700_000_000);
ok('toEpochSec parses ISO', toEpochSec('2026-06-30T00:00:00Z') === Math.floor(Date.parse('2026-06-30T00:00:00Z') / 1000));

// ── computeGap ──
const t0 = 1_700_000_000;
ok('computeGap null on empty packed', computeGap({ n: 0, times: [] }, t0) === null);
ok('computeGap null when current (within minGapSec)', computeGap(packedEndingAt(t0), t0 + 600) === null);
{
  const g = computeGap(packedEndingAt(t0), t0 + 5 * 3600);   // 5h stale
  ok('computeGap returns [lastBar+1min, now]', g && g.fromSec === t0 + MIN && g.toSec === t0 + 5 * 3600);
}

// ── chunkMinuteRange ──
{
  const from = t0, to = t0 + (10000 - 1) * MIN;             // 10000 minutes
  const chunks = chunkMinuteRange(from, to, 5000);
  ok('chunks a 10000-min range into 2', chunks.length === 2);
  ok('chunks are contiguous & cover the range', chunks[0].fromSec === from &&
     chunks[1].toSec === to && chunks[1].fromSec === from + 5000 * MIN);
  ok('chunkMinuteRange empty when to<from', chunkMinuteRange(t0, t0 - MIN).length === 0);
}

// ── fetchM1Gap (injected fetcher, paginated + a failing chunk) ──
{
  const calls = [];
  const fetchCandles = async (sym, fromSec, toSec) => {
    calls.push([fromSec, toSec]);
    if (fromSec === t0 + 5000 * MIN) throw new Error('boom');   // 2nd chunk fails → skipped, not fatal
    return [{ time: fromSec, open: 1, high: 1, low: 1, close: 1, volume: 1 },
            { time: fromSec + MIN, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
  };
  const bars = await fetchM1Gap('EUR_USD', t0, t0 + (10000 - 1) * MIN, fetchCandles, { maxBars: 5000 });
  ok('fetchM1Gap paginates (2 chunks attempted)', calls.length === 2);
  ok('fetchM1Gap survives a failing chunk (returns the good one)', bars.length === 2 && bars[0].time === t0);
}

// ── mergeBarsIntoPacked ──
{
  const base = packedEndingAt(t0, 3);                         // ends at t0
  const merged = mergeBarsIntoPacked(base, [
    { time: t0,          open: 9, high: 9, low: 9, close: 9 }, // == last → dropped (already covered)
    { time: t0 + MIN,    open: 2, high: 3, low: 1, close: 2.5, volume: 7 },
    { time: t0 + MIN,    open: 5, high: 5, low: 5, close: 5 }, // dup of the new bar → dropped
    { time: t0 + 2 * MIN, open: 3, high: 4, low: 2, close: 3.5 },
  ]);
  ok('merge appends only strictly-newer, deduped bars', merged.n === 5);
  ok('merge keeps base bars intact', merged.closes[2] === 1.5);
  ok('merge appends the new bar values', merged.opens[3] === 2 && merged.closes[4] === 3.5);
  ok('merge does not mutate the base', base.n === 3);
  ok('merge no-ops when nothing new', mergeBarsIntoPacked(base, [{ time: t0 - MIN, open: 1, high: 1, low: 1, close: 1 }]).n === 3);
}

// ── gapFillPacked (end-to-end, injected fetcher) ──
{
  const base = packedEndingAt(t0, 3);
  const fetchCandles = async (sym, fromSec, toSec) => {
    const bars = [];
    for (let s = fromSec; s <= toSec; s += MIN) bars.push({ time: s, open: 1, high: 1, low: 1, close: 1, volume: 1 });
    return bars;
  };
  const out = await gapFillPacked(base, 'EUR_USD', fetchCandles, { nowSec: t0 + 3 * MIN, minGapSec: 60 });
  ok('gapFillPacked extends the series to now', out.n === 6 && lastPackedEpoch(out) === t0 + 3 * MIN);
  const noop = await gapFillPacked(base, 'EUR_USD', fetchCandles, { nowSec: t0 + 30, minGapSec: 3600 });
  ok('gapFillPacked no-ops when current', noop === base);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
if (failures) process.exit(1);
