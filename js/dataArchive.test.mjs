/**
 * dataArchive — in-memory fake R2, no network.
 * Run: node --test js/dataArchive.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergePoints, createDataArchive, ICE_SPREAD_IDS } from './dataArchive.js';

function fakeR2() {
  const store = new Map(); let puts = 0;
  return {
    store, get puts() { return puts; },
    putJSON: async (k, o) => { puts++; store.set(k, JSON.parse(JSON.stringify(o))); return true; },
    getJSON: async k => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
    listKeys: async p => [...store.keys()].filter(k => k.startsWith(p)),
  };
}

test('mergePoints only adds; a revision keeps the first value seen', () => {
  const a = mergePoints([], [{ date: '2026-10-01', value: 3 }, { date: '2026-10-02', value: 4 }, { date: 'bad', value: 1 }, { date: '2026-10-03', value: NaN }]);
  assert.deepEqual(a.points, [['2026-10-01', 3], ['2026-10-02', 4]]);
  // a later pull that has LOST the old window still cannot remove stored points
  const b = mergePoints(a.points, [{ date: '2026-10-02', value: 4.5 }, { date: '2026-10-03', value: 5 }]);
  assert.deepEqual(b.points, [['2026-10-01', 3], ['2026-10-02', 4.5, 4], ['2026-10-03', 5]]);
  assert.equal(b.added, 1); assert.equal(b.revised, 1);
  const c = mergePoints(b.points, [{ date: '2026-10-02', value: 4 }]);   // revised back to the first print
  assert.deepEqual(c.points[1], ['2026-10-02', 4]);
});

test('mergeSeries keeps history the source has dropped (rolling 3-year window)', async () => {
  const r2 = fakeR2(); let t = 0;
  const ar = createDataArchive({ ...r2, now: () => t, minIntervalMs: 1000 });
  await ar.mergeSeries('fred', 'BAMLH0A0HYM2', [{ date: '2023-10-17', value: 4.5 }, { date: '2023-10-18', value: 4.6 }]);
  t = 5000;
  const r = await ar.mergeSeries('fred', 'BAMLH0A0HYM2', [{ date: '2023-10-18', value: 4.6 }, { date: '2026-10-30', value: 3.1 }]);
  assert.equal(r.wrote, true); assert.equal(r.added, 1);
  const doc = r2.store.get('archive/series/fred/BAMLH0A0HYM2.json');
  assert.deepEqual(doc.points.map(p => p[0]), ['2023-10-17', '2023-10-18', '2026-10-30']);
  assert.equal(doc.first, '2023-10-17');
  assert.equal((await ar.mergeSeries('fred', 'BAMLH0A0HYM2', [{ date: '2026-10-30', value: 3.1 }])).reason, 'throttled');
  t = 10_000;
  assert.equal((await ar.mergeSeries('fred', 'BAMLH0A0HYM2', [{ date: '2026-10-30', value: 3.1 }])).reason, 'unchanged');
});

test('snapshot writes one object per day and skips an identical rewrite', async () => {
  const r2 = fakeR2(); const ar = createDataArchive(r2);
  assert.equal((await ar.snapshot('oi_raw', '2026-10-30', { EURUSD: { rawOI: [1, 2] } })).wrote, true);
  assert.equal((await ar.snapshot('oi_raw', '2026-10-30', { EURUSD: { rawOI: [1, 2] } })).reason, 'unchanged');
  assert.equal((await ar.snapshot('oi_raw', '2026-10-30', { EURUSD: { rawOI: [1, 3] } })).wrote, true);
  assert.ok(r2.store.has('archive/oi_raw/2026/2026-10-30.json'));
  assert.equal(r2.puts, 2);
});

test('backfill copies only the days R2 does not have, and is idempotent', async () => {
  const r2 = fakeR2(); const ar = createDataArchive(r2);
  await ar.snapshot('oi_raw', '2026-08-01', { a: 1 });
  const kv = { '2026-07-31': { a: 0 }, '2026-08-01': { a: 1 }, '2026-08-02': { a: 2 } };
  const done = await ar.backfill('oi_raw', Object.keys(kv), async d => kv[d]);
  assert.deepEqual(done, ['2026-07-31', '2026-08-02']);
  assert.deepEqual(await ar.backfill('oi_raw', Object.keys(kv), async d => kv[d]), []);
});

test('without R2 credentials everything is a quiet no-op; failures never throw', async () => {
  const off = createDataArchive({});
  assert.equal(off.enabled, false);
  assert.equal((await off.snapshot('x', '2026-10-30', {})).wrote, false);
  assert.deepEqual(await off.backfill('x', ['2026-10-30'], async () => ({})), []);
  const broken = createDataArchive({ putJSON: async () => { throw new Error('R2 down'); }, getJSON: async () => null, log: { warn() {} } });
  assert.equal((await broken.snapshot('x', '2026-10-30', { a: 1 })).error, 'R2 down');
  assert.equal((await broken.mergeSeries('fred', 'X', [{ date: '2026-10-30', value: 1 }])).error, 'R2 down');
});

test('ICE ids are the BofA spread series', () => {
  assert.ok(ICE_SPREAD_IDS.every(id => /^BAML/.test(id)));
  assert.ok(ICE_SPREAD_IDS.includes('BAMLH0A0HYM2') && ICE_SPREAD_IDS.includes('BAMLH0A3HYC'));
});

test('configured() false means disabled even with adapter functions present', async () => {
  const r2 = fakeR2();
  const ar = createDataArchive({ ...r2, configured: () => false });
  assert.equal(ar.enabled, false);
  assert.equal((await ar.snapshot('x', '2026-10-30', { a: 1 })).reason, 'no R2');
  assert.equal(r2.puts, 0);
});
