// js/terminal/spreadsCore.test.mjs: the maths behind the Spreads & ratios board. node --test js/terminal/spreadsCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeries, describe, percentileIn, rankPairs, caption, ghosts, customSeries, opAllowed, moveCorr, customRow, customCaption, scatterFrames, scatterBounds, fmtValue, changeOf, extremeness, evidenceFor, nth, SHORT_SESSIONS } from './spreadsCore.js';
import { PAIRS } from './spreadsLibrary.js';

const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10));
const bundle = (n, fns) => ({ ok: true, dates: days(n), series: Object.fromEntries(Object.entries(fns).map(([k, f]) => [k, Array.from({ length: n }, (_, i) => f(i))])) });

test('a ratio is built only where both legs exist and the divisor is positive; nothing is filled in', () => {
  const b = bundle(10, { a: i => (i === 3 ? null : 10 + i), b: i => (i === 5 ? 0 : 2) });
  const s = buildSeries(b, { x: 'a', y: 'b', op: 'ratio' });
  assert.equal(s.vals.length, 8);   // a is null on day 3, b is zero on day 5
  assert.ok(!s.dates.includes(b.dates[3]) && !s.dates.includes(b.dates[5]));
  assert.equal(s.vals[0], 5);
});
test('a diff of two yields is in basis points; a level is the series itself; a missing leg is null', () => {
  const b = bundle(5, { y10: () => 4.25, y2: () => 4.01, lvl: i => 100 + i });
  assert.ok(Math.abs(buildSeries(b, { x: 'y10', y: 'y2', op: 'diff' }).vals[0] - 24) < 1e-9);
  assert.deepEqual(buildSeries(b, { x: 'lvl', y: null, op: 'level' }).vals, [100, 101, 102, 103, 104]);
  assert.equal(buildSeries(b, { x: 'y10', y: 'nope', op: 'ratio' }), null);
});
test('percentileIn counts ties as half and describe refuses a short line', () => {
  const sorted = Float64Array.from([1, 2, 3, 4, 5]);
  assert.equal(percentileIn(sorted, 3), 0.5); assert.equal(percentileIn(sorted, 5), 0.9); assert.equal(percentileIn(sorted, 0), 0);
  assert.equal(describe({ dates: days(10), vals: Array(10).fill(1) }), null);
  const d = describe({ dates: days(300), vals: Array.from({ length: 300 }, (_, i) => i) });
  assert.ok(d.pct > 0.99 && d.z > 1.6 && d.n === 300 && d.v1w === 294 && d.v1m === 278);
});
test('extremeness is 0 in the middle and 1 at either end', () => { assert.equal(extremeness(0.5), 0); assert.equal(extremeness(0), 1); assert.equal(extremeness(1), 1); assert.equal(extremeness(null), 0); });
test('ranking puts the most extreme first, flags a short record, and lists a pair whose leg is missing', () => {
  const b = bundle(1200, { rsp: i => 100 + i * 0.1, spy: () => 100, us10y: i => 4 + (i % 7) * 0.01, us2y: () => 4 });
  const pairs = PAIRS.filter(p => ['rsp-spy', 'curve-2s10s', 'smh-spy'].includes(p.id));
  const r = rankPairs(b, pairs);
  assert.deepEqual(r.missing.map(m => m.pair.id), ['smh-spy']);
  assert.equal(r.rows[0].id, 'rsp-spy'); assert.equal(r.rows[0].rank, 1); assert.ok(r.rows[0].pct > 0.99);
  assert.equal(r.rows[0].short, 1200 < SHORT_SESSIONS);
  const short = rankPairs(bundle(300, { rsp: i => 100 + i, spy: () => 100 }), PAIRS.filter(p => p.id === 'rsp-spy'));
  assert.equal(short.rows[0].short, true);
});
test('a pair whose last common close is well behind the bundle is flagged stale', () => {
  const b = bundle(400, { rsp: i => 100 + i, spy: () => 100, gold: i => 1 + i, dxy: i => (i < 380 ? 100 : null) });
  const r = rankPairs(b, PAIRS.filter(p => ['rsp-spy', 'gold-dxy'].includes(p.id)));
  assert.equal(r.rows.find(x => x.id === 'gold-dxy').stale, true); assert.equal(r.rows.find(x => x.id === 'rsp-spy').stale, false);
});
test('the caption is rule-built from the numbers and reads the Evidence Book verdict, never a view', () => {
  const b = bundle(1200, { rsp: i => 100 + i * 0.1, spy: () => 100 });
  const row = rankPairs(b, PAIRS.filter(p => p.id === 'rsp-spy')).rows[0];
  const t = caption(row);
  assert.match(t, /RSP \/ SPY is at the \d+(st|nd|rd|th) percentile/); assert.match(t, /NULL/);
  assert.ok(!/\b(buy|sell|go long|go short|will rise|will fall)\b/i.test(t));
  assert.match(caption({ ...row, ev: [] }), /No test of this relationship is on file/);
});
test('evidenceFor reads the verdict from the book and drops an id that is not there', () => {
  const book = [{ id: 'x', verdict: 'underpowered', date: '2026-01-01', doc: 'd' }];
  const e = evidenceFor([{ id: 'x', about: 'a' }, { id: 'gone', about: 'b' }], book);
  assert.equal(e.length, 1); assert.equal(e[0].word, 'UNDERPOWERED');
});
test('ghosts: the last month and the earlier windows, each rebased to its own start', () => {
  const s = { dates: days(200), vals: Array.from({ length: 200 }, (_, i) => 100 + i) };
  const g = ghosts(s, { op: 'ratio' });
  assert.equal(g.unit, '%'); assert.equal(g.paths.length, 3); assert.equal(g.paths[0].pts[0], 0); assert.ok(g.paths[0].pts.at(-1) > 0);
  assert.equal(ghosts(s, { op: 'diff' }).unit, 'bp');
  assert.equal(ghosts({ dates: days(30), vals: Array(30).fill(1) }, { op: 'ratio' }).paths.length, 1);
});
test('X minus Y of two prices is refused with the reason; two yields are allowed; the same series twice is refused', () => {
  assert.equal(opAllowed('minus', 'gold', 'spx').ok, false); assert.match(opAllowed('minus', 'gold', 'spx').why, /yields or spreads/);
  assert.equal(opAllowed('minus', 'us10y', 'us2y').ok, true); assert.equal(opAllowed('ratio', 'gold', 'gold').ok, false); assert.equal(opAllowed('ratio', 'gold', 'spx').ok, true);
});
test('customSeries: ratio, minus (bp) and rebased, over a window; too few days is an error in words', () => {
  const b = bundle(500, { us10y: () => 4.3, us2y: () => 4.0, gold: i => 100 + i, spx: i => 100 + 2 * i });
  const m = customSeries(b, 'us10y', 'us2y', 'minus', 100); assert.ok(m.ok && Math.abs(m.series.vals[0] - 30) < 1e-9 && m.series.vals.length === 100);
  const r = customSeries(b, 'gold', 'spx', 'ratio', 0); assert.ok(r.ok && r.series.vals.length === 500 && r.xs.length === 500);
  const rb = customSeries(b, 'gold', 'spx', 'rebased', 200); assert.ok(rb.ok && rb.series.vals[0] === 0 && rb.series.vals.at(-1) < 0, 'spx grew faster than gold');
  assert.equal(customSeries(b, 'gold', 'spx', 'minus').ok, false); assert.equal(customSeries(bundle(10, { gold: i => i + 1, spx: i => i + 1 }), 'gold', 'spx', 'ratio').ok, false);
});
test('moveCorr: perfectly co-moving series correlate at 1, an inverse at -1, and too few days is null', () => {
  const x = Array.from({ length: 80 }, (_, i) => 100 * Math.exp(0.01 * Math.sin(i) * i / 10)), y = x.map(v => v * 2), z = x.map(v => 1e4 / v);
  assert.ok(moveCorr(x, y, 'gold', 'spx').r > 0.999); assert.ok(moveCorr(x, z, 'gold', 'spx').r < -0.999);
  assert.equal(moveCorr(x.slice(0, 10), y.slice(0, 10), 'gold', 'spx'), null);
  assert.ok(moveCorr(x, y, 'gold', 'spx', 30).n <= 30);
});
test('customCaption names the correlation as co-movement, and an untested pair points at the general null chips', () => {
  const b = bundle(1300, { gold: i => 100 + i, spx: i => 100 + Math.sin(i / 20) * 10 + i * 0.5 });
  const c = customSeries(b, 'gold', 'spx', 'ratio', 0), row = customRow(c);
  const t = customCaption({ row, pair: c.pair }, 'gold', 'spx', moveCorr(c.xs, c.ys, 'gold', 'spx'), moveCorr(c.xs, c.ys, 'gold', 'spx', 60), []);
  assert.match(t, /correlation of -?\d\.\d\d/); assert.match(t, /not which leads/); assert.match(t, /not one we have tested/);
});
test('scatter frames use only points up to their date; the axes only ever widen and never see a later frame', () => {
  const n = 300, xs = Array.from({ length: n }, (_, i) => i), ys = Array.from({ length: n }, (_, i) => (i === 299 ? 1e6 : i)), dates = days(n);
  const f = scatterFrames(xs, ys, dates, { span: 200, trail: 30, step: 10 });
  assert.equal(f.at(-1).i, n - 1);
  for (const fr of f) for (const [x] of fr.pts) assert.ok(x <= fr.i, 'a frame never holds a point from after its date');
  const early = scatterBounds(f, 2), later = scatterBounds(f, f.length - 1);
  assert.ok(early.y1 < 1000 && later.y1 > 1e5, 'the huge last point is invisible until its own frame');
  assert.ok(later.x0 <= early.x0 && later.x1 >= early.x1 && later.y0 <= early.y0 && later.y1 >= early.y1);
});
test('value and change formatting', () => {
  assert.equal(fmtValue({ op: 'diff' }, -12.4), '−12bp'); assert.equal(fmtValue({ op: 'diff' }, 24), '+24bp'); assert.equal(fmtValue({ op: 'ratio' }, 0.001547), '0.00155'); assert.equal(fmtValue({ op: 'level' }, 108.1749), '108.17');
  assert.equal(changeOf({ op: 'ratio' }, 1.1, 1).text, '+10%'); assert.equal(changeOf({ op: 'diff' }, 20, 31).text, '−11bp'); assert.equal(changeOf({ op: 'ratio' }, 1, null), null);
  assert.equal(nth(0.22), '22nd'); assert.equal(nth(0.11), '11th'); assert.equal(nth(1), '100th');
});
