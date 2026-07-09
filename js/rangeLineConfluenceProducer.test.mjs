// Synthetic test for the range-line confluence producer (no network).
//   node js/rangeLineConfluenceProducer.test.mjs
import { refreshRangeLineConfluence, packLiveM1, sessionStartEpoch } from './rangeLineConfluenceProducer.js';
import { latestSessionConfluence, confluenceBucketAt } from './rangeLineAnalyser.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// Synthetic packed M1: `days` × 1-min bars in a 00:00–02:00 UTC window (same-day
// session under boundaryHour 0). Deterministic (no Math.random).
function makePacked(days, base0, seed) {
  const perDay = 120, n = days * perDay;
  const times = new Float64Array(n), opens = new Float64Array(n), highs = new Float64Array(n),
        lows = new Float64Array(n), closes = new Float64Array(n), volumes = new Float64Array(n);
  const day0 = Date.UTC(2024, 0, 1) / 1000;
  let idx = 0, base = base0;
  for (let d = 0; d < days; d++) {
    base *= 1 + 0.001 * Math.sin((d + seed) / 5);
    const amp = 0.006 + 0.002 * Math.sin((d + seed) / 3);
    for (let m = 0; m < perDay; m++) {
      const o = base * (1 + amp * Math.sin((m + seed) / 15));
      const c = base * (1 + amp * Math.sin((m + 1 + seed) / 15));
      times[idx] = day0 + d * 86400 + m * 60;
      opens[idx] = o; closes[idx] = c;
      highs[idx] = Math.max(o, c) * 1.0003; lows[idx] = Math.min(o, c) * 0.9997;
      volumes[idx] = 100 + (m % 9);
      idx++;
    }
  }
  return { n, times, opens, highs, lows, closes, volumes };
}

console.log('[latestSessionConfluence — packed M1 → today\'s levels]');
const packed = makePacked(30, 1.10, 0);
const { date, levels } = latestSessionConfluence(packed, { boundaryHour: 0, confLookback: 5, pip: 0.0001 });
ok('returns a date + levels list', !!date && Array.isArray(levels) && levels.length > 0, `date=${date} n=${levels.length}`);
ok('levels are {price, source}, finite', levels.every(l => Number.isFinite(l.price) && typeof l.source === 'string'));
ok('multiple distinct sources (incl. fib15)', new Set(levels.map(l => l.source)).size >= 3,
   `sources=${[...new Set(levels.map(l => l.source))].join(',')}`);

console.log('[refreshRangeLineConfluence — injected IO, writes KV]');
let written = null;
const art = await refreshRangeLineConfluence({
  universe: ['eurusd', 'gbpusd', 'nodata'],
  getPacked: async (k) => (k === 'nodata' ? null : makePacked(30, k === 'eurusd' ? 1.10 : 1.25, k === 'eurusd' ? 0 : 3)),
  kvPut: async (key, val) => { written = { key, val }; },
  pipFor: () => 0.0001, boundaryHour: 0, confLookback: 5,
  now: () => '2024-01-31T06:15:00Z', stamp: () => 1234,
});
ok('artifact has strategy/generatedAt/tolFrac', art.strategy === 'range-line-confluence' && art.generatedAt === '2024-01-31T06:15:00Z' && art.tolFrac === 0.1);
ok('both data pairs present, nodata skipped', 'eurusd' in art.instruments && 'gbpusd' in art.instruments && !('nodata' in art.instruments));
ok('each instrument carries pip + date + levels', ['eurusd', 'gbpusd'].every(p => art.instruments[p].levels.length > 0 && art.instruments[p].date));
ok('KV write wraps {data,timestamp} under range_line_confluence', written && written.key === 'range_line_confluence' && JSON.parse(written.val).timestamp === 1234);

// The bot's proximity check runs against the shipped levels.
const lv0 = art.instruments.eurusd.levels[0];
ok('confluenceBucketAt works on shipped levels', ['1·none', '2·single', '3·multi'].includes(confluenceBucketAt(lv0.price, art.instruments.eurusd.levels, 0.1 * 0.02)));

console.log('[sessionStartEpoch — DST-aware London-midnight boundary, no lookahead]');
// BST (boundaryHour 23): at 05:00Z the current (forming) session started YESTERDAY 23:00Z.
const may5 = Date.UTC(2024, 4, 8, 5, 0, 0) / 1000;
ok('BST 05:00Z → prior 23:00Z', sessionStartEpoch(23, may5) === Date.UTC(2024, 4, 7, 23, 0, 0) / 1000);
// GMT (boundaryHour 0): at 06:00Z the forming session started TODAY 00:00Z.
const jan6 = Date.UTC(2024, 0, 10, 6, 0, 0) / 1000;
ok('GMT 06:00Z → today 00:00Z', sessionStartEpoch(0, jan6) === Date.UTC(2024, 0, 10, 0, 0, 0) / 1000);
// Just after the boundary (23:30Z, BST) → the new session started today 23:00Z.
ok('BST 23:30Z → today 23:00Z', sessionStartEpoch(23, Date.UTC(2024, 4, 8, 23, 30, 0) / 1000) === Date.UTC(2024, 4, 8, 23, 0, 0) / 1000);

console.log('[packLiveM1 — packs, sorts, dedupes, drops the forming session]');
// Two complete GMT sessions (Jan 8, Jan 9) + a partial forming session (Jan 10 00:00–00:30).
// nowSec = Jan 10 06:00Z (boundaryHour 0) → forming session = Jan 10 → its bars dropped.
const day = (d, h, m) => Date.UTC(2024, 0, d, h, m, 0) / 1000;
const raw = [];
for (const d of [8, 9]) for (let m = 0; m < 120; m++) raw.push({ time: day(d, 0, 0) + m * 60, open: 1.1, high: 1.11, low: 1.09, close: 1.1, volume: 5 });
for (let m = 0; m < 30; m++) raw.push({ time: day(10, 0, 0) + m * 60, open: 2, high: 2, low: 2, close: 2, volume: 9 });  // forming
raw.push(raw[0]);                                    // duplicate to test dedupe
const shuffled = [...raw].reverse();                 // unsorted input
const packedLive = packLiveM1(shuffled, { boundaryHour: 0, nowSec: day(10, 6, 0) });
ok('drops the forming (Jan 10) session', packedLive.n === 240, `n=${packedLive.n}`);
ok('sorted ascending by time', packedLive.times.every((t, i) => i === 0 || t > packedLive.times[i - 1]));
ok('no forming-session prices leak in', !packedLive.closes.includes(2));
ok('carries volume through', packedLive.volumes.every(v => v === 5));
// End-to-end: the fresh-packed M1 flows through the SAME validated path.
const liveConf = latestSessionConfluence(packLiveM1(
  [].concat(...Array.from({ length: 25 }, (_, d) => Array.from({ length: 120 }, (_, m) =>
    ({ time: day(1, 0, 0) + d * 86400 + m * 60, open: 1.1 + d * 0.001, high: 1.1 + d * 0.001 + 0.002,
       low: 1.1 + d * 0.001 - 0.002, close: 1.1 + d * 0.001 + 0.0005, volume: 7 })))),
  { boundaryHour: 0, nowSec: day(26, 6, 0) }), { boundaryHour: 0, confLookback: 5, pip: 0.0001 });
ok('fresh-packed M1 → latestSessionConfluence yields levels', Array.isArray(liveConf.levels) && liveConf.levels.length > 0,
   `date=${liveConf.date} n=${liveConf.levels?.length}`);

console.log('[refuses to publish an empty artifact]');
let threw = false;
try {
  await refreshRangeLineConfluence({ universe: ['x'], getPacked: async () => null, kvPut: async () => { written = 'SHOULD_NOT_WRITE'; }, now: () => 'x' });
} catch { threw = true; }
ok('throws (and does not clobber KV) when nothing resolves', threw);

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
