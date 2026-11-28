import test from 'node:test'; import assert from 'node:assert/strict';
import { mountHelixMemory, londonClock, lru, SUMMARY_KEY } from './helixMemoryRoutes.js';

function fakeApp() { const routes = {}; const reg = m => (path, ...h) => { routes[`${m} ${path}`] = h; }; return { routes, get: reg('GET'), post: reg('POST') }; }
async function call(app, key, { query = {}, owner = true } = {}) {
  const h = app.routes[key]; assert.ok(h, `no route ${key}`);
  let out = null, status = 200; const res = { set() { return res; }, status(s) { status = s; return res; }, json(j) { out = j; return res; } };
  const [guard, handler] = h; let passed = false; await guard({ query, headers: {} }, res, () => { passed = true; });
  if (passed) await handler({ query, headers: {} }, res);
  return { status, out };
}
const ownerGate = owner => (q, s, n) => (owner() ? n() : s.status(403).json({ ok: false, error: 'owner only' }));

function setup({ nowIso = '2026-11-27T22:15:00Z', owner = () => true } = {}) {
  const store = new Map(); let t = Date.parse(nowIso), sessCalls = 0;
  const day = d => ({ date: d, runs: { morning: { savedAt: `${d}T07:05:00Z`, mode: 'quick', plan: [{ kind: 'lead', title: 'The Lead', view: 'globe', text: 'Gold is up 2.1 percent. That is 2.4 times its usual move.' }], inputs: { movers: [{ key: 'GOLD', vsUsual: 2.4 }] },
    claims: [{ kind: 'mover_big', id: 'mover_big:GOLD', key: 'GOLD', ratio: 2.4, spoken: true }, { kind: 'release_vs_expected', id: 'release_vs_expected:USD@13:30', ccy: 'USD', ms: Date.parse(`${d}T13:30:00Z`), name: 'Unemployment Claims', dir: 'above', spoken: true }] } } });
  store.set('helix/days/2026-11-26.json', day('2026-11-26')); store.set('helix/days/2026-11-27.json', day('2026-11-27'));
  const app = fakeApp();
  let intervalFn = null;
  const api = mountHelixMemory(app, {
    ownerOnly: ownerGate(owner), now: () => t, log: { log() {}, warn() {} },
    r2GetJSON: async k => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null), r2PutJSON: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    r2ListKeys: async p => [...store.keys()].filter(k => k.startsWith(p)),
    sessionStatus: async () => { sessCalls++; return { session_date: new Date(t).toISOString().slice(0, 10), instruments: { GOLD: { oc: 1.9, hl: 2.4, forecast: { hl_median: 1.6, oc_median: 0.8 } } } }; },
    selfJson: async p => (p === '/api/events' ? [{ ms: Date.parse('2026-11-27T13:30:00Z'), country: 'US', event: 'Unemployment Claims', actual: '1.2M', estimate: '950K' }] : null),
    svcInterval: fn => { intervalFn = fn; return 1; },
  });
  return { app, api, store, setNow: iso => { t = Date.parse(iso); }, sessCalls: () => sessCalls, tick: () => intervalFn() };
}

test('londonClock (GMT and BST) and the bounded LRU', () => {
  assert.deepEqual(londonClock(Date.parse('2026-11-27T22:15:00Z')), { date: '2026-11-27', mins: 22 * 60 + 15 });
  assert.deepEqual(londonClock(Date.parse('2026-07-01T23:30:00Z')), { date: '2026-07-02', mins: 30 });
  let t = 0; const c = lru(2, () => t); c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3); assert.equal(c.get('b'), undefined, 'least recent evicted'); assert.equal(c.get('a'), 1); assert.equal(c.size, 2);
  c.set('d', 4, 100); t = 200; assert.equal(c.get('d'), undefined, 'expired');
});

test('the evening job: nothing before 22:10 London, then scores the day once (score file + summary)', async () => {
  const S = setup({ nowIso: '2026-11-27T21:00:00Z' });
  assert.deepEqual(await S.api.tick(), { skipped: true }); assert.ok(!S.store.has('helix/scores/2026-11-27.json'));
  S.setNow('2026-11-27T22:15:00Z');
  const r = await S.api.tick(); assert.equal(r.ok, true); assert.equal(r.checked, 2);
  const sc = S.store.get('helix/scores/2026-11-27.json'); assert.deepEqual(sc.counts, { mover_big: [1, 1], release_vs_expected: [1, 1] }); assert.ok(!sc.partialDay);
  assert.equal(S.store.get(SUMMARY_KEY).kinds.mover_big.n, 1);
  assert.deepEqual(await S.api.tick(), { skipped: true }, 'once a day');
  const again = await S.api.scoreDate('2026-11-27'); assert.equal(again.already, true);
});

test('a session that is not today is not scored; a POST before the close is marked partial and redone at the close', async () => {
  const S = setup({ nowIso: '2026-11-27T22:15:00Z' });
  const r = await S.api.scoreDate('2026-11-26'); assert.equal(r.ok, false); assert.match(r.why, /not 2026-11-26/);
  S.setNow('2026-11-27T15:00:00Z');
  const p = await call(S.app, 'POST /api/helix/score'); assert.equal(p.out.ok, true); assert.equal(S.store.get('helix/scores/2026-11-27.json').partialDay, true);
  S.setNow('2026-11-27T22:20:00Z');
  const r2 = await S.api.scoreDate('2026-11-27'); assert.ok(r2.wrote, 'partial score redone'); assert.ok(!S.store.get('helix/scores/2026-11-27.json').partialDay);
  assert.equal(S.store.get(SUMMARY_KEY).nDays, 1, 'the day replaced, not added twice');
});

test('diary routes: a day with its score and neighbours, ?before=, search, scorecard; owner only', async () => {
  const S = setup(); await S.api.tick();
  const d = (await call(S.app, 'GET /api/helix/diary', { query: { date: '2026-11-27' } })).out;
  assert.equal(d.ok, true); assert.equal(d.prev, '2026-11-26'); assert.equal(d.next, null); assert.equal(d.score.results.length, 2); assert.equal(d.parts[0].lines[0].view, 'globe');
  const b = (await call(S.app, 'GET /api/helix/diary', { query: { before: '2026-11-28' } })).out; assert.equal(b.date, '2026-11-27'); assert.equal(b.close.rows.GOLD.ratio, 2.375);
  assert.equal((await call(S.app, 'GET /api/helix/diary', { query: { date: 'nope' } })).status, 400);
  assert.equal((await call(S.app, 'GET /api/helix/diary', { query: { date: '2026-10-01' } })).out.latest, '2026-11-27');
  const s = (await call(S.app, 'GET /api/helix/diary/search', { query: { q: 'gold', from: '2026-11-01', to: '2026-11-27' } })).out;
  assert.equal(s.ok, true); assert.equal(s.searched, 2); assert.deepEqual(s.hits.map(h => h.date), ['2026-11-27', '2026-11-26']); assert.deepEqual(s.hits[0].score, { hits: 2, n: 2 });
  const sc = (await call(S.app, 'GET /api/helix/scorecard')).out; assert.equal(sc.summary.kinds.release_vs_expected.hits, 1); assert.ok(sc.kinds.mover_big.rule);
  assert.equal((await call(S.app, 'GET /api/helix/scores', { query: { date: '2026-11-27' } })).out.ok, true);
  const N = setup({ owner: () => false });
  for (const k of ['GET /api/helix/diary', 'GET /api/helix/diary/search', 'GET /api/helix/scores', 'GET /api/helix/scorecard', 'POST /api/helix/score']) assert.equal((await call(N.app, k, { query: { date: '2026-11-27' } })).status, 403, k);
});
