// Tests for js/deskSnapshotStore.js with in-memory fakes for KV, R2 and the loopback fetch. Run: node js/deskSnapshotStore.test.mjs
import assert from 'node:assert/strict';
import { createDataArchive } from './dataArchive.js';
import { createSnapshotService, packJSON, unpackJSON, CORE_TTL_S, FULL_TTL_S } from './deskSnapshotStore.js';
import { CORE_FEEDS, FULL_FEEDS, chunkKey, fullKey } from './deskSnapshot.js';
import { FIXTURES } from './deskSnapshot.fixtures.mjs';

let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const quiet = { log() {}, warn() {}, error() {} };
const iso = s => Date.parse(s);
const BY_PATH = Object.fromEntries(CORE_FEEDS.map(f => [f.path, FIXTURES[f.id]]));

function rig({ start = '2026-11-16T10:00:00Z', fail = new Set(), badRead = false, silentPut = false, r2 = true, fullJson = { ok: true, x: 1 } } = {}) {
  const h = { now: iso(start), kv: new Map(), ttl: new Map(), puts: 0, r2: new Map(), calls: [], fail, badRead, silentPut };
  const archive = createDataArchive({ putJSON: async (k, v) => { h.r2.set(k, JSON.parse(JSON.stringify(v))); return true; }, getJSON: async k => h.r2.get(k) ?? null,
    listKeys: async p => [...h.r2.keys()].filter(k => k.startsWith(p)), configured: () => r2, log: quiet, now: () => h.now });
  const svc = createSnapshotService({
    kvGet: async k => h.kv.get(k) ?? null,
    kvGetStrict: async k => { if (h.badRead) throw new Error('CF KV GET: 500'); return h.kv.get(k) ?? null; },
    kvPut: async (k, v, o) => { h.puts++; if (!h.silentPut) { h.kv.set(k, v); h.ttl.set(k, o?.expirationTtl); } },
    kvKeys: async p => [...h.kv.keys()].filter(k => k.startsWith(p)),
    archive, r2Get: async k => h.r2.get(k) ?? null,
    fetchFeed: async (path) => { h.calls.push(path); if (h.fail.has(path) || h.fail.has('*')) return { timedOut: true, error: 'timeout', ms: 1 }; const j = BY_PATH[path] ?? (FULL_FEEDS.includes(path) ? fullJson : null); return j ? { json: JSON.parse(JSON.stringify(j)), httpStatus: 200, ms: 3 } : { json: null, httpStatus: 404, ms: 1 }; },
    deskRunDate: () => '2026-11-16', now: () => h.now, log: quiet });
  return { h, svc, archive };
}
const advance = (h, ms) => { h.now += ms; };

await t('a capture records one point with a section per feed, stamped with each feed\'s own asOf', async () => {
  const { svc, h } = rig();
  const r = await svc.captureCore();
  assert.equal(r.ok, true); assert.equal(r.point.ts, h.now); assert.equal(r.gaps.length, 0);
  assert.equal(Object.keys(r.point.d).length, CORE_FEEDS.length);
  assert.equal(r.point.inputs.desk.asOf, '2026-11-13T06:57:38.645Z');
  assert.ok(r.bytes < 40_000, `${r.bytes} bytes`);
  assert.equal(svc.status().captures, 1);
});
await t('slow feeds are not refetched inside their interval; they are carried, with the original asOf', async () => {
  const { svc, h } = rig();
  await svc.captureCore(); h.calls.length = 0; advance(h, 5 * 60_000);
  const r = await svc.captureCore();
  assert.ok(!h.calls.includes('desk-run') && !h.calls.includes('cb-board'), `refetched: ${h.calls.join()}`);
  assert.ok(h.calls.includes('world-stress') && h.calls.includes('ccy-strength'), 'live feeds are fetched every capture');
  assert.equal(r.point.inputs.desk.src, 'carried'); assert.equal(r.point.inputs.stress.src, 'live');
  assert.equal(r.point.inputs.desk.asOf, '2026-11-13T06:57:38.645Z');
  advance(h, 26 * 60_000); h.calls.length = 0; await svc.captureCore();
  assert.ok(h.calls.includes('desk-run'), 'due again after 30 minutes');
});
await t('a failing feed is a gap, the point is still recorded, and the older section is carried visibly', async () => {
  const { svc, h } = rig(); await svc.captureCore(); advance(h, 31 * 60_000);
  h.fail.add('world-stress'); h.fail.add('desk-run');
  const r = await svc.captureCore();
  assert.equal(r.ok, true, '2 of 20 failing is still a good capture');
  assert.ok(r.point.gaps.some(g => g.id === 'stress' && g.carried) && r.point.gaps.some(g => g.id === 'desk' && g.why === 'timeout'));
  assert.equal(r.point.inputs.stress.src, 'carried'); assert.equal(r.point.d.stress.overall, 'watch');
});
await t('a feed that has never answered leaves a hole, not an invented value', async () => {
  const { svc } = rig({ fail: new Set(['fed-path']) });
  const r = await svc.captureCore();
  assert.ok(!('fed' in r.point.d)); assert.deepEqual(r.gaps.find(g => g.id === 'fed'), { id: 'fed', why: 'timeout' });
});
await t('everything failing still records a point (the hole is the record) and counts as a failed capture', async () => {
  const { svc } = rig({ fail: new Set(['*']) });
  const r = await svc.captureCore();
  assert.equal(r.ok, false); assert.equal(r.point.gaps.length, CORE_FEEDS.length); assert.equal(Object.keys(r.point.d).length, 0);
  const s = svc.status(); assert.equal(s.consecutiveFailures, 1); assert.match(s.lastError, /only 0 of 20/); assert.equal(s.lastCaptureOkAt, null);
  assert.equal(s.pendingPoints, 1);
});
await t('concurrent captures are one capture (single-flight)', async () => {
  const { svc, h } = rig(); const [a, b] = await Promise.all([svc.captureCore(), svc.captureCore()]);
  assert.equal(a, b); assert.equal(svc.status().captures, 1); assert.equal(h.calls.filter(c => c === 'world-stress').length, 1);
});

await t('flush packs one chunk per UTC hour with the 16-day expiration, and the chunk reads back', async () => {
  const { svc, h } = rig();
  for (let i = 0; i < 3; i++) { await svc.captureCore(); advance(h, 5 * 60_000); }
  assert.equal(h.puts, 0, 'nothing is written per point');
  const r = await svc.flush();
  assert.equal(r.wrote, 1); assert.equal(h.puts, 1); assert.equal(r.error, null);
  const key = chunkKey(iso('2026-11-16T10:00:00Z'));
  assert.equal(h.ttl.get(key), CORE_TTL_S); assert.equal(CORE_TTL_S, 16 * 86400);
  const chunk = unpackJSON(h.kv.get(key)); assert.equal(chunk.points.length, 3); assert.equal(chunk.hour, '2026-11-16T10');
  assert.equal(svc.status().pendingPoints, 0); assert.ok(svc.status().lastFlushOkAt);
});
await t('a restart merges into what is stored; it never replaces an hour with a fraction of it', async () => {
  const a = rig(); for (let i = 0; i < 3; i++) { await a.svc.captureCore(); advance(a.h, 5 * 60_000); } await a.svc.flush();
  const b = rig(); b.h.kv = a.h.kv; b.h.now = a.h.now;                 // a new process, same KV, a fresh in-memory buffer
  await b.svc.captureCore(); await b.svc.flush();
  assert.equal(unpackJSON(b.h.kv.get('desk_snap_core_2026-11-16T10')).points.length, 4);
});
await t('an unreadable KV is never overwritten blind: the points wait in memory and merge when it comes back', async () => {
  const { svc, h } = rig({ badRead: true });
  await svc.captureCore(); advance(h, 5 * 60_000); await svc.captureCore();
  const r = await svc.flush();
  assert.equal(r.wrote, 0); assert.equal(h.puts, 0); assert.match(r.error, /CF KV GET/); assert.equal(svc.status().pendingPoints, 2);
  h.badRead = false; h.kv.set('desk_snap_core_2026-11-16T10', packJSON({ v: 1, points: [{ ts: iso('2026-11-16T09:59:00Z') - 3_600_000 + 3_600_000, ld: 'x', inputs: {}, gaps: [], d: {} }] }));
  const r2 = await svc.flush();
  assert.equal(r2.wrote, 1); assert.equal(unpackJSON(h.kv.get('desk_snap_core_2026-11-16T10')).points.length, 3, 'the stored point and both new ones');
});
await t('a write that does not read back is reported, not trusted (kv.put falls to a local file when Cloudflare fails)', async () => {
  const { svc } = rig({ silentPut: true });
  await svc.captureCore(); const r = await svc.flush();
  assert.equal(r.wrote, 0); assert.match(r.error, /did not read back/); assert.equal(svc.status().pendingPoints, 1); assert.match(svc.status().flushError, /did not read back/);
});
await t('a runaway chunk is thinned and logged, not written at any size', async () => {
  const { svc, h } = rig();
  await svc.captureCore();
  const b = svc._buf.get(chunkKey(h.now)); b.points = Array.from({ length: 2000 }, (_, i) => ({ ts: h.now + i, ld: 'x', inputs: {}, gaps: [], d: { junk: Array.from({ length: 200 }, (_, k) => Math.random() * k) } })); b.dirty = true; b.loaded = true;
  const r = await svc.flush(); assert.equal(r.wrote, 1);
  const chunk = unpackJSON(h.kv.get(chunkKey(h.now))); assert.equal(chunk.thinned, true); assert.ok(chunk.points.length < 2000);
});

await t('reading: points come back between from and to, filtered to the fields asked for, and the in-memory hour is included before it is flushed', async () => {
  const { svc, h } = rig();
  for (let i = 0; i < 6; i++) { await svc.captureCore(); advance(h, 5 * 60_000); }
  const r = await svc.readCore({ from: iso('2026-11-16T10:00:00Z'), to: iso('2026-11-16T10:20:00Z'), fields: ['desk', 'strength'] });
  assert.equal(r.ok, true); assert.equal(r.n, 5); assert.deepEqual(Object.keys(r.points[0].d).sort(), ['desk', 'strength']); assert.match(r.sources['2026-11-16'], /memory/);
  assert.equal((await svc.readCore({ from: 5, to: 5 })).ok, false);
  assert.equal((await svc.readCore({ from: 1, to: 40 * 86400_000 })).ok, false);
});
await t('reading thins to the step asked for, and to the byte cap', async () => {
  const { svc, h } = rig();
  for (let i = 0; i < 12; i++) { await svc.captureCore(); advance(h, 5 * 60_000); }
  const w = { from: iso('2026-11-16T10:00:00Z'), to: iso('2026-11-16T11:00:00Z') };
  assert.equal((await svc.readCore({ ...w })).n, 12);
  assert.equal((await svc.readCore({ ...w, stepMin: 30 })).n, 2);
  const small = await svc.readCore({ ...w, maxBytes: 9_000 });
  assert.equal(small.widened, true); assert.ok(small.n < 12 && small.n >= 1); assert.match(small.note, /thinned/);
});

await t('retention roll: a finished day is copied to R2 once; KV can then forget it and the day still reads', async () => {
  const { svc, h } = rig({ start: '2026-11-16T22:00:00Z' });
  for (let i = 0; i < 4; i++) { await svc.captureCore(); advance(h, 5 * 60_000); }          // 22:00-22:15 on the 16th
  advance(h, 2 * 3600_000);                                                               // 00:35 on the 17th
  const r = await svc.rollArchive();
  assert.deepEqual(r.archived, ['2026-11-16']); assert.ok(h.r2.has('archive/desk_core/2026/2026-11-16.json'));
  const day = h.r2.get('archive/desk_core/2026/2026-11-16.json');
  assert.equal(day.payload.n, 4); assert.equal(day.payload.points.length, 4);
  const puts = h.r2.size; const again = await svc.rollArchive();
  assert.deepEqual(again.archived, []); assert.equal(h.r2.size, puts, 'idempotent: a second roll writes nothing');
  for (const k of [...h.kv.keys()]) if (k.startsWith('desk_snap_core_')) h.kv.delete(k);        // KV forgets (the 16-day expiry)
  const fresh = createSnapshotService({ kvGet: async () => null, kvGetStrict: async () => null, kvPut: async () => {}, kvKeys: async () => [], archive: null, r2Get: async k => h.r2.get(k) ?? null, fetchFeed: async () => ({ json: null }), now: () => h.now, log: quiet });
  const back = await fresh.readCore({ from: iso('2026-11-16T22:00:00Z'), to: iso('2026-11-16T23:59:00Z') });
  assert.equal(back.n, 4); assert.equal(back.sources['2026-11-16'], 'r2');
});
await t('with R2 off the roll says so, and nothing breaks', async () => {
  const { svc } = rig({ r2: false }); const r = await svc.rollArchive();
  assert.match(r.skipped, /R2 not configured/); assert.equal(svc.status().archiveEnabled, false);
});

await t('FULL: due once a London day from 10:00; written to KV with its 20-day expiration and archived to R2; read back from KV and then from R2', async () => {
  const { svc, h } = rig({ start: '2026-11-16T08:00:00Z' });
  h.calls.length = 0; await svc.tick({ boot: true });
  assert.ok(![...h.kv.keys()].some(k => k.startsWith('desk_snap_full_')), 'not before 10:00 London');
  advance(h, 2 * 3600_000 + 60_000);                                                      // 10:01 London (UTC+0 in November)
  await svc.tick();
  const key = fullKey('2026-11-16'); assert.ok(h.kv.has(key)); assert.equal(h.ttl.get(key), FULL_TTL_S);
  const s = svc.status(); assert.equal(s.lastFullLd, '2026-11-16'); assert.equal(s.fullError, null);
  assert.equal(unpackJSON(h.kv.get(key)).deskRunDate, '2026-11-16');
  assert.ok(h.r2.has('archive/desk_full/2026/2026-11-16.json'));
  const calls = h.calls.length; advance(h, 5 * 60_000); await svc.tick();
  assert.equal(h.calls.filter(c => c === 'rates-board').length, 1, 'FULL is not taken twice in a day');
  const one = await svc.readFull('2026-11-16', ['risk-flags']);
  assert.equal(one.ok, true); assert.equal(one.source, 'kv'); assert.deepEqual(Object.keys(one.snapshot.feeds), ['risk-flags']);
  h.kv.delete(key);
  const old = await svc.readFull('2026-11-16'); assert.equal(old.source, 'r2'); assert.equal(old.snapshot.n, FULL_FEEDS.length);
  assert.equal((await svc.readFull('2026-11-01')).ok, false); assert.equal((await svc.readFull('nope')).ok, false);
  assert.ok(calls > 0);
});
await t('FULL after a restart asks KV first, so a redeploy does not take it twice', async () => {
  const a = rig({ start: '2026-11-16T11:00:00Z' }); await a.svc.tick({ boot: true }); assert.ok(a.h.kv.has(fullKey('2026-11-16')));
  const b = rig({ start: '2026-11-16T11:30:00Z' }); b.h.kv = a.h.kv; b.h.calls.length = 0;
  await b.svc.tick({ boot: true });
  assert.ok(!b.h.calls.includes('rates-board'), 'today\'s FULL already exists');
});
await t('a FULL with failing feeds is still written, with the gaps listed', async () => {
  const { svc, h } = rig({ start: '2026-11-16T11:00:00Z', fail: new Set(['gpr', 'xccy-basis']) });
  const r = await svc.captureFull();
  assert.equal(r.ok, true); assert.deepEqual(r.gaps.map(g => g.path).sort(), ['gpr', 'xccy-basis']); assert.equal(svc.status().lastFullGaps.length, 2);
  assert.ok(h.kv.has(fullKey('2026-11-16')));
});

await t('the tick keeps the cadence: 5 minutes while the FX week is open, 30 otherwise, and a boot tick always captures', async () => {
  const open = rig({ start: '2026-11-16T10:00:00Z' });
  await open.svc.tick(); await open.svc.tick(); assert.equal(open.svc.status().captures, 1, 'too soon');
  advance(open.h, 5 * 60_000); await open.svc.tick(); assert.equal(open.svc.status().captures, 2);
  const closed = rig({ start: '2026-11-14T10:00:00Z' });                                  // a Saturday
  await closed.svc.tick(); advance(closed.h, 10 * 60_000); await closed.svc.tick(); assert.equal(closed.svc.status().captures, 1, '10 minutes is too soon on a Saturday');
  advance(closed.h, 20 * 60_000); await closed.svc.tick(); assert.equal(closed.svc.status().captures, 2);
  await closed.svc.tick({ boot: true }); assert.equal(closed.svc.status().captures, 3);
});
await t('the tick flushes about every 20 minutes, and always when the hour has turned', async () => {
  const { svc, h } = rig({ start: '2026-11-16T10:01:00Z' });
  await svc.tick({ boot: true }); assert.equal(h.puts >= 1, true, 'the first flush follows the first capture');
  const p0 = h.puts; advance(h, 5 * 60_000); await svc.tick(); assert.equal(h.puts, p0, 'not again at 5 minutes');
  advance(h, 16 * 60_000); await svc.tick(); assert.ok(h.puts > p0, 'after 20 minutes');
  const p1 = h.puts; advance(h, 40 * 60_000); await svc.tick(); assert.ok(h.puts > p1, 'the previous hour is written when the hour turns');
  assert.ok(h.kv.has('desk_snap_core_2026-11-16T10') && h.kv.has('desk_snap_core_2026-11-16T11'));
});
await t('the index lists what exists', async () => {
  const { svc, h } = rig({ start: '2026-11-16T11:00:00Z' }); await svc.captureCore(); await svc.flush(); await svc.captureFull();
  const ix = await svc.index(); assert.deepEqual(ix.coreDays, ['2026-11-16']); assert.deepEqual(ix.fullDays, ['2026-11-16']);
  assert.ok(h.kv.size >= 2);
});
console.log(`deskSnapshotStore: ${n} tests passed`);
