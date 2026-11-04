// Tests for js/fleetPortfolio.js.   node js/fleetPortfolio.test.mjs
import assert from 'node:assert/strict';
import { mulberry32 } from './statsCore.js';
import { dailySeries, riskParity, halfKelly, varEs, fleetReport, validateAllocation } from './fleetPortfolio.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const rng = mulberry32(11), gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const day0 = Date.parse('2026-06-01T12:00:00Z');
// three bots over 80 days: A and B share a common driver, C is independent and twice as volatile; D trades rarely
const trades = [];
for (let d = 0; d < 80; d++) { const ms = day0 + d * 864e5, f = gauss();
  trades.push({ bot: 'A', closeMs: ms, R: 0.2 + f + 0.3 * gauss(), profit: 10 }, { bot: 'B', closeMs: ms, R: 0.1 + f + 0.3 * gauss() }, { bot: 'C', closeMs: ms, R: d < 55 ? 0.3 + 2 * gauss() : -3 });
  if (d % 10 === 0) trades.push({ bot: 'D', closeMs: ms, R: 1 }); }
t('daily series align on the union of dates', () => {
  const s = dailySeries(trades); assert.deepEqual(s.bots, ['A', 'B', 'C', 'D']); assert.equal(s.dates.length, 80); assert.equal(s.active.D, 8); assert.equal(s.series.D.filter(x => x).length, 8);
});
t('risk parity equalises risk contributions', () => {
  const cov = [[4, 0, 0], [0, 1, 0], [0, 0, 1]], w = riskParity(cov);
  assert.ok(Math.abs(w[0] - 1 / 5) < 1e-3 && Math.abs(w[1] - 2 / 5) < 1e-3, w.join());
  const c2 = [[1, 0.8, 0], [0.8, 1, 0], [0, 0, 1]], w2 = riskParity(c2), mw = c2.map(r => r.reduce((a, c, j) => a + c * w2[j], 0)), rc = w2.map((x, i) => x * mw[i]);
  assert.ok(Math.max(...rc) - Math.min(...rc) < 1e-4); assert.ok(w2[2] > w2[0]);
});
t('half-Kelly is capped and needs 20 trades; VaR/ES', () => {
  assert.equal(halfKelly([1, 2]).ok, false);
  const k = halfKelly(Array.from({ length: 100 }, (_, i) => (i % 2 ? 2 : -0.5))); assert.ok(k.capped); assert.equal(k.suggested, 0.02);
  const v = varEs(Array.from({ length: 100 }, (_, i) => i - 50)); assert.equal(v['0.95'].var, 46); assert.ok(v['0.95'].es >= v['0.95'].var);
});
t('fleet report: weights, correlation, drift on the bot that broke', () => {
  const r = fleetReport(trades);
  assert.deepEqual(r.weighted, ['A', 'B', 'C']); assert.ok(r.bots.find(b => b.bot === 'D').weighted === false);
  const ab = r.correlations.find(c => c.a === 'A' && c.b === 'B'); assert.ok(ab.full > 0.7);
  const w = Object.fromEntries(r.weights.map(x => [x.bot, x])); assert.ok(w.C.inverseVol < w.A.inverseVol);
  assert.ok(r.effN > 1 && r.effN < 3);
  assert.equal(r.drift.find(d => d.bot === 'C').alarm, true); assert.equal(r.drift.find(d => d.bot === 'A').alarm, false);
  assert.ok(r.fleet.varEs['0.95'].var > 0); assert.ok(r.fleet.monteCarlo.ok);
  assert.equal(r.adds.length, 3);
});
t('allocation replies: actions, risk capped, unknown bots dropped', () => {
  assert.equal(validateAllocation({ headline: 'h', bots: [] }).ok, false);
  const v = validateAllocation({ headline: 'h', bots: [{ bot: 'A', action: 'cut', riskPerTrade: 5, why: 'drift' }, { bot: 'Z', action: 'keep' }, { bot: 'B', action: 'sell' }] }, ['A', 'B']);
  assert.ok(v.ok); assert.equal(v.value.bots.length, 1); assert.equal(v.value.bots[0].riskPerTrade, 2);
});
console.log(`fleetPortfolio: ${n} tests passed`);
