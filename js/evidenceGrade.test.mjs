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

test('the headline interval wins over placebo / mirror side arms, and a cued "headline" wins over the first', () => {
  const pos = 'n crowded event-days: +0.064 ATR against the crowd [+0.019, +0.111]; 5 of 6 pairs positive. Placebo on non-release days -0.009 [-0.053, +0.032].';
  assert.equal(G.readInterval(pos).est, 0.064);
  assert.equal(G.readInterval('Placebo on non-release days -0.009 [-0.053, +0.032]. Real +0.064 [+0.019, +0.111]').est, 0.064);
  assert.equal(G.readInterval('P-bar -0.038 [-0.095, +0.020]. Mirror: STRONG minus FADED days -0.094 [-0.177, -0.003].').est, -0.038);
  assert.equal(G.readInterval('Mirror: STRONG minus FADED days -0.094 [-0.177, -0.003].'), null, 'a side arm alone is not a headline');
  assert.equal(G.readInterval('STRONG hold minus coin-flip placebo +0.003R [-0.044, +0.053]').est, 0.003, 'placebo as the baseline is the headline');
  assert.equal(G.readInterval('+1h -0.024 [-0.059, +0.010]; 21:00 UK (headline) -0.049 [-0.111, +0.012]; next 07:00 -0.036 [-0.103, +0.030]').est, -0.049);
  const e = { id: 'p', verdict: 'validated', result: pos };
  assert.equal(G.gradeEntry(e, sound).grade, 'strong');
});

test('reads "% per trade", attached R units, "x" ratios and notes inside the bracket', () => {
  const a = G.readInterval('mean net +0.034% per trade [+0.001, +0.066]');
  assert.deepEqual([a.est, a.lo, a.hi, a.unit], [0.034, 0.001, 0.066, '%']);
  const b = G.readInterval('STRONG hold +0.003R [-0.044, +0.053]');
  assert.deepEqual([b.est, b.unit], [0.003, 'R']);
  assert.equal(G.readInterval('moving net R -0.21 per trade [-0.37, -0.00]').est, -0.21);
  assert.equal(G.readInterval('net +0.25 sigma per event net [+0.10, +0.40, month blocks]').hi, 0.40);
  const r = G.headlineOf({ verdict: 'underpowered', result: 'net-move ratio 1.19x [0.72, 1.76]' });
  assert.ok(Math.abs(r.eff - 0.19) < 1e-9 && r.effLo < 0, 'a ratio is read against 1');
  assert.equal(g('underpowered', 'mean net +0.034% per trade [+0.001, +0.066]').grade, 'leaning');
});

test('direction: the claimed way may be negative; significant the other way is "against", whatever the verdict', () => {
  // a claim that points negative (headline.sign -1) is reported in the claimed direction
  const cut = G.gradeEntry({ id: 'c', verdict: 'underpowered', result: 'ES5 -9.2% [-11.4, -7.0]', headline: { sign: -1 } }, sound);
  assert.equal(cut.grade, 'leaning');
  assert.ok(cut.iv.eff > 0 && cut.iv.effLo > 0);
  assert.match(cut.basis, /claim points negative/);
  // a validated entry with a wholly negative interval is read as a negative claim (it passed its own test)
  const v = g('validated', 'year-end premium -14.4bp [-24.2, -4.8]');
  assert.equal(v.grade, 'strong'); assert.equal(v.iv.signInferred, true);
  // negative and significant against a positive claim: against, flagged, even when underpowered or unaudited
  const w = g('underpowered', 'S1 V-low -0.31R [-0.59, -0.02]');
  assert.equal(w.grade, 'against'); assert.equal(w.wrongWay, true);
  assert.equal(g('null', 'mean net -0.026% per trade [-0.044, -0.009]', null).grade, 'against');
  assert.equal(g('null', 'mean net -0.026% per trade [-0.044, -0.009]', reopened).grade, 'untested', 'a suspect test still argues nothing');
  // a sign set by a person settles "worse"-framing, and a positive estimate for a "do worse" claim is the wrong way
  const worse = G.gradeEntry({ id: 'w', verdict: 'null', result: 'pnl/trade +0.0024% [-0.0185, +0.0297]', headline: { sign: -1 } }, sound);
  assert.ok(worse.iv.eff < 0); assert.equal(worse.grade, 'against');
});

test('an entry can set its headline numbers or its grade by hand', () => {
  const h = G.gradeEntry({ id: 'h', verdict: 'null', result: 'b +0.186 placebo [+0.037, +0.342]', headline: { est: 0.186, lo: 0.037, hi: 0.342, note: 'R1 b' } }, sound);
  assert.equal(h.grade, 'leaning'); assert.equal(h.iv.source, 'entry'); assert.equal(h.iv.snippet, 'R1 b');
  const o = G.gradeEntry({ id: 'o', verdict: 'null', result: 'effect +0.001 [-0.05, +0.05]', grade: 'faint', gradeWhy: 'read by hand' }, sound);
  assert.equal(o.grade, 'faint'); assert.match(o.basis, /Set by hand: read by hand/);
  assert.equal(G.gradeEntry({ id: 'c', verdict: 'null', result: 'x', grade: 'context' }, sound).grade, 'against', 'context cannot be forced');
  assert.equal(G.gradeEntry({ id: 'k', verdict: 'null', result: 'log-loss gain -0.00142 [-0.00248, -0.00052]' }, sound).review, false, '"log-loss" is not negative framing');
});

test('the book entries the review flagged now read their headline', () => {
  const by = Object.fromEntries(G.gradeAll(DESK_EVIDENCE, EVIDENCE_AUDIT).map(r => [r.id, r]));
  const pos = by['positioning-into-release-direction'];
  if (pos) assert.equal(pos.iv.est, 0.064);
  const prd = by['post-release-drift-pooled'];
  if (prd) assert.equal(prd.iv.est, -0.049);
  const hr = by['hold-day-one-confirm-hold-r'];
  if (hr) assert.equal(hr.iv.est, 0.003);
});
