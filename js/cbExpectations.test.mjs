// Tests for js/cbExpectations.js.   node js/cbExpectations.test.mjs
import assert from 'node:assert/strict';
import { at, bankView, expectations } from './cbExpectations.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const sonia = { source: '3M SONIA (SO3, ICEEU)', kind: '3m', rungs: [{ month: '202612', local: 'SO3Z6', rate: 3.60, rateWeekAgo: 3.65 }, { month: '202603', local: 'x', rate: NaN }, { month: '202703', rate: 3.40 }, { month: '202706', rate: 3.25 }, { month: '202712', rate: 3.10 }] };
t('nearest rung to a horizon, within two months', () => {
  assert.equal(at(sonia.rungs, '202611', 4).month, '202703'); assert.equal(at(sonia.rungs, '202611', 40), null);
});
t('a 3m strip against the policy rate: bp, 25 bp steps, week change', () => {
  const v = bankView(sonia, 3.75, '202611');
  assert.equal(v.against, 'policy rate'); assert.equal(v.rungs[0].bp, -15); assert.equal(v.rungs[0].weekBp, -5);
  assert.equal(v.m3.month, '202703'); assert.equal(v.m3.bp, -35); assert.equal(v.m3.steps, -1.4); assert.equal(v.m12.bp, -65);
});
t('a bank-bill strip is read against its front contract, never against the policy rate', () => {
  const v = bankView({ kind: 'bill', rungs: [{ month: '202612', rate: 3.9 }, { month: '202706', rate: 3.6 }] }, 3.5, '202611');
  assert.equal(v.against, 'front contract'); assert.equal(v.rungs[1].bp, -30); assert.equal(v.rungs[0].bp, 0);
});
t('all banks, with the pull age', () => {
  const e = expectations({ asOf: '2026-11-03T12:00:00Z', banks: { GBP: sonia, XYZ: { rungs: [] } }, errors: { JPY: ['TONA3M OSE.JPN: not found'] } }, { GBP: 3.75 }, Date.parse('2026-11-03T18:00:00Z'));
  assert.deepEqual(Object.keys(e.banks), ['GBP']); assert.equal(e.ageH, 6); assert.equal(e.errors.JPY.length, 1);
});
console.log(`cbExpectations: ${n} tests passed`);
