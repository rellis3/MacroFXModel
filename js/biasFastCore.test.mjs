// node js/biasFastCore.test.mjs — the Bias Engine fast layer (js/biasFastCore.js; prereg forge/BIAS_FAST_LAYER_PREREG.md).
import assert from 'node:assert/strict';
import { HOURS, NH, TARGETS, fitBeta, callAt, forward, dollar, rates, liveCalls, panelFromH1, LAG_FLAG } from './biasFastCore.js';

let pass = 0; const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };
// a synthetic panel: dollar legs random walks; GOLD = -2 x dollar hourly + noise; US02Y random walk
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
function synth(ns = 150) {
  const keys = ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'USDCAD', 'USDCHF', 'US02Y', 'GOLD'], px = Object.fromEntries(keys.map(k => [k, []])), sessions = [];
  for (let s = 0; s < ns; s++) {
    sessions.push(new Date(Date.UTC(2025, 0, 1 + s)).toISOString().slice(0, 10));
    const p = { EURUSD: 1.1, GBPUSD: 1.3, AUDUSD: 0.7, USDJPY: 150, USDCAD: 1.35, USDCHF: 0.9, US02Y: 100, GOLD: 2000 };
    const row = Object.fromEntries(keys.map(k => [k, [p[k]]]));
    for (let h = 1; h < NH; h++) {
      const u = rnd() * 0.002;   // common dollar shock
      for (const [k, sg] of [['EURUSD', -1], ['GBPUSD', -1], ['AUDUSD', -1], ['USDJPY', 1], ['USDCAD', 1], ['USDCHF', 1]]) p[k] *= Math.exp(sg * u + rnd() * 0.0005);
      p.US02Y *= Math.exp(rnd() * 0.001); p.GOLD *= Math.exp(-2 * u + rnd() * 0.0005);
      for (const k of keys) row[k].push(p[k]);
    }
    for (const k of keys) px[k].push(row[k]);
  }
  return { sessions, px };
}
const P = synth();
t('fitBeta recovers a planted dollar beta for gold (-2) out of sample', () => {
  const f = fitBeta(P, 140, 'GOLD'); assert.ok(f.ok); assert.ok(Math.abs(f.bU + 2) < 0.15, `bU ${f.bU}`); assert.ok(Math.abs(f.bY) < 0.3);
});
t('a pair is never explained by its own leg (left out of the dollar)', () => {
  const a = dollar(P, 5, 0, 3, 'EURUSD'), b = dollar(P, 5, 0, 3, 'GOLD'); assert.notEqual(a, b);
});
t('callAt: implied move, z and parts; forward in sigma units; a missing price -> null', () => {
  const f = fitBeta(P, 140, 'GOLD'), c = callAt(P, 140, 'GOLD', 12, f);
  assert.ok(Math.abs(c.partU + c.partY - c.z) < 1e-9); assert.ok([-1, 0, 1].includes(c.dir));
  assert.ok(Number.isFinite(forward(P, 140, 'GOLD', 12, f)));
  assert.equal(forward(P, 140, 'GOLD', 20, f), null);   // 20 + 3 > 21
  const Q = structuredClone(P); Q.px.US02Y[140][0] = null; assert.equal(callAt(Q, 140, 'GOLD', 12, f), null);
});
t('fitBeta needs 60 usable sessions', () => { assert.equal(fitBeta(P, 30, 'GOLD').ok, false); });
t('liveCalls on the last session; lag flag only for the dollar pairs', () => {
  const L = liveCalls(P, 14, { targets: ['GOLD', 'EURUSD'] }); assert.ok(L.calls.GOLD.ok); assert.equal(L.date, P.sessions.at(-1));
  assert.ok(LAG_FLAG.has('EURUSD') && !LAG_FLAG.has('GOLD')); assert.equal(TARGETS.length, 12);
});
t('panelFromH1: the price at h:00 London is the close of the bar ending then; open bars dropped; BST handled', () => {
  // 2026-11-24 is GMT: the bar starting 09:00Z ends 10:00 London. 2026-07-01 is BST: bar starting 09:00Z ends 11:00 London
  const bars = { X: [{ t: '2026-11-24T09:00', c: 1.5 }, { t: '2026-11-24T10:00', c: 1.6 }, { t: '2026-07-01T09:00', c: 2 }] };
  const now = Date.parse('2026-11-24T10:30:00Z') / 1000, p = panelFromH1(bars, now);
  assert.deepEqual(p.sessions, ['2026-07-01', '2026-11-24']);
  assert.equal(p.px.X[1][HOURS.indexOf(10)], 1.5); assert.equal(p.px.X[1][HOURS.indexOf(11)], null);   // 10:00Z bar not closed
  assert.equal(p.px.X[0][HOURS.indexOf(11)], 2);
});
console.log(`\n${pass} passed`);
