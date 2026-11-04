// Tests for js/emGauges.js.   node js/emGauges.test.mjs
import assert from 'node:assert/strict';
import { gauge, emGauges, EM_PAIRS } from './emGauges.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const series = (k, f) => Array.from({ length: k }, (_, i) => ({ date: `d${i}`, close: f(i) }));
t('changes, vol and z of the last 5-day move', () => {
  const calm = series(300, i => 17 * (1 + 0.002 * Math.sin(i)));
  const g = gauge(calm); assert.ok(g.ok); assert.ok(Math.abs(g.z5) < 2); assert.equal(g.spark.length, 60);
  const shock = series(300, i => (i < 295 ? 17 * (1 + 0.002 * Math.sin(i)) : 17 * 1.08));
  const s = gauge(shock); assert.ok(s.z5 > 3, `z ${s.z5}`); assert.ok(s.chg5d > 7); assert.equal(gauge(series(10, () => 1)).ok, false);
});
t('EM stress from MXN and ZAR', () => {
  const shock = series(300, i => (i < 295 ? 17 * (1 + 0.002 * Math.sin(i)) : 17 * 1.08)), calm = series(300, i => 7 * (1 + 0.001 * Math.cos(i)));
  const r = emGauges({ USDMXN: shock, USDZAR: shock, USDCNH: calm });
  assert.equal(r.stress.level, 'stress'); assert.equal(r.pairs.USDTRY.ok, false); assert.equal(Object.keys(r.pairs).length, EM_PAIRS.length);
});
console.log(`emGauges: ${n} tests passed`);
