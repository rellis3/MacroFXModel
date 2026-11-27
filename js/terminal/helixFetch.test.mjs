import test from 'node:test'; import assert from 'node:assert/strict';
import { createHelixFetch, ttlFor, asOfOf, staleOf, DEFAULT_TTL } from './helixFetch.js';

const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) });
function fake(map) {
  const calls = [];
  const f = async (u, o) => { calls.push({ u, o }); const v = typeof map === 'function' ? map(u, o) : map[u]; return v instanceof Promise || typeof v?.json === "function" ? v : reply(v ?? { ok: true, u }); };
  return { f, calls };
}

test('a 4xx/5xx body is an error, never data; the error keeps the body text and status', async () => {
  const { f } = fake(u => reply({ ok: false, error: 'cap reached' }, 503));
  const h = createHelixFetch(f);
  await assert.rejects(h.jf('/api/x'), e => e.status === 503 && e.message === 'cap reached');
  const r = await h.load('/api/x'); assert.equal(r.data, null); assert.equal(r.stale, true); assert.equal(r.error, 'cap reached');
});
test('non-JSON 200 rejects', async () => {
  const h = createHelixFetch(async () => ({ ok: true, status: 200, json: async () => { throw new Error('Unexpected token <'); } }));
  await assert.rejects(h.jf('/api/x'), /not JSON/);
});
test('a hung route times out instead of stalling the caller', async () => {
  const f = (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }));
  const h = createHelixFetch(f, { timeoutMs: 30 });
  const t0 = Date.now(); await assert.rejects(h.jf('/api/slow'), e => e.timeout === true && /timed out/.test(e.message)); assert.ok(Date.now() - t0 < 1000);
});
test('in-flight requests for the same URL share one fetch; the cache serves until the route TTL', async () => {
  let t = 1_000_000; const { f, calls } = fake({ '/api/oi-store': { data: { a: 1 } } });
  const h = createHelixFetch(f, { now: () => t });
  const [a, b, c] = await Promise.all([h.jf('/api/oi-store'), h.jf('/api/oi-store'), h.jf('/api/oi-store')]);
  assert.equal(calls.length, 1); assert.equal(a, b); assert.equal(b, c);
  t += 5 * 60_000; await h.jf('/api/oi-store'); assert.equal(calls.length, 1, 'oi-store is cached 10 min');
  t += 6 * 60_000; await h.jf('/api/oi-store'); assert.equal(calls.length, 2);
  await h.jf('/api/oi-store', { cache: 'no-store' }); assert.equal(calls.length, 3);
});
test('POSTs are never cached or deduped', async () => {
  const { f, calls } = fake({});
  const h = createHelixFetch(f);
  await Promise.all([h.jf('/api/desk-ask', { method: 'POST', body: '{}' }), h.jf('/api/desk-ask', { method: 'POST', body: '{}' })]);
  assert.equal(calls.length, 2); assert.equal(h.size(), 0);
});
test('the cache is bounded (LRU)', async () => {
  const { f } = fake({}); const h = createHelixFetch(f, { maxEntries: 5 });
  for (let i = 0; i < 12; i++) await h.jf(`/api/x?i=${i}`);
  assert.equal(h.size(), 5);
});
test('a failed refresh keeps the last good copy, marked stale', async () => {
  let t = 0, fail = false; const h = createHelixFetch(async () => (fail ? reply({ error: 'down' }, 500) : reply({ ok: true, fetched_at: new Date(t).toISOString() })), { now: () => t });
  const a = await h.load('/api/vol-forecast/live'); assert.equal(a.stale, false); assert.equal(a.asOf, 0);
  fail = true; t += 60_000; const b = await h.load('/api/vol-forecast/live'); assert.equal(b.stale, true); assert.equal(b.error, 'down'); assert.deepEqual(b.data, a.data);
});
test('prime fills an empty slot only', async () => {
  const { f, calls } = fake({}); const h = createHelixFetch(f);
  h.prime('/api/wider-market', { ok: true, to: '2026-11-27' }); assert.deepEqual(await h.jf('/api/wider-market'), { ok: true, to: '2026-11-27' }); assert.equal(calls.length, 0);
  h.prime('/api/wider-market', { other: 1 }); assert.equal((await h.jf('/api/wider-market')).to, '2026-11-27');
});
test('ttl table, as-of and stale rules', () => {
  assert.equal(ttlFor('/api/vol-forecast/live?x=1'), 30_000); assert.equal(ttlFor('/api/oi-store'), 600_000); assert.equal(ttlFor('/api/whatever'), DEFAULT_TTL);
  assert.equal(asOfOf({ fetched_at: '2026-11-27T07:00:00Z' }), Date.parse('2026-11-27T07:00:00Z'));
  assert.equal(asOfOf({ to: '2026-11-26' }), Date.parse('2026-11-26T00:00:00Z'));
  assert.equal(asOfOf({ at: 1_790_000_000 }), 1_790_000_000_000);
  assert.equal(asOfOf([1, 2]), null); assert.equal(asOfOf(null), null);
  const now = Date.parse('2026-11-27T12:00:00Z');
  assert.equal(staleOf({ fallback: true }, '/api/vol-forecast/live', now), true);
  assert.equal(staleOf({ fetched_at: '2026-11-27T11:00:00Z' }, '/api/vol-forecast/live', now), false);
  assert.equal(staleOf({ fetched_at: '2026-11-25T11:00:00Z' }, '/api/vol-forecast/live', now), true);
  assert.equal(staleOf({ to: '2026-11-24' }, '/api/drill-series', now), false, 'daily bundles get four days');
});
