// Tests for js/travelRead.js — the structural travel read.
//
// The bug this module was written for: the daily HMM splits its states by RETURN
// VARIANCE, so a quiet one-way grind is filed as "RANGE" and the page then showed no
// direction for it at all. USDCHF on 2026-09-29 was +8.45% since March, sitting at 99%
// of its range in the 7th vol percentile, labelled RANGE 92%.
//
// Two rules matter more than the arithmetic:
//   1. the efficiency ratio is judged against a RANDOM WALK, never a bare threshold;
//   2. position sets the direction, efficiency only sets the weight — so chopping to the
//      top of a range is not a trend.
//
// Run:  node --test js/travelRead.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { travelRead, efficiency, rwEfficiency } from './travelRead.js';

const line = (n, step) => Array.from({ length: n }, (_, i) => 1 + i * step);
const chop = (n, amp) => Array.from({ length: n }, (_, i) => 1 + Math.sin(i * 1.7) * amp);

test('the random-walk baseline is 1/sqrt(n), not a made-up threshold', () => {
  // A driftless walk has E|net| = sigma*sqrt(n)*sqrt(2/pi) and E[path] = n*sigma*sqrt(2/pi),
  // so the expected ratio is exactly 1/sqrt(n). Over 42 bars that is 0.154 — which is why
  // "efficiency ratio > 0.20" would have been noise dressed up as a signal.
  assert.equal(rwEfficiency(4).toFixed(4), '0.5000');
  assert.equal(rwEfficiency(100).toFixed(4), '0.1000');
  assert.ok(Math.abs(rwEfficiency(42) - 0.1543) < 1e-3);
  assert.equal(rwEfficiency(0), 1, 'no bars must not divide by zero');
});

test('a simulated random walk scores near 1x its own baseline, not near zero', () => {
  // If this drifts far from 1.0 the weighting curve is miscalibrated and either every
  // pair would qualify or none would.
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5;
  const mults = [];
  for (let trial = 0; trial < 40; trial++) {
    const px = [1];
    for (let i = 0; i < 63; i++) px.push(px[px.length - 1] * (1 + rnd() * 0.01));
    const r = travelRead(px);
    if (r) mults.push(r.mult);
  }
  const mean = mults.reduce((s, x) => s + x, 0) / mults.length;
  assert.ok(mean > 0.4 && mean < 2.0, `random walks averaged ${mean.toFixed(2)}x baseline`);
});

test('a straight-line grind up is found, which is the whole point', () => {
  const r = travelRead(line(70, 0.001));
  assert.equal(r.dir, 'up');
  assert.equal(r.pos, 1);
  assert.equal(r.weight, 1);
  assert.ok(r.mult > 3, 'a straight line should dwarf a random walk');
  assert.match(r.detail, /as directly as a random walk/);
});

test('and a straight-line grind down, symmetrically', () => {
  const r = travelRead(line(70, -0.001));
  assert.equal(r.dir, 'down');
  assert.equal(r.pos, 0);
  assert.equal(r.weight, 1);
});

test('oscillation is flat however wide it swings', () => {
  for (const amp of [0.002, 0.01, 0.05]) {
    const r = travelRead(chop(70, amp));
    assert.equal(r.dir, 'flat', `amp ${amp} should not read as a trend`);
    assert.equal(r.weight, 0);
  }
});

// THE RULE THAT KEEPS THIS HONEST. EURCHF sat at 97% of its range on 2026-09-29 having
// chopped there, and must NOT read as a trend. Position says where price is; efficiency
// says whether the journey meant anything.
test('chopping to the top of the range is not a trend', () => {
  const px = [...chop(60, 0.02), 1.0 + 0.02];
  const r = travelRead(px);
  assert.ok(r.pos > 0.9, 'this series really does end at the top');
  assert.equal(r.dir, 'flat', 'but it chopped there, so no direction');
  assert.match(r.detail, /chopped there/);
});

// A repeating +a, +a, -b staircase has net/path = (2a-b)/(2a+b) per cycle, independent of
// how many cycles there are — so its efficiency ratio is known in closed form and the
// weighting curve can be checked against theory rather than against a tuned fixture.
const zig = (n, b, s = 0.001) => {
  const px = [1];
  for (let i = 0; px.length < n; i++) px.push(px[px.length - 1] + (i % 3 === 2 ? -b : 1) * s);
  return px;
};

test('the measured efficiency matches the closed form for a known staircase', () => {
  for (const b of [1.289, 1.1688, 1.05, 0.9]) {
    const predicted = (2 - b) / (2 + b);
    assert.ok(Math.abs(travelRead(zig(70, b)).eff - predicted) < 1e-3,
      `b=${b} should measure ${predicted.toFixed(4)}`);
  }
});

test('weight grades with how clean the move was, it is not a switch', () => {
  // Same direction and near-identical position in range; only the DIRECTNESS differs,
  // which is exactly what the weight is supposed to isolate.
  const grades = [1.289, 1.1688, 1.05].map(b => travelRead(zig(70, b)));
  for (const g of grades) assert.equal(g.dir, 'up');
  assert.ok(grades[0].weight > 0 && grades[0].weight < 1, `expected a mid weight, got ${grades[0].weight}`);
  assert.ok(grades[0].weight < grades[1].weight, 'a less direct climb must count for less');
  assert.ok(grades[1].weight <= grades[2].weight);
  assert.equal(travelRead(line(70, 0.001)).weight, 1, 'a straight line is the top of the scale');
});

test('a staircase barely beating a random walk is held flat, not called a trend', () => {
  // b = 1.45 gives an efficiency of 0.159 against a 0.154 baseline: a coin flip that
  // happens to end high. It sits at 88% of its range and must still read flat.
  const r = travelRead(zig(70, 1.45));
  assert.ok(r.pos > 0.8, 'it really does end near the top');
  assert.ok(r.mult < 1.15);
  assert.equal(r.dir, 'flat');
});

test('thin, empty and dirty input returns null instead of a confident read', () => {
  assert.equal(travelRead([1, 2, 3]), null);
  assert.equal(travelRead([]), null);
  assert.equal(travelRead(null), null);
  assert.equal(travelRead(undefined), null);
  assert.equal(travelRead('nope'), null);
  assert.equal(travelRead(Array(29).fill(1).map((_, i) => 1 + i * 0.01)), null, '29 bars is too thin');
});

test('a dead-flat series has no position and must not divide by zero', () => {
  assert.equal(travelRead(Array(70).fill(1.2345)), null);
});

test('NaNs and nulls in the feed are dropped, not propagated', () => {
  const dirty = line(70, 0.001);
  dirty[10] = null; dirty[20] = NaN; dirty[30] = undefined; dirty[40] = 'x';
  const r = travelRead(dirty);
  assert.ok(r, 'a few bad bars must not kill the read');
  assert.equal(r.dir, 'up');
});

test('efficiency() is net over total travel, with the degenerate cases guarded', () => {
  assert.equal(efficiency([1, 2, 3, 4]), 1, 'monotonic = perfectly efficient');
  assert.equal(efficiency([1, 2, 1]), 0, 'round trip = zero net travel');
  assert.equal(efficiency([5, 5, 5]), null, 'no movement at all has no ratio');
  assert.equal(efficiency([1]), null);
  assert.equal(efficiency(null), null);
});

// ORIENTATION. OANDA v3 returns candles ascending; /api/ohlc hands them back NEWEST
// first. Passing the wrong way round silently inverts the answer, and this repo has
// already shipped that bug on a different feed.
test('reversing the series reverses the direction — orientation is not guessable', () => {
  assert.equal(travelRead(line(70, 0.001)).dir, 'up');
  assert.equal(travelRead(line(70, 0.001).reverse()).dir, 'down');
});

test('windows are configurable and are honoured', () => {
  const px = line(200, 0.001);
  assert.equal(travelRead(px).bars, 63);
  assert.equal(travelRead(px, { rangeWin: 20 }).bars, 20);
  assert.equal(travelRead(px, { rangeWin: 20 }).pos, 1);
});

test('every numeric field is finite and in range — nothing NaN reaches a page', () => {
  for (const px of [line(70, 0.001), line(70, -0.002), chop(70, 0.01), line(100, 0.0001)]) {
    const r = travelRead(px);
    if (!r) continue;
    for (const k of ['pos', 'eff', 'rw', 'mult', 'weight']) {
      assert.ok(Number.isFinite(r[k]), `${k} is ${r[k]}`);
    }
    assert.ok(r.pos >= 0 && r.pos <= 1, `pos out of range: ${r.pos}`);
    assert.ok(r.weight >= 0 && r.weight <= 1, `weight out of range: ${r.weight}`);
    assert.ok(r.detail.length > 10);
  }
});
