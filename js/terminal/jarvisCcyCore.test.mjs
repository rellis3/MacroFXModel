import test from 'node:test';
import assert from 'node:assert/strict';
import { CCYS, ccyStrength, orbitPos, sizeOf, speedOf, ccyScript } from './jarvisCcyCore.js';

const mk = (moves) => { const v = {}; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const k = CCYS[i] + CCYS[j]; v[k] = { oc: (moves[CCYS[i]] - moves[CCYS[j]]) * 0.1, forecast: { oc_median: 0.1 } }; } return v; };
test('ccyStrength: ranks by the average pair move, base +, quote -', () => {
  const m = { USD: 3, EUR: 2, GBP: 1, JPY: -3, AUD: 0, NZD: -1, CAD: 0.5, CHF: -0.5 }, R = ccyStrength(mk(m));
  assert.equal(R.list[0].ccy, 'USD'); assert.equal(R.list[7].ccy, 'JPY'); assert.equal(R.pairs[0].key, 'USDJPY'); assert.ok(R.list[0].s > 0 && R.list[7].s < 0);
});
test('ccyStrength: a reversed key flips the sign; thin data is null', () => {
  const v = mk({ USD: 1, EUR: 0, GBP: 0, JPY: 0, AUD: 0, NZD: 0, CAD: 0, CHF: 0 }); v.EURUSD = { oc: -v.USDEUR?.oc, forecast: { oc_median: 0.1 } };
  const w = { ...mk({ USD: 1, EUR: 0, GBP: 0, JPY: 0, AUD: 0, NZD: 0, CAD: 0, CHF: 0 }) }; delete w.USDEUR; w.EURUSD = { oc: -0.1, forecast: { oc_median: 0.1 } };
  assert.ok(Math.abs(ccyStrength(w).list.find(x => x.ccy === 'USD').s - ccyStrength(v).list.find(x => x.ccy === 'USD').s) < 1e-9);
  assert.equal(ccyStrength(null), null); assert.equal(ccyStrength({ EURUSD: { oc: 1, forecast: { oc_median: 1 } } }), null);
});
test('orbit helpers: radius grows with the ring, size and speed are bounded', () => {
  const o = new Array(3).fill(0), r = i => { orbitPos(i, 0.7, 0.4, 0.3, o); return Math.hypot(...o); };
  assert.ok(r(7) > r(0)); assert.ok(Math.abs(r(0) - 0.6) < 1e-9);
  assert.equal(sizeOf(1, 0, 2), 0.5); assert.equal(speedOf(5, 2), 1); assert.equal(speedOf(1, 0), 0);
});
test('ccyScript: names strongest, weakest and the biggest pair; says it is not a forecast', () => {
  const t = ccyScript(ccyStrength(mk({ USD: 3, EUR: 2, GBP: 1, JPY: -3, AUD: 0, NZD: -1, CAD: 0.5, CHF: -0.5 })));
  assert.match(t, /The dollar is the strongest/); assert.match(t, /the yen the weakest/); assert.match(t, /Dollar Yen, up/); assert.match(t, /not a forecast/); assert.equal(ccyScript(null), null);
});
