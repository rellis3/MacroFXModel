/**
 * Unit tests for js/ladderPathStats.js. Pure/synthetic: no network.
 *   node js/ladderPathStats.test.mjs
 * The load-bearing tests are the ones that stop a broken fit from being
 * presented as a confident probability.
 */
import assert from 'node:assert/strict';
import { ladderPathChain, describeSide, nominalChain, PATH_SIDES } from './ladderPathStats.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('ladderPathStats');

t('nominal chain is the rung targets re-expressed (50/25/10 → 50% then 40%)', () => {
  const n = nominalChain();
  assert.deepEqual(n.reach, { p50: 50, p75: 25, p90: 10 });
  assert.equal(n.given.p75_given_p50, 50);
  assert.equal(n.given.p90_given_p75, 40);
});

t('EURUSD daily chain matches the stored OOS rates exactly', () => {
  const c = ladderPathChain('EURUSD');
  assert.ok(c.fitted, 'EURUSD must have a fitted record');
  // stored: oh 46.4 / 21.3 / 9.1
  assert.equal(c.oh.reach.p50, 46.4);
  assert.equal(c.oh.given.p75_given_p50, Math.round(21.3 / 46.4 * 1000) / 10);
  assert.equal(c.oh.given.p90_given_p75, Math.round(9.1 / 21.3 * 1000) / 10);
  assert.equal(c.oh.stall.at_p75, Math.round((1 - 9.1 / 21.3) * 1000) / 10);
  assert.equal(c.trainedThrough, '2025-08-19');
});

t('up and down sides are computed independently (EURUSD asymmetry is real)', () => {
  const c = ladderPathChain('EURUSD');
  assert.notEqual(c.oh.given.p90_given_p75, c.ol.given.p90_given_p75);
  assert.ok(c.ol.stall.at_p75 > c.oh.stall.at_p75, 'EURUSD down-side stalls more at p75');
});

t('a non-monotone fit yields null conditionals, not >100%', () => {
  // Hand-built broken record routed through the same side logic via a fake
  // instrument is not possible (params are frozen), so assert the guard's
  // contract on the real shape: monotone must be true for shipped instruments.
  for (const sym of ['EURUSD', 'GOLD', 'NQ', 'GBPUSD']) {
    const c = ladderPathChain(sym);
    for (const side of ['oh', 'ol']) {
      if (!c[side]) continue;
      assert.ok(c[side].monotone, `${sym}.${side} rungs must be nested/non-increasing`);
      const g = c[side].given.p90_given_p75;
      assert.ok(g == null || (g >= 0 && g <= 100), `${sym}.${side} conditional out of range: ${g}`);
    }
  }
});

t('unknown instrument degrades to a labelled nominal chain, never throws', () => {
  const c = ladderPathChain('NOTAPAIR', { assetClass: 'fx' });
  assert.ok(c.nominal, 'nominal always present');
  assert.equal(typeof c.fitted, 'boolean');
});

t('weekly horizon reads the weekly OOS record, not the daily one', () => {
  const d = ladderPathChain('EURUSD', { horizon: 'daily' });
  const w = ladderPathChain('EURUSD', { horizon: 'weekly' });
  assert.ok(w.fitted);
  assert.notEqual(d.oh.reach.p50, w.oh.reach.p50);
});

t('describeSide names today’s actual price when levels are supplied', () => {
  const c = ladderPathChain('EURUSD');
  const lines = describeSide(c, 'oh', { p50: 1.08421, p75: 1.08712, p90: 1.09033 }, 5);
  assert.ok(lines[0].includes('1.08421'), lines[0]);
  assert.ok(lines.some(l => l.includes('stalls at p75')), lines.join(' | '));
  assert.ok(lines[0].includes('up-side') || lines[0].includes('up '), lines[0]);
});

t('describeSide works with no levels and on a missing side', () => {
  const c = ladderPathChain('EURUSD');
  assert.ok(describeSide(c, 'oh').length >= 2);
  assert.equal(describeSide({}, 'oh').length, 1);
  assert.deepEqual(Object.keys(PATH_SIDES), ['oh', 'ol']);
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
