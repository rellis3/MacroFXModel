// node --test js/terminal/jarvisSkewCore.test.mjs: Helix's SKEW view maths (js/terminal/jarvisSkewCore.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pct20, chgK, range20, pctWord, skewRows, skewLine, skewHeadline, SKEW_EVIDENCE, SKEW_NOTE } from './jarvisSkewCore.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';

test('pct20: the last print against the up-to-19 before it, ties half, null under 10 prints', () => {
  assert.equal(pct20([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 100);
  assert.equal(pct20([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 0);
  assert.equal(pct20([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 50);
  assert.equal(pct20([1, 2, 3]), null);
  const long = [...Array.from({ length: 40 }, () => 100), ...Array.from({ length: 19 }, (_, i) => i), 9.5];   // only the last 20 count
  assert.equal(pct20(long), 53);
  assert.equal(pct20([null, 1, 2, NaN, 3, 4, 5, 6, 7, 8, 9, 10]), 100);
});

test('changes and the 20-print band', () => {
  assert.equal(chgK([1, 1.5, 2.25], 1), 0.75); assert.equal(chgK([1, 2], 5), null); assert.equal(chgK([0.3, 0.3], 1), 0);
  assert.deepEqual(range20([3, -1, 2]), [-1, 3]); assert.equal(range20([1]), null);
  assert.match(pctWord(85), /high end/); assert.match(pctWord(10), /low end/); assert.match(pctWord(50), /middle/); assert.match(pctWord(null), /too few/);
});

test('skewRows: RR and BF with their own percentiles; no RR, no row; a failed board is empty', () => {
  const board = { ok: true, rows: [
    { id: 'EUR', label: 'Euro FX (6E)', pair: 'EUR/USD', rr: -0.18, bf: 0.15, atm: 6.52, lean: 'paying for EUR weakness', spark: [-0.3, -0.29, -0.28, -0.27, -0.26, -0.25, -0.24, -0.23, -0.22, -0.18], bfSpark: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.15] },
    { id: 'GOLD', label: 'Gold', rr: 1.2, bf: 0.4, spark: [1.2] },
    { id: 'X', label: 'none', rr: null }] };
  const R = skewRows(board);
  assert.equal(R.length, 2);
  assert.equal(R[0].rrPct, 100); assert.equal(R[0].bfPct, 0); assert.equal(R[0].rrChg1, 0.04); assert.equal(R[0].rrChg5, 0.08); assert.equal(R[0].bfChg5, -0.05);
  assert.deepEqual(R[0].rrBand, [-0.3, -0.18]);
  assert.equal(R[1].rrPct, null); assert.equal(R[1].bfPct, null); assert.equal(R[1].rrBand, null);
  assert.deepEqual(skewRows({ ok: false }), []); assert.deepEqual(skewRows(null), []);
  assert.equal(skewLine(R[0]), 'Euro FX (6E): RR −0.18 (paying for EUR weakness; high end of its last 20 prints, +0.08 over 5 prints) · BF +0.15 (low end of its last 20 prints).');
  const h = skewHeadline(R, 0.7); assert.equal(h.hero, 'Euro FX (6E) RR 100th pct'); assert.match(h.sub, /pulled 0.7h ago/);
  assert.match(skewHeadline([R[1]]).sub, /too few prints/); assert.equal(skewHeadline([]), null);
});

test('description only, and the evidence ids exist in the Evidence Book', () => {
  const ids = new Set(DESK_EVIDENCE.map(e => e.id));
  for (const id of SKEW_EVIDENCE) assert.ok(ids.has(id), id);
  assert.doesNotMatch(SKEW_NOTE, /\b(buy|sell|go long|go short|signal to)\b/i);
});
