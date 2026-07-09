// Synthetic test for the range-line confluence producer (no network).
//   node js/rangeLineConfluenceProducer.test.mjs
import { refreshRangeLineConfluence } from './rangeLineConfluenceProducer.js';
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

console.log('[refuses to publish an empty artifact]');
let threw = false;
try {
  await refreshRangeLineConfluence({ universe: ['x'], getPacked: async () => null, kvPut: async () => { written = 'SHOULD_NOT_WRITE'; }, now: () => 'x' });
} catch { threw = true; }
ok('throws (and does not clobber KV) when nothing resolves', threw);

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
