// node --test js/terminal/analogueView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { analogueResultHtml, SETS } from './analogueView.js';

const R = (over = {}) => ({ horizon: 20, keys: ['vix', 'spx'], oneRegime: false, span: { from: '2012-01-03', to: '2024-05-02' }, episodes: [{ date: '2012-01-03' }],
  outcomes: { spx: { n: 8, up: 5, lo: -6.2, hi: 7.1, median: 1.4, each: [{ date: '2012-01-03', pct: 2.1 }, { date: '2020-03-02', pct: -6.2 }] }, vix: { n: 8, up: 3 } }, ...over });
test('shows the count, the range and each episode', () => {
  const h = analogueResultHtml(R());
  assert.match(h, /8<\/b> other occasions/); assert.match(h, /higher 5 times and lower 3/); assert.match(h, /-6\.2%/); assert.match(h, /2020-03-02 -6\.2%/);
});
test('a single stretch of history is called ONE observation', () => {
  assert.match(analogueResultHtml(R({ oneRegime: true })), /ONE observation, not 8/);
  assert.ok(!/ONE observation/.test(analogueResultHtml(R())));
});
test('no result says so plainly, and unanimous episodes are flagged as a small-count accident', () => {
  assert.match(analogueResultHtml(null), /Not enough history/);
  assert.match(analogueResultHtml(R({ outcomes: { spx: { n: 6, up: 6, lo: 0.5, hi: 4, median: 2, each: [{ date: '2013-01-02', pct: 1 }] } } })), /accident of a small count/);
});
test('the market sets each name at least two markets', () => { for (const s of SETS) assert.ok(s.keys.length >= 3, s.id); });
