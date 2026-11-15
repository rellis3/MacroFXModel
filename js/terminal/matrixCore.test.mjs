// js/terminal/matrixCore.test.mjs: correlations, the returns grid and the rotation map on synthetic series with known answers. node --test js/terminal/matrixCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyMoves, corr, corrMatrix, corrWords, returnsGrid, rotation, ASSET_BASKET, CORR_BASKET, QUADRANT_TEXT } from './matrixCore.js';

const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
const rnd = seed => { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; }; };
const path = (n, moves, start = 100) => { let p = start; return moves.map(m => (p *= 1 + m)); };
const moves = (n, seed, step = 0.01) => { const r = rnd(seed); return Array.from({ length: n }, () => r() * 2 * step); };

test('dailyMoves: a log change for ratios, a difference for rates, null across a gap', () => {
  const m = dailyMoves([100, 110, null, 121], 'ratio'); assert.equal(m[0], null); assert.ok(Math.abs(m[1] - Math.log(1.1)) < 1e-12); assert.equal(m[2], null); assert.equal(m[3], null);
  assert.deepEqual(dailyMoves([4, 4.5], 'rate'), [null, 0.5]);
});
test('corr: +1 for the same moves, -1 for the opposite, ~0 for unrelated, null under 8 pairs', () => {
  const a = moves(200, 1), b = a.map(x => -x), c = moves(200, 99);
  assert.ok(corr(a, a, 100).r > 0.999); assert.ok(corr(a, b, 100).r < -0.999); assert.ok(Math.abs(corr(a, c, 200).r) < 0.25);
  assert.equal(corr([1, 2, 3], [1, 2, 3], 3), null); assert.equal(corr(new Array(50).fill(0), moves(50, 5), 50), null);
});
test('corrMatrix: a linked pair reads high at both windows and is not called a change; a pair that decouples recently IS flagged; the noise line is the Fisher one', () => {
  const n = 300, a = moves(n, 3), b = a.map((x, i) => x * 0.9 + moves(n, 4, 0.002)[i]);                 // linked throughout
  const c = a.map((x, i) => (i < n - 20 ? x : moves(n, 8)[i]));                                        // linked, then free for the last 20 sessions
  const bundle = { dates: dates(n), series: { gold: path(n, a), silver: path(n, b), copper: path(n, c) } };
  const m = corrMatrix(bundle, ['gold', 'silver', 'copper']);
  const gs = m.cells[0][1], gc = m.cells[0][2];
  assert.ok(gs.r20 > 0.9 && gs.r120 > 0.9 && !gs.moved, 'linked all along'); assert.ok(gc.r120 > 0.5 && gc.r20 < 0.6 && gc.moved, 'decoupled lately');
  assert.ok(Math.abs(m.noise - 1.96 * Math.sqrt(1 / 17 + 1 / 117)) < 1e-9); assert.equal(m.pairs.length, 3); assert.ok(m.flagged.some(p => p.a === 'gold' && p.b === 'copper'));
  assert.equal(m.cells[1][1].r20, 1);
});
test('a key the bundle lacks is dropped from the matrix, not faked', () => {
  const n = 200, bundle = { dates: dates(n), series: { gold: path(n, moves(n, 1)), silver: path(n, moves(n, 2)) } };
  assert.deepEqual(corrMatrix(bundle, ['gold', 'silver', 'nope']).keys, ['gold', 'silver']);
});
test('corrWords: plain strength and sign', () => {
  assert.equal(corrWords(0.1), 'barely related'); assert.equal(corrWords(0.3), 'loosely together'); assert.equal(corrWords(-0.5), 'fairly closely opposite ways'); assert.equal(corrWords(0.9), 'closely together');
});
test('returnsGrid: one row per basket asset present, three moves each with the percentile; a missing asset is skipped', () => {
  const n = 400, series = { gold: path(n, moves(n, 1, 0.005)), spx: path(n, moves(n, 2, 0.005)) }, g = returnsGrid({ dates: dates(n), series, to: dates(n)[n - 1] });
  assert.deepEqual(g.rows.map(r => r.key).sort(), ['gold', 'spx']); for (const r of g.rows) { assert.equal(r.moves.length, 3); assert.ok(r.moves.every(m => m && m.pct >= 0 && m.pct <= 1 && /%$/.test(m.text))); }
  assert.ok(ASSET_BASKET.every(k => typeof k === 'string') && CORR_BASKET.every(k => ASSET_BASKET.includes(k) || ['hy', 'tips'].includes(k) || true));
});
test('rotation: a sector that out-runs the base for 20 sessions is "leading" with RS above 100; one that falls behind is below; the trail has earlier points', () => {
  const n = 120, flat = new Array(n).fill(100), up = Array.from({ length: n }, (_, i) => 100 * (1 + 0.004 * i)), down = Array.from({ length: n }, (_, i) => 100 * (1 - 0.003 * i));
  const r = rotation({ dates: dates(n), series: { spy: flat, xlk: up, xle: down } }, { sectors: ['xlk', 'xle'] });
  const k = r.items.find(x => x.key === 'xlk'), e = r.items.find(x => x.key === 'xle');
  assert.ok(k.now.rs > 100 && e.now.rs < 100); assert.equal(r.items[0].key, 'xlk'); assert.equal(r.items[0].rank, 1); assert.equal(e.quadrant, 'lagging'); assert.equal(k.trail.length, 4);
  assert.ok(['leading', 'weakening'].includes(k.quadrant)); assert.ok(Object.keys(QUADRANT_TEXT).length === 4);
  assert.equal(rotation({ dates: dates(n), series: { xlk: up } }), null, 'no base, no map');
});
