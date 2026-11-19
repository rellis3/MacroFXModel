import assert from 'node:assert/strict';
import { decode, aggregate, imbalances, profile, tpo, tpoLetter, hhmm, decimals } from './footprintCore.js';

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
// 6J: a 0.0000005 tick must keep neighbouring prices apart.
const yen = decode({ tick: 0.0000005, bars: [[810, 0.0065, 0.006501, 0.0065, 0.0065005, [[0, 4, 1], [1, 2, 8], [2, 0, 3]]]] });
assert.equal(yen[0].cells.size, 3);
assert.deepEqual(yen[0].cells.get(0.0065005), { s: 2, b: 8 });
const yenA = aggregate(yen, { minutes: 5, rowTicks: 1, tick: 0.0000005 });
assert.equal(yenA[0].cells.size, 3);
assert.equal(yenA[0].vol, 18);
assert.equal(aggregate(yen, { minutes: 5, rowTicks: 2, tick: 0.0000005 })[0].cells.size, 2);
assert.equal(imbalances(yen[0].cells, { ratio: 2, minVol: 8, rowStep: 0.0000005, stack: 2 }).mark.get(0.0065005), 'buy');
assert.equal(decimals(0.25), 2); assert.equal(decimals(0.1), 1); assert.equal(decimals(1), 0); assert.equal(decimals(0.00005), 5); assert.equal(decimals(0.0000005), 7);
// TPO: three 30-minute letters from 13:30. A trades 100-101, B 100.5-101.5, C 101.5-102 -> IB is A+B = 100..101.5.
const T = (m, l, h) => ({ m, o: l, h, l, c: h, cells: new Map() });
const tp = tpo([T(810, 100, 101), T(825, 100, 100.5), T(840, 100.5, 101.5), T(870, 101.5, 102)], { start: 810, period: 30, step: 0.5, ib: 60 });
assert.equal(tpoLetter(0), 'A'); assert.equal(tpoLetter(2), 'C'); assert.equal(tpoLetter(26), 'a');
assert.deepEqual(tp.rows.map(r => [r.p, r.letters.join('')]), [[100, '0'], [100.5, '01'], [101, '01'], [101.5, '12'], [102, '2']]);
assert.equal(tp.n, 8);
assert.equal(tp.poc, 101);                                   // three rows hold 2 letters; 101 is nearest the middle (101)
assert.deepEqual(tp.ib, { hi: 101.5, lo: 100, complete: true, partial: false, up: true, down: false });
assert.equal(tpo([T(840, 100, 101)], { start: 810 }).ib.partial, true);   // A missing
assert.equal(tp.singles, 2);
assert.equal(tp.periods.length, 3); assert.equal(tp.periods[2].m, 870);
assert.ok(tp.val <= tp.poc && tp.vah >= tp.poc);
assert.equal(tpo([], { start: 810 }).poc, null);
// a session still inside its first hour has no complete IB
assert.equal(tpo([T(810, 100, 101)], { start: 810 }).ib.complete, false);
console.log('footprintCore ok');
