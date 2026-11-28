import test from 'node:test';
import assert from 'node:assert/strict';
import { ordinal } from './ordinal.js';
test('ordinal', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 41, 52, 83, 100, 101, 111, 0].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '41st', '52nd', '83rd', '100th', '101st', '111th', '0th']);
  assert.equal(ordinal(51.6), '52nd'); assert.equal(ordinal('–'), '–'); assert.equal(ordinal(null), '–'); assert.equal(ordinal('7'), '7th');
});
