/**
 * eventBootstrap — coverage on synthetic data, no network.
 * Run: node --test analysis/lib/eventBootstrap.test.mjs
 *
 * The old copied helper gave 0% coverage at n = 9 (every replicate identical) and ~45-62% at
 * n = 17-24. A sound percentile bootstrap should cover a zero true difference most of the time.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootDiff, circularBlock } from './eventBootstrap.mjs';

function mulberry(seed) { return () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = rnd => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

function coverage(nA, trials = 300) {
  const gen = mulberry(7), rnd = mulberry(20261031);
  let hit = 0;
  for (let t = 0; t < trials; t++) {
    const a = Array.from({ length: nA }, () => gauss(gen));
    const b = Array.from({ length: 600 }, () => gauss(gen));
    const r = bootDiff(a, b, { block: 10, reps: 400, rnd, minA: 4 });
    if (r.lo <= 0 && r.hi >= 0) hit++;
  }
  return hit / trials;
}

test('interval has width at n = 9 (old helper: zero width)', () => {
  const rnd = mulberry(1), a = [0.1, -0.3, 0.5, 0.2, -0.1, 0.9, -0.4, 0.3, 0.0], b = Array.from({ length: 200 }, (_, i) => Math.sin(i));
  const r = bootDiff(a, b, { block: 10, rnd, minA: 4 });
  assert.ok(r.hi - r.lo > 0.2, `width ${r.hi - r.lo}`);
});

for (const n of [9, 14, 24, 60]) {
  test(`coverage of a zero difference at n = ${n} is close to 95%`, () => {
    const c = coverage(n);
    assert.ok(c >= 0.85, `coverage ${c}`);
  });
}

test('circularBlock keeps length, clamps the block and reaches every start', () => {
  const rnd = mulberry(3), x = [1, 2, 3, 4, 5];
  assert.equal(circularBlock(x, 50, rnd).length, 5);
  const firsts = new Set(); for (let i = 0; i < 400; i++) firsts.add(circularBlock(x, 3, rnd)[0]);
  assert.equal(firsts.size, 5);
});

test('needs a seeded rnd and keeps the old guards', () => {
  assert.throws(() => bootDiff([1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], {}));
  assert.equal(bootDiff([1, 2, 3], Array(50).fill(0), { rnd: mulberry(1) }), null);
});
