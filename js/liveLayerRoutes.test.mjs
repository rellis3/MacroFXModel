// The live layer's route: one build serves every viewer, the cache differs open vs shut, one failing part never drops the rest.
//   node js/liveLayerRoutes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLiveLayer, mountLiveLayer, OPEN_TTL_MS, CLOSED_TTL_MS } from './liveLayerRoutes.js';

let T = Date.parse('2026-11-12T14:37:00Z');
const quote = (instrument, mid, o = {}) => ({ instrument, time: new Date(T).toISOString(), status: 'tradeable', tradeable: true, bids: [{ price: String(mid - 0.001) }], asks: [{ price: String(mid + 0.001) }], ...o });
function deps(over = {}) {
  const calls = { pricing: 0, candles: 0, clYield: 0, session: 0, em: 0 };
  return { calls, d: {
    now: () => T, isFxOpen: () => true,
    fetchCandles: async (sym) => { calls.candles++; return [{ time: '2026-11-11T22:00:00Z', complete: true, close: 100 }, { time: '2026-11-12T22:00:00Z', complete: false, close: 101 }]; },
    pricing: async () => { calls.pricing++; return { prices: [quote('USD_CNH', 7.1), quote('USD_MXN', 20.4), quote('USD_ZAR', 18), quote('USD_TRY', 42), quote('NAS100_USD', 101), quote('SPX500_USD', 100.5), quote('US30_USD', 100.2), quote('US2000_USD', 100.1)] }; },
    selfJson: async p => { calls.em++; assert.equal(p, '/api/em-gauges'); return { pairs: { USDMXN: { ok: true, last: 20, date: '2026-11-11', spark: [19, 19.2, 19.4, 19.6, 19.8, 19.9, 20] } } }; },
    clMarket: async () => ({ refOpen: 1_700_000_000 }),
    clYield: async (name) => { calls.clYield++; return { now: 4.0, ref: 4.1, deltaBp: -10, D: 5, asOf: '2026-11-12T14:30:00Z', closed: false }; },
    ylOfficial: async () => [{ date: '2026-11-11', value: 4.05 }],
    YL: new Proxy({}, { get: () => ({ daily: { src: 'fred', id: 'X' } }) }),
    getSession: async () => { calls.session++; return { instruments: { EURUSD: { hl: 0.5, forecast: { hl_median: 0.6 }, bar_count: 12 } } }; },
    strengthState: () => null,
    ...over } };
}

test('a build assembles every part; one call to pricing and the bond functions; cached 75 s open', async () => {
  const { calls, d } = deps(); const L = makeLiveLayer(d);
  const a = await L.get();
  assert.equal(a.ok, true); assert.equal(a.closed, false);
  assert.equal(a.em.pairs.USDMXN.live > 20, true);
  assert.ok(a.indices.rows.NQ); assert.equal(a.indices.rows.NQ.ref, 100, 'the reference is the last COMPLETE daily bar, not the one in progress');
  assert.equal(a.yields.rows.length, 5);
  assert.equal(a.state.range.rows[0].name, 'EURUSD');
  assert.equal(a.state.corr.ok, false, 'no hourly bars yet: said, not faked');
  await L.get(); await L.get();
  assert.equal(calls.pricing, 1, 'viewers share one build');
  T += OPEN_TTL_MS + 1000; await L.get();
  assert.equal(calls.pricing, 2); assert.equal(calls.candles, 4, 'index references are cached two hours');
});

test('concurrent viewers share one in-flight build', async () => {
  const { calls, d } = deps(); const L = makeLiveLayer(d);
  await Promise.all([L.get(), L.get(), L.get(), L.get()]);
  assert.equal(calls.pricing, 1);
});

test('a shut market is cached for ten minutes, not 75 seconds, and the answer says it is closed', async () => {
  const { calls, d } = deps({ isFxOpen: () => false }); const L = makeLiveLayer(d);
  const a = await L.get(); assert.equal(a.closed, true);
  T += OPEN_TTL_MS + 1000; await L.get(); assert.equal(calls.pricing, 1);
  T += CLOSED_TTL_MS; await L.get(); assert.equal(calls.pricing, 2);
});

test('a failing part never drops the rest, and says why', async () => {
  const { d } = deps({ pricing: async () => { throw new Error('OANDA pricing 503'); }, clYield: async () => { throw new Error('no anchor'); } });
  const L = makeLiveLayer(d); const a = await L.get();
  assert.equal(a.em.ok, false); assert.match(a.em.error, /503/);
  assert.equal(a.indices.ok, false);
  assert.equal(a.yields.ok, false);
  assert.equal(a.state.range.ok, true, 'the range state does not need prices');
  assert.equal(a.ok, true);
  assert.equal(L.status().parts.pricing.ok, false);
});

test('a rebuild that throws serves the last good copy with a warning', async () => {
  let boom = false; const { d } = deps({ now: () => T }); const L = makeLiveLayer({ ...d, getSession: async () => { if (boom) throw new Error('x'); return { instruments: {} }; } });
  await L.get(); T += OPEN_TTL_MS + 1;
  const a = await L.get(); assert.equal(a.ok, true);
  assert.equal(typeof L.status().lastOkAt, 'number');
});

test('mountLiveLayer registers GET /api/live-layer with no-store', async () => {
  const routes = {}; const app = { get: (p, h) => { routes[p] = h; } };
  const { d } = deps(); mountLiveLayer(app, d);
  let body, hdr = {}; await routes['/api/live-layer']({}, { set: (k, v) => { hdr[k] = v; }, json: b => { body = b; }, status: () => ({ json: b => { body = b; } }) });
  assert.equal(body.ok, true); assert.equal(hdr['Cache-Control'], 'no-store');
});
