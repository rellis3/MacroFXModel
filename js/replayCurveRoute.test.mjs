// js/replayCurveRoute.test.mjs: GET /api/replay/curve through mountDeskBoards with a stand-in app: frames from the held daily series, window clamped,
// a failure is a 502 with a reason (never an empty 200), and the route is read-only (GET only).
// node --test js/replayCurveRoute.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountDeskBoards } from './deskBoardRoutes.js';

const mk = (n, f) => Array.from({ length: n }, (_, k) => ({ date: new Date(Date.parse('2026-04-01T00:00:00Z') + k * 864e5).toISOString().slice(0, 10), value: f(k) }));
const S = { effr: mk(260, () => 3.6), us2y: mk(260, k => 3.8 + k * 0.001), us5y: mk(260, k => 3.9 + k * 0.001), us10y: mk(260, k => 4.1 + k * 0.002), us30y: mk(260, k => 4.6 + k * 0.001) };

function boot(ratesSeries) {
  const gets = {}, other = [];
  const app = { get: (p, h) => { gets[p] = h; }, post: (...a) => other.push(['post', a[0]]), put: (...a) => other.push(['put', a[0]]), locals: {} };
  const keys = [];
  mountDeskBoards(app, { mbCached: async (k, h, fn) => { keys.push(k); return fn(); }, ratesSeries, selfJson: async () => null, getState: async () => null, fredKey: 'x' });
  return { gets, other, keys };
}
const call = async (h, query = {}) => { const out = { code: 200, body: null, headers: {} }; await h({ query }, { set: (k, v) => { out.headers[k] = v; }, status(c) { out.code = c; return this; }, json(b) { out.body = b; } }); return out; };

test('serves one frame per day for the asked window, cached under a per-window key, never stored by the browser', async () => {
  const b = boot(async () => S), r = await call(b.gets['/api/replay/curve'], { days: '60' });
  assert.equal(r.code, 200); assert.equal(r.body.ok, true); assert.ok(r.body.frames.length >= 55 && r.body.frames.length <= 62);
  assert.equal(r.body.days, 60); assert.equal(r.headers['Cache-Control'], 'no-store'); assert.deepEqual(b.keys, ['replaycurve60']);
  assert.match(r.body.note, /not what a screen showed/);
});

test('the window defaults to 90 days and is clamped to 20..365', async () => {
  const b = boot(async () => S), h = b.gets['/api/replay/curve'];
  assert.equal((await call(h)).body.days, 90); assert.equal((await call(h, { days: '5' })).body.days, 20); assert.equal((await call(h, { days: '9999' })).body.days, 365); assert.equal((await call(h, { days: 'abc' })).body.days, 90);
});

test('no rates yet is a 502 with the reason, not an empty success; the route is GET only', async () => {
  const b = boot(async () => null), r = await call(b.gets['/api/replay/curve']);
  assert.equal(r.code, 502); assert.equal(r.body.ok, false); assert.match(r.body.error, /no rates yet/);
  assert.ok(!b.other.some(([, p]) => String(p).includes('/api/replay/curve')), 'no write verb on the route');
});
