// node --test js/terminal/ccyCardCore.test.mjs: the Currencies card's wording and fit rules (review 2026-11-27).
import test from 'node:test';
import assert from 'node:assert/strict';
import { plainRuling, pairFit, engineSplit } from './ccyCardCore.js';

test('plainRuling: bracketed source lists go, ids in sentences become words, ordinary brackets stay', () => {
  assert.equal(plainRuling('Fed priced to hike (72.5% by 2027-12) and global-read 0.82 (currency ruling, fed-path, policy-rates).'),
    'Fed priced to hike (72.5% by 2027-12) and global read 0.82.');
  assert.equal(plainRuling('the Fed path (fed-path 2026-11-24) prices 50bp'), 'the Fed path prices 50bp');
  assert.equal(plainRuling('the BoC hiked (boc/latest, world-rates)'), 'the BoC hiked');
  assert.equal(plainRuling('No RBNZ read (rbnz/latest empty), hawkishScore 0.55, econ-trend -1, econ-surprise -0.23'),
    'No RBNZ read, hawkish score 0.55, economic trend -1, economic surprise -0.23');
  assert.equal(plainRuling('real yield -0.59 (z -2.56) and a weaken tell (risk-off)'), 'real yield -0.59 (z -2.56) and a weaken tell (risk-off)');
  assert.equal(plainRuling('only 0.10 gap-FX correlation'), 'only 0.10 yield-gap to FX correlation');
  assert.equal(plainRuling(''), ''); assert.equal(plainRuling(null), '');
});
test('plainRuling: a "DXY" above 110 is the Fed broad dollar index and is named so; an ICE-sized DXY is left alone', () => {
  assert.match(plainRuling('DXY 123.60 +0.95/5d'), /^the broad dollar index \(Fed\) 123\.60/);
  assert.equal(plainRuling('DXY 99.8'), 'DXY 99.8');
});
test('pairFit: judged on the pair, so a cross reads the same under both currencies', () => {
  const bias = { GBP: -1, JPY: -1, USD: 2, EUR: -1 }, of = c => bias[c];
  assert.deepEqual(pairFit('GBPJPY', -1, of), { state: 'even', gap: 0 }, 'GBP -1, JPY -1: no bias gap, under either currency');
  assert.deepEqual(pairFit('GBPUSD', -1, of), { state: 'fits', gap: -3 });
  assert.deepEqual(pairFit('EURUSD', 1, of), { state: 'against', gap: -3 });
  assert.deepEqual(pairFit('NZDUSD', -1, of), { state: 'none', gap: null }, 'no ruling on one leg');
});
test('engineSplit: the engine on the other side from the book (neutral counts as a side)', () => {
  assert.equal(engineSplit(-1, { dir: 'BULLISH' }), true);
  assert.equal(engineSplit(-1, { dir: 'BEARISH' }), false);
  assert.equal(engineSplit(0, { dir: 'NEUTRAL' }), false);
  assert.equal(engineSplit(2, { dir: 'NEUTRAL' }), true);
  assert.equal(engineSplit(null, { dir: 'BULLISH' }), false); assert.equal(engineSplit(1, null), false);
});
