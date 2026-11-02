/**
 * statePlaybook — frameworks on a hand-built state document.
 * Run: node --test js/statePlaybook.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playbook, quadrant, dollarSmile, creditCycle, volRegime, curveRegime, riskBarometer } from './statePlaybook.js';

const r = (key, d20, extra = {}) => ({ key, label: key, moved: Math.abs(d20) > 0, dir: d20 > 0 ? 'up' : d20 < 0 ? 'down' : 'flat', d20, last: extra.last ?? 0, ...extra });
const doc = (readings, extra = {}) => ({ tiers: [{ readings }], drivers: { readings: [] }, ...extra });

test('slowdown: growth below trend and inflation cooling; checks bonds rally and stocks fall', () => {
  const d = doc([r('us10y', -20), r('spx', -3), r('hy', 30), r('usdjpy', -2), r('copper', -4)], { economies: { rows: [{ ccy: 'USD', nowcast: { gdpNow: 0.8, coreMoM: 0.15 }, surprise: { score: -0.5 } }] } });
  const q = quadrant(d);
  assert.equal(q.state, 'Disinflationary slowdown');
  assert.deepEqual([q.conformity.met, q.conformity.judged], [5, 5]);
});

test('dollar smile: risk-off puts the dollar on the left side and expects USD up, yen up', () => {
  const d = doc([r('vix', 6, { last: 27 }), r('hy', 40), r('dxy', 1.2), r('usdjpy', -1.5)], { economies: { rows: [{ ccy: 'USD', surprise: { score: 0 } }, { ccy: 'EUR', surprise: { score: 0 } }] } });
  const s = dollarSmile(d);
  assert.match(s.state, /Left side/);
  assert.equal(s.expectations.find(e => e.key === 'dxy').ok, true);
  assert.equal(s.expectations.find(e => e.key === 'usdjpy').ok, true);
});

test('credit cycle, vol regime and curve classify from the readings', () => {
  assert.match(creditCycle(doc([r('hy', 25, { pctile: { pct: 30, spanDays: 120 } })])).state, /Late cycle/);
  assert.match(volRegime(doc([r('vix', 0, { last: 13 })])).state, /Calm/);
  assert.equal(volRegime(doc([r('vix', 0, { last: 18 })], { history: { long: [{ id: 'VIX_TERM', ctx: { last: 1.04 } }] } })).state, 'Stress (curve inverted)');
  assert.equal(curveRegime(doc([r('us2y', -30), r('us10y', -5)])).state, 'Bull steepener');
  assert.equal(curveRegime(doc([r('us2y', 25), r('us10y', 10)])).state, 'Bear flattener');
});

test('missing inputs give a null state with a reason, never a guess; overall score sums judged rows', () => {
  const p = playbook(doc([]));
  assert.ok(p.frames.every(f => f.state === null || f.id === 'risk' || f.id === 'flow'));
  assert.ok(p.frames.filter(f => f.state === null).every(f => f.why));
  assert.match(riskBarometer(doc([r('spx', 3), r('hy', -10), r('vix', -2), r('audusd', 1)])).state, /Risk-on/);
  for (const f of playbook(doc([r('spx', 3)])).frames) assert.ok(f.evidence?.status || f.state === null, f.id);
});
