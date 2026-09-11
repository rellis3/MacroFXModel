// Synthetic tests for js/positionBookMetrics.js. No network.
//   node js/positionBookMetrics.test.mjs
import { summarisePositionBook, legacyBucketCount } from './positionBookMetrics.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const B = (price, l, s) => ({ price: String(price), longCountPercent: String(l), shortCountPercent: String(s) });

console.log('[THE BUG: bucket-counting reads every book as 100% long]');
{
  // Gold at 4353. Near spot the book is genuinely 60/40 long. But the price range
  // ever traded is enormous, and 300 buckets from 1200 to 3900 hold abandoned longs
  // opened years ago (0.05% each -- tiny individually, but there are 300 of them and
  // every one is long-dominated).
  const buckets = [];
  for (let p = 1200; p < 3900; p += 9) buckets.push(B(p, 0.05, 0.0));
  buckets.push(B(4300, 6, 4), B(4320, 6, 4), B(4340, 6, 4), B(4360, 6, 4), B(4380, 6, 4), B(4400, 6, 4));
  const pb = { price: '4353', bucketWidth: '1', buckets };
  const legacy = legacyBucketCount(pb);
  const r = summarisePositionBook(pb);
  ok('the legacy metric says 100% long', legacy >= 98, `${legacy}%`);
  ok('the near-spot crowding says 60% long', r.longPct === 60, `${r.longPct}%`);
  ok('sentiment is "crowded long", not "bullish" on a coin flip', r.sentiment === 'crowded long', r.sentiment);
  ok('and the pollution is REPORTED, not hidden', r.staleShare > 15, `staleShare ${r.staleShare}%`);
  ok('whole-book long share is higher than near-spot -- that gap IS the pollution', r.all.longPct > r.longPct, `${r.all.longPct} vs ${r.longPct}`);
}

console.log('[crowding is measured by position share, not bucket count]');
{
  // Two long buckets and eight short buckets, but the shorts are tiny. By head count
  // this book is 80% long; by bucket count it is 20% long.
  const pb = { price: '1.10', buckets: [
    B(1.099, 40, 0), B(1.101, 40, 0),
    B(1.095, 0, 2.5), B(1.096, 0, 2.5), B(1.097, 0, 2.5), B(1.098, 0, 2.5),
    B(1.102, 0, 2.5), B(1.103, 0, 2.5), B(1.104, 0, 2.5), B(1.105, 0, 2.5),
  ] };
  ok('share-based: 80% long', summarisePositionBook(pb).longPct === 80);
  ok('bucket-count would have said 20%', legacyBucketCount(pb) === 20, `${legacyBucketCount(pb)}%`);
}

console.log('[pain and overhead]');
{
  // Spot 1.10. Longs: half entered at 1.12 (underwater), half at 1.08 (in profit).
  // Shorts: all entered at 1.09 (underwater -- price is above their entry).
  const pb = { price: '1.10', buckets: [B(1.12, 25, 0), B(1.08, 25, 0), B(1.09, 0, 50)] };
  const r = summarisePositionBook(pb);
  ok('50% of longs underwater', r.pain.longsUnderwaterPct === 50, r.pain.longsUnderwaterPct);
  ok('100% of shorts underwater', r.pain.shortsUnderwaterPct === 100, r.pain.shortsUnderwaterPct);
  ok('overhead = longs above spot, same figure named for its effect on price', r.overhead.longsAboveSpotPct === 50);
  ok('balanced 50/50 near spot reads "balanced"', r.sentiment === 'balanced');
}

console.log('[edge cases return null or say what they did — never a fake neutral]');
{
  ok('empty buckets -> null', summarisePositionBook({ price: '1.1', buckets: [] }) === null);
  ok('no spot -> null', summarisePositionBook({ buckets: [B(1, 1, 1)] }) === null);
  ok('null input -> null', summarisePositionBook(null) === null);
  // Everything is far from spot: the window is empty. Fall back to the whole book
  // but SAY the window was not used.
  const far = { price: '100', buckets: [B(50, 70, 30)] };
  const r = summarisePositionBook(far);
  ok('empty window falls back to the whole book', r.longPct === 70);
  ok('and flags that the window was not used', r.usedWindow === false);
  ok('and reports 100% stale', r.staleShare === 100);
  ok('caveats travel with the payload', /retail/.test(r.caveats) && /CONTEXT/.test(r.caveats));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll positionBookMetrics tests passed.');
