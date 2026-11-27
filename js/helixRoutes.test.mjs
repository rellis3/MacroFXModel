import test from 'node:test'; import assert from 'node:assert/strict';
import { mountHelixRoutes, slot } from './helixRoutes.js';
import { createDataArchive } from './dataArchive.js';

function fakeApp() {
  const routes = {}; const reg = m => (path, ...h) => { routes[`${m} ${path}`] = h; };
  return { routes, get: reg('GET'), post: reg('POST') };
}
async function call(app, key, { query = {}, body = null, cookie = 'c=1', owner = true } = {}) {
  const h = app.routes[key]; assert.ok(h, `no route ${key}`);
  const req = { query, body, headers: { cookie } }; let out = null, status = 200;
  const res = { set() { return res; }, status(s) { status = s; return res; }, json(j) { out = j; return res; } };
  const ownerOnly = (rq, rs, next) => (owner ? next() : rs.status(403).json({ ok: false }));
  for (const fn of h) { let nextCalled = false; await fn(req, res, () => { nextCalled = true; }); if (fn.length >= 3 && !nextCalled && fn !== h[h.length - 1]) break; }
  for (let i = 0; i < 50 && out == null; i++) await new Promise(r => setTimeout(r, 2));
  return { status, out, ownerOnly };
}
const day = i => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);

test('slot: one shared build, TTL, last good value served stale on failure', async () => {
  let t = 0, n = 0, fail = false; const get = slot(async () => { n++; if (fail) throw new Error('down'); return { ok: true, n }; }, 1000, { now: () => t });
  const [a, b] = await Promise.all([get(), get()]); assert.equal(n, 1); assert.equal(a, b);
  t = 500; await get(); assert.equal(n, 1); t = 1500; fail = true; const c = await get(); assert.equal(c.stale, true); assert.equal(c.error, 'down');
  const fresh = slot(async () => { throw new Error('x'); }, 10); await assert.rejects(fresh(), /x/);
});

test('routes: g10, funding, roll health, stress, vol terrain, bundle, record (fakes for R2, OANDA and the self-fetch)', async () => {
  const store = new Map();
  const pts = (n, f) => ({ points: Array.from({ length: n }, (_, i) => [day(i), f(i)]) });
  store.set('archive/series/fred/DGS2.json', pts(300, () => 4)); store.set('archive/series/fred/DGS10.json', pts(300, () => 4.5));
  for (const k of ['EA_2Y', 'EA_10Y', 'JP_2Y', 'JP_10Y', 'CA_2Y', 'CA_10Y']) store.set(`archive/series/g10_yields/${k}.json`, pts(300, () => 2));
  store.set('archive/series/nyfed/SOFR_P99.json', pts(300, () => 4.5)); store.set('archive/series/fred/IORB.json', pts(300, () => 4.4)); store.set('archive/series/nyfed/SOFR.json', pts(300, () => 4.36)); store.set('archive/series/nyfed/TGCR.json', pts(300, () => 4.33));
  store.set('archive/tables/ust_auctions/Note_10-Year.json', { rows: [{ date: day(10), highYield: 4.2, medianYield: 4.18, bidToCover: 2.5 }, { date: day(40), highYield: 4.3, medianYield: 4.25, bidToCover: 2.4 }] });
  const r2GetJSON = async k => store.get(k) ?? null;
  const r2PutJSON = async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); return true; };
  const archive = createDataArchive({ putJSON: r2PutJSON, getJSON: r2GetJSON });
  const selfCalls = [];
  const selfFetch = async (u, { cookie }) => { selfCalls.push([u, cookie]); if (u === '/api/xccy-basis') throw new Error('HTTP 500'); if (u === '/api/jarvis/watch') return { ok: true, lastCheck: 'x', lastAlerts: [{ at: 'a', text: 't' }] }; return { ok: true, asOf: new Date(Date.parse(`${day(299)}T12:00:00Z`)).toISOString() }; };
  const fetchRange = async () => [{ datetime: `${day(292)} 00:00:00`, high: 1.1, low: 1.0 }];
  const app = fakeApp(), nowMs = Date.parse(`${day(299)}T20:00:00Z`);
  mountHelixRoutes(app, { ownerOnly: (q, s, n) => n(), r2GetJSON, r2ListKeys: async () => [], archive, selfFetch, fetchRange, drill: async () => ({ dates: [day(1), day(2)], series: { dxyIce: [100, 101] } }), now: () => nowMs });

  const g = (await call(app, 'GET /api/g10-rates')).out; assert.equal(g.ok, true); assert.equal(g.rows.find(r => r.ccy === 'EUR').gapShort.bp, -200);
  const f = (await call(app, 'GET /api/funding-board')).out; assert.equal(f.items.find(x => x.id === 'sofr_p99_iorb').value, 10); assert.ok(f.auctions.find(a => a.tenor === '10y').ok); assert.ok(f.calendar.text);
  const rh = (await call(app, 'GET /api/helix/roll-health')).out; assert.equal(rh.absent, true);
  const s = (await call(app, 'GET /api/helix/stress')).out; assert.equal(s.ok, false); assert.equal(s.series.MOVE.days, 0);
  const vt = (await call(app, 'GET /api/vol-terrain')).out; assert.equal(vt.ok, true); assert.ok(Array.isArray(vt.markets.EURUSD));

  const b = (await call(app, 'GET /api/helix/bundle', { cookie: 'owner=1' })).out;
  assert.ok(b.blocks.g10 && b.blocks.funding && b.blocks.dxyIce && b.blocks.mc); assert.equal(b.blocks.xccy.degraded, true); assert.ok(b.degraded.includes('xccy'));
  assert.equal(b.blocks.dxyIce.data.last, 101); assert.ok(selfCalls.every(([, c]) => c === 'owner=1'), 'the owner cookie is forwarded');

  const bad = await call(app, 'POST /api/helix/record', { body: { date: 'nope' } }); assert.equal(bad.status, 400);
  const ok = (await call(app, 'POST /api/helix/record', { body: { date: '2026-11-27', part: 'morning', plan: [{ kind: 'open', text: 'Good morning.' }] } })).out;
  assert.equal(ok.ok, true); assert.equal(ok.wrote, true); assert.equal(store.get('helix/days/2026-11-27.json').runs.morning.watcher.alerts.length, 1);
  const rec = (await call(app, 'GET /api/helix/record', { query: { date: '2026-11-27' } })).out; assert.equal(rec.ok, true); assert.equal(rec.runs.morning.plan[0].text, 'Good morning.');
});
