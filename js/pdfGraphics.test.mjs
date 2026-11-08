// js/pdfGraphics.js on synthetic operator lists (pdf.js numbers are stand-ins; the module only compares against the OPS it is given).
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectBoxes, clusterBoxes, graphicsRegions } from './pdfGraphics.js';

const OPS = { save: 1, restore: 2, transform: 3, paintFormXObjectBegin: 4, paintFormXObjectEnd: 5, setLineWidth: 6, setFillRGBColor: 7, setFillGray: 8, constructPath: 9, stroke: 10, closeStroke: 11, fill: 12, eoFill: 13, fillStroke: 14, eoFillStroke: 15, closeFillStroke: 16, closeEOFillStroke: 17, clip: 18, eoClip: 19, endPath: 20, paintImageXObject: 21, paintJpegXObject: 22, paintInlineImageXObject: 23, paintImageXObjectRepeat: 24, paintImageMaskXObject: 25, paintInlineImageXObjectGroup: 26, paintImageMaskXObjectGroup: 27, paintImageMaskXObjectRepeat: 28, moveTo: 100, lineTo: 101, curveTo: 102, curveTo2: 103, curveTo3: 104, rectangle: 105 };
// a tiny builder: ops.push([fn, args])
const build = list => ({ fn: list.map(x => x[0]), args: list.map(x => x[1]) });
const rect = (x, y, w, h) => [OPS.constructPath, [[OPS.rectangle], [x, y, w, h]]];
const line = (x0, y0, x1, y1) => [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x0, y0, x1, y1]]];
const img = (x, y, w, h, op = OPS.paintImageXObject) => [[OPS.save], [OPS.transform, [w, 0, 0, h, x, y]], [op, ['img']], [OPS.restore]];
const regions = (list, w = 612, h = 792) => { const b = build(list); return graphicsRegions(b.fn, b.args, OPS, w, h); };
const near = (a, b, d = 0.6) => a.every((v, i) => Math.abs(v - b[i]) <= d);

test('an image placed with a transform gives its box; save/restore keeps the matrix local', () => {
  const r = regions([...img(100, 400, 200, 150), [OPS.save], [OPS.transform, [1, 0, 0, 1, 0, 0]], [OPS.restore]]);
  assert.equal(r.length, 1);
  assert.ok(near(r[0].slice(0, 4), [100, 400, 300, 550]) && r[0][4] === 'i');
});

test('nested transforms and a form XObject compose (scale then translate)', () => {
  const r = regions([[OPS.save], [OPS.transform, [1, 0, 0, 1, 50, 100]], [OPS.paintFormXObjectBegin, [[2, 0, 0, 2, 0, 0], [0, 0, 1, 1]]], [OPS.transform, [50, 0, 0, 40, 10, 10]], [OPS.paintImageXObject, ['x']], [OPS.paintFormXObjectEnd, []], [OPS.restore]]);
  assert.equal(r.length, 1);
  // image unit square -> [10,10]..[60,50] inside the form, form scale 2 -> [20,20]..[120,100], then +[50,100]
  assert.ok(near(r[0].slice(0, 4), [70, 120, 170, 200]), JSON.stringify(r));
});

test('a chart made of many vector paths merges into one region; far-apart marks stay apart', () => {
  const list = [[OPS.setLineWidth, [1]], rect(100, 400, 300, 200), [OPS.stroke, []]];
  for (let i = 0; i < 40; i++) list.push(line(105 + i * 7, 405, 105 + i * 7 + 5, 405 + (i * 13) % 180), [OPS.stroke, []]);
  list.push(rect(100, 100, 100, 60), [OPS.stroke, []]);   // an unrelated frame far below
  const r = regions(list);
  assert.equal(r.length, 2, JSON.stringify(r));
  assert.ok(r.some(g => g[1] >= 399 && g[3] <= 601 && g[0] >= 99 && g[2] <= 401 && g[4] === 'v' && g[5] > 20));
});

test('left out: thin full-width rules, page borders, white fills, tiny marks, glyph-sized stencils', () => {
  const r = regions([
    [OPS.setLineWidth, [0.5]], line(40, 740, 572, 740), [OPS.stroke, []],            // header rule: thin and full width
    rect(0, 0, 612, 792), [OPS.stroke, []],                                           // page border
    [OPS.setFillRGBColor, [255, 255, 255]], rect(100, 300, 300, 200), [OPS.fill, []], // white panel behind something
    [OPS.setFillRGBColor, [0, 0, 0]], rect(200, 200, 3, 3), [OPS.fill, []],           // a bullet
    ...img(300, 100, 12, 12, OPS.paintImageMaskXObject),                              // bitmap-font glyph
  ]);
  assert.deepEqual(r, []);
});

test('a one-pixel-high stencil rule, a fraction bar and an underline are not figures, a plot frame is', () => {
  assert.deepEqual(regions([line(100, 500, 140, 500), [OPS.stroke, []], ...img(100, 400, 60, 1, OPS.paintImageMaskXObject)]), []);
  const r = regions([[OPS.setLineWidth, [1]], rect(100, 300, 200, 120), [OPS.stroke, []]]);
  assert.equal(r.length, 1);
});

test('clipping: an image larger than its clip rectangle counts only inside the clip', () => {
  const r = regions([[OPS.save], rect(100, 100, 100, 100), [OPS.clip, []], [OPS.endPath, []], [OPS.transform, [400, 0, 0, 400, 0, 0]], [OPS.paintImageXObject, ['x']], [OPS.restore]]);
  assert.equal(r.length, 1);
  assert.ok(near(r[0].slice(0, 4), [100, 100, 200, 200]), JSON.stringify(r));
});

test('a path that is only a clip is not painted', () => {
  assert.deepEqual(regions([rect(100, 100, 300, 300), [OPS.clip, []], [OPS.endPath, []]]), []);
});

test('rotated placement (landscape figure): the box is the bounding box of the rotated unit square', () => {
  const r = regions([[OPS.save], [OPS.transform, [0, 200, -150, 0, 400, 100]], [OPS.paintImageXObject, ['x']], [OPS.restore]]);
  assert.ok(near(r[0].slice(0, 4), [250, 100, 400, 300]), JSON.stringify(r));
});

test('clusterBoxes: gap rule, chain merging and bounded work on many boxes', () => {
  const bx = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, k: 'v', });
  assert.equal(clusterBoxes([bx(0, 0, 10, 10), bx(14, 0, 24, 10)], 6).length, 1);
  assert.equal(clusterBoxes([bx(0, 0, 10, 10), bx(30, 0, 40, 10)], 6).length, 2);
  assert.equal(clusterBoxes([bx(0, 0, 10, 10), bx(14, 0, 24, 10), bx(28, 0, 38, 10)], 6).length, 1);
  const many = Array.from({ length: 5000 }, (_, i) => bx((i % 100) * 5, Math.floor(i / 100) * 5, (i % 100) * 5 + 3, Math.floor(i / 100) * 5 + 3));
  assert.equal(clusterBoxes(many, 6).length, 1);
});

test('odd input never throws', () => {
  assert.deepEqual(graphicsRegions(null, null, OPS), []);
  assert.deepEqual(graphicsRegions([OPS.paintImageXObject], [undefined], OPS), []);
  assert.deepEqual(collectBoxes([OPS.constructPath], [[[OPS.rectangle], [NaN, 1, 2, 3]]], OPS), []);
});
