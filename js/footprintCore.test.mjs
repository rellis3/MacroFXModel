import assert from 'node:assert/strict';
import { decode, aggregate, imbalances, profile, hhmm } from './footprintCore.js';

const file = { tick: 0.25, bars: [
  [810, 100, 100.5, 100, 100.25, [[0, 5, 1], [1, 2, 30], [2, 0, 12]]],
  [811, 100.25, 100.75, 100.25, 100.75, [[0, 4, 4], [1, 1, 20], [2, 9, 2]]],
] };
const bars = decode(file);
assert.equal(bars.length, 2);
assert.deepEqual(bars[0].cells.get(100.25), { s: 2, b: 30 });

const a = aggregate(bars, { minutes: 5, rowTicks: 1, tick: 0.25 });
assert.equal(a.length, 1);
assert.equal(a[0].m, 810); assert.equal(a[0].o, 100); assert.equal(a[0].c, 100.75); assert.equal(a[0].h, 100.75);
assert.equal(a[0].vol, 5 + 1 + 2 + 30 + 12 + 4 + 4 + 1 + 20 + 9 + 2);
assert.deepEqual(a[0].cells.get(100.25), { s: 6, b: 34 });
assert.equal(a[0].poc, 100.25);

const a2 = aggregate(bars, { minutes: 1, rowTicks: 2, tick: 0.25 });
assert.equal(a2.length, 2);
assert.deepEqual(a2[0].cells.get(100), { s: 7, b: 31 });   // 100 and 100.25 merged into the 0.5 row at 100

// Diagonal: buy at 100.25 (30) vs sell at 100 (5) -> 6x buy imbalance; buy at 100.5 (12) vs sell at 100.25 (2) -> buy.
const im = imbalances(bars[0].cells, { ratio: 3, minVol: 10, rowStep: 0.25, stack: 2 });
assert.equal(im.mark.get(100.25), 'buy');
assert.equal(im.mark.get(100.5), 'buy');
assert.equal(im.mark.has(100), false);
assert.deepEqual(im.stacks, [{ side: 'buy', lo: 100.25, hi: 100.5, n: 2 }]);

const pr = profile(a);
assert.equal(pr.poc, 100.25);
assert.ok(pr.val <= pr.poc && pr.vah >= pr.poc);
assert.equal(hhmm(810), '13:30');
console.log('footprintCore ok');
