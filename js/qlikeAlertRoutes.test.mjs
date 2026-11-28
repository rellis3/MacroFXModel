// node --test js/qlikeAlertRoutes.test.mjs: the QLIKE level alert loop with every input stubbed (board, opens, prices, KV, Telegram):
// one message per check, saved before sending, idle outside the session, muted = logged not sent, the GET route's shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountQlikeAlerts } from './qlikeAlertRoutes.js';
import { londonMidnightMs } from './qlikeLevelAlerts.js';

const SESSION = '2026-11-30', AT = (hh, mm = 0) => londonMidnightMs(SESSION) + (hh * 60 + mm) * 60_000;
const Q = { oh_p75: 0.4, oh_p90: 0.6, ol_p75: 0.4, ol_p90: 0.6 };
function rig({ muted = false, session = SESSION } = {}) {
  const routes = {}, store = {}, sent = [], order = [];
  const app = { get: (p, h) => { routes[p] = h; } };
  let t = AT(9), px = { EUR_USD: 1.1, XAU_USD: 3600 };
  const kv = { get: async k => store[k] ?? null, put: async (k, v) => { order.push('put'); store[k] = v; } };
  const h = mountQlikeAlerts(app, {
    kv, now: () => t, muted: () => muted, log: { warn() {}, log() {} },
    getBoard: async () => ({ ok: true, session, levels: { EURUSD: Q, GOLD: Q, USDJPY: Q } }),
    paramsOf: s => ({ EURUSD: { oanda: 'EUR_USD', lines: { oh: { hits_2020_26: [50, 25, 10] } } }, GOLD: { oanda: 'XAU_USD' }, USDJPY: { oanda: 'USD_JPY' } })[s],
    fetchOpen: async inst => ({ EUR_USD: 1.1, XAU_USD: 3600 })[inst] ?? null,
    fetchPrices: async list => Object.fromEntries(list.map(i => [i, px[i]])),
    notify: async m => { order.push('send'); sent.push(m); return true; },
  });
  const get = async (q = {}) => { let out; await routes['/api/qlike-alerts']({ query: q }, { set() {}, json: j => { out = j; }, status() { return this; } }); return out; };
  return { h, store, sent, order, get, setT: v => { t = v; }, setPx: o => { px = { ...px, ...o } } };
}

test('a reach after the baseline sends one message, saved first; repeats are silent', async () => {
  const r = rig();
  let run = await r.h.tick();                          // baseline at the open
  assert.equal(run.events, 0); assert.equal(run.watched, 2);
  r.setT(AT(9, 1)); r.setPx({ EUR_USD: 1.1 * 1.0045, XAU_USD: 3600 * 0.9935 });   // EUR through oh_p75, gold through ol_p75 and ol_p90
  run = await r.h.tick();
  assert.equal(run.events, 3); assert.equal(run.sent, 3);
  assert.deepEqual(r.order, ['put', 'send']);
  assert.equal(r.sent.length, 1);
  assert.match(r.sent[0], /EURUSD reached its upper QLIKE level \(1\.10440\), the forecast's 75th-percentile range edge/);
  assert.match(r.sent[0], /25% of 2020-26 sessions reached this line/);
  assert.match(r.sent[0], /GOLD reached its lower QLIKE level/);
  r.setT(AT(9, 2)); r.setPx({ EUR_USD: 1.1 }); await r.h.tick(); r.setT(AT(9, 3)); r.setPx({ EUR_USD: 1.1 * 1.0045 }); run = await r.h.tick();
  assert.equal(run.events, 0); assert.equal(r.sent.length, 1);
  const g = await r.get();
  assert.equal(g.ok, true); assert.equal(g.session, SESSION); assert.equal(g.log.length, 3); assert.equal(g.sentToday, 3);
  assert.deepEqual(g.evidence, ['level-touch', 'line-touch-reach']);
  assert.equal(g.watching.length, 2); assert.ok(g.watching.find(w => w.market === 'EURUSD').reached.includes('oh_p75'));
  assert.equal(g.rules.quiet, '22:00-07:00 London');
});

test('quiet hours log but never send; muted logs but never sends', async () => {
  const q = rig(); q.setT(AT(6)); await q.h.tick(); q.setT(AT(6, 1)); q.setPx({ EUR_USD: 1.1 * 1.0045 });
  const run = await q.h.tick(); assert.equal(run.events, 1); assert.equal(run.sent, 0); assert.equal(q.sent.length, 0);
  assert.match((await q.get()).log[0].held, /quiet hours/);
  const m = rig({ muted: true }); await m.h.tick(); m.setT(AT(9, 1)); m.setPx({ EUR_USD: 1.1 * 1.0045 });
  await m.h.tick(); assert.equal(m.sent.length, 0); assert.equal((await m.get()).log.length, 1);
});

test('idle outside the session: the evening after 22:00 and a board for another day', async () => {
  const r = rig(); r.setT(AT(22, 30)); const a = await r.h.tick(); assert.match(a.idle, /outside the session/);
  const b = rig({ session: '2026-12-01' }); const c = await b.h.tick(); assert.match(c.idle, /outside the session/);
});
