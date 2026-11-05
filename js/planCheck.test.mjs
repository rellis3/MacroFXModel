import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPlan, checkBook, planSummary } from './planCheck.js';

const L = { open: 1.1000, up: { p50: 1.1050, p75: 1.1080, p90: 1.1100 }, down: { p50: 1.0950, p75: 1.0920, p90: 1.0900 } };   // u 0.0050
const long = { rating: 'LONG', size: 1, levels: L, plan: { zone: 'Buy 1.0985-1.0995', invalidation: 'below 1.0960' } };

test('a coherent long passes', () => { const p = checkPlan(long); assert.equal(p.ok, true); assert.deepEqual(p.issues, []); });
test('a zone reaching the first target is flagged (the AUDCAD case, short)', () => {
  const p = checkPlan({ rating: 'SHORT', size: 1, levels: L, plan: { zone: 'sell 1.0940-1.1010', invalidation: 'above 1.1030' } });
  assert.equal(p.ok, false); assert.ok(p.issues.some(i => /reaches the first target/.test(i)));
  assert.ok(p.issues.some(i => /1.4 u wide/.test(i)), 'and it is too wide');
});
test('an invalidation inside the zone, no zone, no invalidation', () => {
  assert.ok(checkPlan({ ...long, plan: { zone: '1.0985-1.0995', invalidation: 'below 1.0990' } }).issues.some(i => /invalidation/.test(i)));
  assert.ok(checkPlan({ ...long, plan: { invalidation: 'below 1.0960' } }).issues.includes('no entry zone'));
  assert.ok(checkPlan({ ...long, plan: { zone: '1.0985-1.0995' } }).issues.includes('no invalidation level'));
});
test('FLAT and size 0 are not checked; the book summary counts', () => {
  assert.equal(checkPlan({ rating: 'FLAT', size: 0, levels: L }), null);
  const book = { A: { ...long }, B: { rating: 'SHORT', size: 1, levels: L, plan: { zone: '1.0940-1.1010', invalidation: '1.1030' } }, C: { rating: 'FLAT', size: 0 } };
  checkBook(book);
  assert.equal(book.C.planCheck, undefined);
  const s = planSummary(book); assert.equal(s.sized, 2); assert.equal(s.ok, 1); assert.equal(s.issues['the entry zone reaches the first target'], 1);
});
