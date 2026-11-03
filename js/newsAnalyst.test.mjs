// Tests for js/newsAnalyst.js.   node js/newsAnalyst.test.mjs
import assert from 'node:assert/strict';
import { parseFeed, fromFinnhub, tagHeadline, mergeWire, validateRead, pick, wireText } from './newsAnalyst.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
t('RSS and Atom, entities decoded', () => {
  const rss = '<rss><channel><item><title><![CDATA[Super Micro&#x2019;s stock &amp; AI]]></title><link>https://a</link><pubDate>Tue, 03 Nov 2026 21:13:00 GMT</pubDate></item></channel></rss>';
  const atom = '<feed><entry><title>Monetary policy decisions</title><link href="https://b"/><updated>2026-10-29T13:15:00Z</updated></entry></feed>';
  const a = parseFeed(rss, 'MW')[0], b = parseFeed(atom, 'ECB')[0];
  assert.equal(a.title, 'Super Micro’s stock & AI'); assert.equal(a.ms, Date.parse('2026-11-03T21:13:00Z')); assert.equal(b.link, 'https://b');
  assert.equal(fromFinnhub([{ headline: 'Dollar slips', datetime: 1793750000, url: 'u', source: 'Reuters' }])[0].source, 'Finnhub/Reuters');
});
t('tags: touches, topic and tier', () => {
  assert.deepEqual(tagHeadline({ title: 'Oil Edges Lower As U.S. Bombs Iran Before Election Day', source: 'Yahoo' }), { touches: ['USD', 'OIL'], topic: 'geopolitics', tier: 1 });
  assert.equal(tagHeadline({ title: 'Federal Reserve issues FOMC statement', source: 'Fed' }).tier, 1);
  const sup = tagHeadline({ title: 'Federal Reserve Board announces approval of application by a bank', source: 'Fed' });
  assert.equal(sup.tier, 2); assert.ok(sup.touches.includes('USD'));
  assert.equal(tagHeadline({ title: 'Minutes of the Court of Directors', source: 'BoE' }).tier, 2);
  assert.equal(tagHeadline({ title: '3 Dirt Cheap Dividend Stocks to Buy', source: 'Yahoo' }).tier, 3);
  assert.equal(tagHeadline({ title: 'Sterling today: Pound edges up as dollar eases, BoE hike in view', source: 'Investing.com' }).topic, 'central bank');
});
t('merge: near-duplicates across feeds dropped, old ones aged out, newest first', () => {
  const now = Date.parse('2026-11-03T22:00:00Z');
  const { wire, added } = mergeWire([{ id: 'old', title: 'Old story', ms: now - 100 * 3600e3, touches: [], tier: 3 }],
    [{ title: 'Dollar slips ahead of US midterm elections', ms: now - 3600e3, source: 'A' }, { title: 'Dollar slips ahead of the US midterm elections, euro gains', ms: now - 3000e3, source: 'B' }, { title: 'Gold rises', ms: now - 60e3, source: 'C' }], { now });
  assert.equal(wire.length, 2); assert.equal(wire[0].title, 'Gold rises'); assert.equal(added.length, 2);
});
t('model read: indices back to ids, impacts signed, tiers kept in range', () => {
  const batch = [{ id: 'a', tier: 2 }, { id: 'b', tier: 1 }];
  const v = validateRead({ items: [{ i: 0, tier: 1, impact: { USD: -0.5, XYZ: 1, GOLD: 2 }, why: 'w' }, { i: 7 }] }, batch);
  assert.deepEqual(v.value.a, { tier: 1, impact: { USD: -1, GOLD: 1 }, why: 'w', book: null });
  assert.equal(validateRead({ items: [] }, batch).ok, false);
});
t('pick and text', () => {
  const wire = [{ title: 'A', ms: 10, tier: 1, touches: ['USD'], source: 'S' }, { title: 'B', ms: 9, tier: 3, touches: ['EUR'], source: 'S', read: { tier: 2, impact: { EUR: 1 }, why: 'y' } }, { title: 'C', ms: 1, tier: 1, touches: [], source: 'S' }];
  assert.deepEqual(pick(wire, { sinceMs: 5 }).map(h => h.title), ['A', 'B']);
  assert.deepEqual(pick(wire, { ccy: 'EUR' }).map(h => h.title), ['B']);
  assert.match(wireText([wire[1]]), /B — y \(EUR\+\)/);
});
console.log(`newsAnalyst: ${n} tests passed`);
