import test from 'node:test';
import assert from 'node:assert/strict';
import { fontPx, lineHeight, fitText, rowLayout, gridLayout, boxFor, slotCache } from './helixLayout.js';

const meas = px => t => String(t).length * px * 0.6;      // a fake monospace: each char is 0.6 of the font size

test('fontPx reads the size from a canvas font string, with a fallback', () => {
  assert.equal(fontPx('600 13px ui-monospace,monospace'), 13);
  assert.equal(fontPx('10.5px mono'), 10.5);
  assert.equal(fontPx('bold serif'), 10);
  assert.equal(fontPx(undefined, 12), 12);
});

test('lineHeight scales with the font and rounds up; a bad size falls back', () => {
  assert.equal(lineHeight(11), 15);
  assert.equal(lineHeight(15), 21);          // the broadcast floor: rows grow with it
  assert.equal(lineHeight(0), 14);
  assert.ok(lineHeight(15) > lineHeight(11));
});

test('fitText keeps text that fits and cuts the rest with an ellipsis', () => {
  const m = meas(10);
  assert.equal(fitText('GOLD', m, 100), 'GOLD');
  const cut = fitText('A VERY LONG MARKET NAME', m, 60);
  assert.ok(cut.endsWith('…'));
  assert.ok(m(cut) <= 60);
  assert.equal(fitText('abc', m, 0), '');
  assert.equal(fitText('abc', m, 2), '');      // not even the ellipsis fits
});

test('rowLayout places each label after the last by measured width, and wraps', () => {
  const m = meas(10);       // 6px per char
  const r = rowLayout(['AB', 'CDE', 'F'], m, { x0: 10, gap: 4, lh: 14 });
  assert.deepEqual(r.items.map(i => i.x), [10, 26, 48]);
  assert.equal(r.rows, 1); assert.equal(r.w, 44);
  const w = rowLayout(['AAAA', 'BBBB', 'CCCC'], m, { x0: 0, gap: 6, maxW: 60, lh: 20 });
  assert.equal(w.rows, 2); assert.deepEqual(w.items.map(i => [i.x, i.y]), [[0, 0], [30, 0], [0, 20]]);
  assert.equal(w.h, 40);
  // a bigger font (the floor) moves the later labels right instead of drawing over them
  const small = rowLayout(['AB', 'CD'], meas(11)), big = rowLayout(['AB', 'CD'], meas(15));
  assert.ok(big.items[1].x > small.items[1].x);
  // one label wider than the row is cut
  const c = rowLayout(['X'.repeat(40)], m, { maxW: 60 }); assert.ok(c.items[0].w <= 60); assert.ok(c.items[0].text.endsWith('…'));
  assert.deepEqual(rowLayout([], m), { items: [], w: 0, h: 0, rows: 0 });
});

test('gridLayout makes columns as wide as their widest cell', () => {
  const m = meas(10);
  const g = gridLayout([['▲ GOLD 2.10x', '▲ NQ 1.80x'], ['▼ EURUSD 0.70x', '▲ ES 1.50x']], m, { x0: 24, y0: 100, gap: 18, lh: 15 });
  assert.equal(g.xs[0], 24); assert.equal(g.xs[1], 24 + 14 * 6 + 18);
  assert.equal(g.rowY(1), 115); assert.equal(g.h, 30);
  assert.equal(gridLayout([], m).w, 0);
});

test('boxFor sizes a box to its widest line and its line count', () => {
  const b = boxFor(['abc', 'abcdefghij'], meas(10), { px: 10, pad: 5 });
  assert.equal(b.w, 70); assert.equal(b.lh, 14); assert.equal(b.h, 2 * 14 + 10);
  assert.equal(boxFor([], meas(10), { minW: 30 }).w, 30);
});

test('slotCache recomputes only when the font or text of a slot changes', () => {
  const c = slotCache(); let n = 0; const f = () => ++n;
  assert.equal(c.get('a', '11px', 'x', f), 1);
  assert.equal(c.get('a', '11px', 'x', f), 1);
  assert.equal(c.get('a', '15px', 'x', f), 2);
  assert.equal(c.get('a', '15px', 'y', f), 3);
  assert.equal(c.get('b', '15px', 'y', f), 4);
  assert.equal(c.size(), 2); c.clear(); assert.equal(c.size(), 0);
});
