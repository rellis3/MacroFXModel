/**
 * fredFetch — pure helper test (forwardFillToDates). fetchFredSeries needs the
 * network, so it's validated on Railway, not here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardFillToDates } from './fredFetch.js';

test('forwardFillToDates: NaN before first obs, forward-fills over gaps', () => {
  const map = new Map([['2020-01-02', 10], ['2020-01-06', 12]]);
  const dates = ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07'];
  const out = forwardFillToDates(dates, map);
  assert.ok(Number.isNaN(out[0]), 'before first obs → NaN');
  assert.deepEqual(out.slice(1), [10, 10, 12, 12], 'carries last-on-or-before forward');
});

test('forwardFillToDates: empty map → all NaN, length preserved', () => {
  const out = forwardFillToDates(['2020-01-01', '2020-01-02'], new Map());
  assert.equal(out.length, 2);
  assert.ok(out.every(Number.isNaN));
});
