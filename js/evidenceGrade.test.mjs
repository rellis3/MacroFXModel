// Evidence grades (js/evidenceGrade.js). Run: node --test js/evidenceGrade.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from './evidenceGrade.js';
import { DESK_EVIDENCE } from './deskEvidence.js';
import { EVIDENCE_AUDIT } from './evidenceAudit.js';

const sound = { status: 'stands' }, reopened = { status: 'reopened' }, unverified = { status: 'unverified' };
const g = (verdict, result, audit = sound) => G.gradeEntry({ id: 'x', verdict, result }, audit);

test('reads "estimate [lo, hi]" with signs, units and the unicode minus; refuses a number outside its own interval', () => {
  assert.deepEqual((({ est, lo, hi, unit }) => ({ est, lo, hi, unit }))(G.readInterval('net +0.08 ATR [-0.02, +0.18] over 3 days')), { est: 0.08, lo: -0.02, hi: 0.18, unit: 'ATR' });
  assert.equal(G.readInterval('b −0.005 [−0.021, +0.012]').lo, -0.021);
  assert.equal(G.readInterval('+2.5% [-0.8%, +6.1%]').hi, 6.1);
  assert.equal(G.readInterval('n 120 [0.3, 0.9]'), null);
  assert.equal(G.readInterval('no numbers here'), null);
  assert.equal(G.readInterval('pinball got worse by 0.8% [0.2, 1.4]').signUnclear, true);
});

test('a null is not dead: the grade follows the interval and the trust in the test', () => {
  assert.equal(g('null', 'effect +0.10 [-0.02, +0.22]').grade, 'faint');
  assert.equal(g('null', 'effect +0.10 [+0.01, +0.22]').grade, 'leaning');
  assert.equal(g('null', 'effect +0.001 [-0.05, +0.05]').grade, 'against');
  assert.equal(g('null', 'effect -0.04 [-0.07, -0.01]').grade, 'against');
  assert.equal(g('null', 'effect +0.001 [-0.05, +0.05]', reopened).grade, 'untested');
  assert.equal(g('null', 'effect +0.001 [-0.05, +0.05]', unverified).grade, 'untested');
  assert.equal(g('null', 'no interval at all').grade, 'against');
  assert.equal(g('null', 'no interval at all', null).grade, 'untested');
  assert.match(g('null', 'no interval at all').basis, /graded from the verdict/);
});

test('underpowered is unknown unless the estimate leans the claimed way; validated is strong only when audited sound', () => {
  assert.equal(g('underpowered', 'b +0.10 [-0.07, +0.28]').grade, 'faint');
  assert.equal(g('underpowered', 'b -0.10 [-0.28, +0.07]').grade, 'untested');
  assert.equal(g('underpowered', 'Sharpe 1.23 [0.78, 1.69]').grade, 'leaning');
  assert.equal(g('validated', '+0.76 ATR [+0.3, +1.2]').grade, 'strong');
  assert.equal(g('validated', '+0.76 ATR [+0.3, +1.2]', unverified).grade, 'leaning');
  assert.equal(g('context', 'a base rate').grade, 'context');
  assert.equal(g('context', 'a base rate').weight, null);
});

test('a number whose sign reads as "worse" is never promoted; it is flagged for a person', () => {
  const r = g('null', 'pinball got worse by 0.8% [0.2, 1.4]');
  assert.equal(r.review, true);
  assert.notEqual(r.grade, 'leaning');
  assert.match(r.basis, /needs a person to read/);
});

test('weights sit inside their grade band and order the grades', () => {
  const w = gr => [g('validated', '+1 [+0.5, +1.5]'), g('validated', '+1 [+0.5, +1.5]', unverified), g('null', '+0.1 [-0.02, +0.22]'), g('underpowered', '-0.1 [-0.2, +0.1]'), g('null', '0 [-0.05, +0.05]')].map(r => r.weight);
  const [s, l, f, u, a] = w();
  assert.ok(s > l && l > f && f > u && u > a, `${s} ${l} ${f} ${u} ${a}`);
});

test('the whole Evidence Book grades: every entry gets a grade, nothing banked as validated drops below leaning', () => {
  const all = G.gradeAll(DESK_EVIDENCE, EVIDENCE_AUDIT);
  assert.equal(all.length, DESK_EVIDENCE.length);
  for (const r of all) assert.ok(G.GRADES.includes(r.grade), r.id);
  for (const r of all.filter(r => r.verdict === 'validated')) assert.ok(['strong', 'leaning'].includes(r.grade), r.id);
  const c = G.gradeCounts(all);
  assert.equal(Object.values(c.byGrade).reduce((a, b) => a + b, 0), DESK_EVIDENCE.length);
  assert.ok(c.byGrade.against < DESK_EVIDENCE.filter(e => e.verdict === 'null').length, 'most nulls are not "against"');
});
