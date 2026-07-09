// Synthetic test for the range-line confluence producer core (no network).
//   node js/rangeLineConfluenceProducer.test.mjs
import { buildConfluenceArtifact } from './rangeLineConfluenceProducer.js';
import { confluenceBucketAt } from './rangeLineAnalyser.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// 40 days of D1 + a few days of M1 (15m-ish granularity for the intraday sources).
const day0 = Date.UTC(2024, 0, 1) / 1000;
const dailyBars = [];
for (let d = 0; d < 40; d++) {
  const base = 1.10 + 0.01 * Math.sin(d / 6);
  dailyBars.push({ time: day0 + d * 86400, open: base, high: base + 0.004, low: base - 0.004, close: base + 0.001 });
}
// Prior 5 days of M1 for the volume-profile / VWAP / 15m-fib sources.
const intraday = [];
for (let d = 35; d < 40; d++) {
  for (let m = 0; m < 96; m++) {                       // 96 × 15min = 1 day
    const t = day0 + d * 86400 + m * 900;
    const px = 1.10 + 0.01 * Math.sin(d / 6) + 0.003 * Math.sin(m / 8);
    intraday.push({ time: t, open: px, high: px + 0.0006, low: px - 0.0006, close: px, volume: 100 + (m % 7) });
  }
}

console.log('[confluence producer core]');
const art = buildConfluenceArtifact(
  { EURUSD: { dailyBars, intraday, pip: 0.0001, price: 1.10 } },
  { now: () => '2024-02-10T06:15:00Z' });

ok('artifact has strategy + generatedAt + tolFrac', art.strategy === 'range-line-confluence' && art.generatedAt === '2024-02-10T06:15:00Z' && art.tolFrac === 0.1);
ok('instrument keyed lowercase', 'eurusd' in art.instruments);
const inst = art.instruments.eurusd;
ok('instrument carries pip + a levels list', inst.pip === 0.0001 && Array.isArray(inst.levels) && inst.levels.length > 0, `n=${inst.levels?.length}`);
ok('levels are {price, source} with finite prices', inst.levels.every(l => Number.isFinite(l.price) && typeof l.source === 'string'));
ok('multiple DISTINCT sources present (pivots/POC/round/…)', new Set(inst.levels.map(l => l.source)).size >= 3,
   `sources=${[...new Set(inst.levels.map(l => l.source))].join(',')}`);

// The bot's proximity check reproduces the analyser bucket against the shipped levels.
const someLevel = inst.levels[0].price;
const tol = 0.1 * 0.02;                                 // tolFrac × a plausible range
ok('confluenceBucketAt against shipped levels returns a bucket', ['1·none', '2·single', '3·multi'].includes(confluenceBucketAt(someLevel, inst.levels, tol)));
ok('a far-away price is 1·none', confluenceBucketAt(999, inst.levels, tol) === '1·none');

// Pure: same input → same output (no Date/random inside).
const art2 = buildConfluenceArtifact({ EURUSD: { dailyBars, intraday, pip: 0.0001, price: 1.10 } }, { now: () => '2024-02-10T06:15:00Z' });
ok('pure — identical artifact for identical input', JSON.stringify(art) === JSON.stringify(art2));

// A missing/empty instrument is skipped gracefully, not fatal.
const art3 = buildConfluenceArtifact({ EURUSD: { dailyBars, intraday, pip: 0.0001 }, GBPUSD: {} }, { now: () => 'x' });
ok('empty instrument still produces an entry (0 levels), no throw', 'gbpusd' in art3.instruments && Array.isArray(art3.instruments.gbpusd.levels));

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
