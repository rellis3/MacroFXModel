// js/terminal/unusualCore.test.mjs: the unusualness ranking on synthetic series with known answers. node --test js/terminal/unusualCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pctRank, change, compact, movesAt, fmtMove, analyse, rankBundle, expectedByChance, groupCounts, trustNote, MIN_N } from './unusualCore.js';
import { metaFor, SERIES, GROUPS } from './insightSeries.js';

const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
// a deterministic pseudo-random walk (no Math.random: the test must be repeatable)
const walk = (n, step = 0.01, start = 100, seed = 7) => { let s = seed, p = start; const out = []; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) % 4294967296; p *= 1 + ((s / 4294967296) - 0.5) * 2 * step; out.push(p); } return out; };

test('pctRank: ties count half, the extremes are 0 and 1', () => {
  assert.equal(pctRank([1, 2, 3, 4], 0), 0); assert.equal(pctRank([1, 2, 3, 4], 5), 1);
  assert.equal(pctRank([1, 2, 2, 3], 2), 0.5); assert.equal(pctRank([], 1), null);
});
test('change: a difference for rates, a log change for prices, null when a price is not positive', () => {
  assert.equal(change(4, 4.25, 'rate'), 0.25); assert.ok(Math.abs(change(100, 110, 'ratio') - Math.log(1.1)) < 1e-12); assert.equal(change(0, 1, 'ratio'), null);
});
test('compact drops nulls and keeps dates aligned; movesAt reads k observations back', () => {
  const c = compact(['a', 'b', 'c', 'd'], [1, null, 3, '']); assert.deepEqual(c, { d: ['a', 'c'], v: [1, 3] });
  const m = movesAt([1, 2, 4, 8], 2, 'rate'); assert.deepEqual(m.all, [3, 6]); assert.equal(m.last, 6);
});
test('fmtMove: basis points for rates, percent for ratios, signed', () => {
  assert.equal(fmtMove(0.125, { kind: 'rate' }), '+12.5bp'); assert.equal(fmtMove(-0.5, { kind: 'rate' }), '-50.0bp');
  assert.equal(fmtMove(Math.log(1.05), { kind: 'ratio' }), '+5.00%'); assert.equal(fmtMove(NaN, { kind: 'ratio' }), 'n/a');
});
test('a series that jumps on the last day ranks first, with the 1-day move as the driver and the number in the words', () => {
  const n = 600, d = dates(n), calm = walk(n, 0.005), big = calm.slice(); big[n - 1] = big[n - 2] * 1.12;
  const r = rankBundle({ dates: d, series: { gold: big, silver: walk(n, 0.005, 20, 11), nq: walk(n, 0.005, 1000, 13) }, to: d[n - 1] });
  assert.equal(r.rows[0].key, 'gold'); assert.equal(r.rows[0].driver.id, 'm1'); assert.ok(r.rows[0].score > 0.99);
  assert.match(r.rows[0].driver.text, /1-day move of \+12\.0%/); assert.equal(r.rows[0].rank, 1);
});
test('a level series is also ranked by where it sits; a price series is NOT (a trending price is always at a high)', () => {
  const n = 500, d = dates(n), up = Array.from({ length: n }, (_, i) => 100 + i * 0.5);   // a steady uptrend: the last level is the highest ever
  const vix = analyse('vix', d, up), gold = analyse('gold', d, up);
  assert.ok(vix.level && vix.level.side === 'high' && vix.level.ext > 0.99); assert.equal(gold.level, null);
  assert.ok(gold.drivers.every(x => x.id.startsWith('m')), 'a price is ranked on its moves only');
});
test('a steady series is not unusual: its score is well inside the range of its own moves', () => {
  const n = 800, d = dates(n), a = analyse('gold', d, walk(n, 0.01, 100, 3));
  assert.ok(a.score < 0.99, `score ${a.score}`);
});
test('too short a history is listed apart and never ranked; a short one is ranked but flagged', () => {
  const d = dates(MIN_N - 5), r = rankBundle({ dates: d, series: { gold: walk(MIN_N - 5) } }); assert.equal(r.rows.length, 0); assert.equal(r.tooShort.length, 1);
  const n = 300, d2 = dates(n), r2 = rankBundle({ dates: d2, series: { gold: walk(n) } }); assert.equal(r2.rows[0].short, true); assert.match(trustNote(r2.rows[0]), /short history/);
});
test('a series whose last value is old is flagged stale, with the date', () => {
  const n = 400, d = dates(n), v = walk(n); for (let i = n - 10; i < n; i++) v[i] = null;
  const a = analyse('gold', d, v, { refDate: d[n - 1] }); assert.equal(a.stale, d[n - 11]); assert.match(trustNote(a), /last value is from/);
});
test('nulls inside a series are skipped, an all-null series gives nothing', () => {
  const n = 400, d = dates(n), v = walk(n); v[100] = null; v[200] = null;
  assert.equal(analyse('gold', d, v).n, n - 2); assert.equal(analyse('gold', d, new Array(n).fill(null)), null);
});
test('expectedByChance counts the measures and the hits; groupCounts totals them by group', () => {
  const n = 500, d = dates(n), series = {}; for (const [i, k] of ['gold', 'silver', 'nq', 'spx', 'vix'].entries()) series[k] = walk(n, 0.01, 100, 20 + i);
  const r = rankBundle({ dates: d, series }), e = expectedByChance(r.rows, 0.95);
  assert.equal(e.measures, r.rows.reduce((a, x) => a + x.drivers.length, 0)); assert.ok(Math.abs(e.expected - e.measures * 0.05) < 1e-9);
  const g = groupCounts(r.rows, GROUPS); assert.equal(g.reduce((a, x) => a + x.n, 0), r.rows.length);
});
test('unknown keys are shown under Other with their key, and the table has no duplicate key', () => {
  const m = metaFor('zzz9'); assert.equal(m.group, 'other'); assert.equal(m.label, 'zzz9');
  assert.equal(new Set(SERIES.map(s => s.key)).size, SERIES.length);
  for (const s of SERIES) { assert.ok(GROUPS[s.group], s.key); assert.ok(['rate', 'ratio'].includes(s.kind), s.key); assert.ok(s.label.length > 2 && !/_/.test(s.label), `${s.key}: a plain label`); }
});
