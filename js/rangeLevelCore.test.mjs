// Unit tests for the range-level edge core. Pure math, no network — validates
// CORRECTNESS of the barrier race / confluence / stats, NOT edge (real run needs M1).
// Run: node js/rangeLevelCore.test.mjs
import assert from 'node:assert';
import {
  FIB_LADDER, buildLadder, findConfluence, mulberry32, barrierRace,
  summarizeRace, edgeVsPlacebo,
} from './rangeLevelCore.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const approx = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

console.log('rangeLevelCore — edge-test bricks');

// ── ladder & confluence ──────────────────────────────────────────────────────────────
t('buildLadder: f=0 → low, f=1 → high', () => {
  const L = buildLadder(1.0, 0.01);
  assert(approx(L.find(x => x.f === 0).price, 1.0));
  assert(approx(L.find(x => x.f === 1).price, 1.01));
});
t('buildLadder empty on non-positive range', () => assert.equal(buildLadder(1, 0).length, 0));
t('findConfluence matches ladders within tol', () => {
  const a = [{ f: 1, price: 1.1000 }, { f: 0, price: 1.0900 }];
  const b = [{ f: 0.5, price: 1.10005 }, { f: 0, price: 1.0800 }];
  const c = findConfluence(a, b, 0.0002);   // 2 pips
  assert.equal(c.length, 1);
  assert(approx(c[0].price, (1.1000 + 1.10005) / 2));
});
t('findConfluence empty when nothing within tol', () =>
  assert.equal(findConfluence([{ f: 1, price: 1.1 }], [{ f: 0, price: 1.2 }], 0.0002).length, 0));

// ── PRNG determinism ───────────────────────────────────────────────────────────────────
t('mulberry32 is deterministic for a seed', () => {
  const a = mulberry32(42), b = mulberry32(42);
  assert(approx(a(), b()));
  assert(a() >= 0 && a() < 1);
});

// ── barrier race ────────────────────────────────────────────────────────────────────────
t('race: bounce up when reversionUp and high clears +D first', () => {
  // level 100, D 1 → bounce barrier 101, break 99. bars rise.
  const highs = [100.2, 101.1], lows = [99.8, 100.5];
  assert.equal(barrierRace(highs, lows, 0, 1, 100, true, 1), 'bounce');
});
t('race: break when continuation barrier hit first', () => {
  const highs = [100.2, 100.3], lows = [99.5, 98.9];   // falls through 99
  assert.equal(barrierRace(highs, lows, 0, 1, 100, true, 1), 'break');
});
t('race: same-bar both barriers → break (conservative)', () => {
  const highs = [101.5], lows = [98.5];   // spans both
  assert.equal(barrierRace(highs, lows, 0, 0, 100, true, 1), 'break');
});
t('race: none when neither barrier reached', () => {
  const highs = [100.3, 100.4], lows = [99.7, 99.6];
  assert.equal(barrierRace(highs, lows, 0, 1, 100, true, 1), 'none');
});
t('race: reversionUp=false mirrors (approach from below → bounce down)', () => {
  // level 100, D 1, approached from below → bounce barrier 99, break 101
  const highs = [100.2, 100.3], lows = [99.5, 98.9];
  assert.equal(barrierRace(highs, lows, 0, 1, 100, false, 1), 'bounce');
});

// ── stats ──────────────────────────────────────────────────────────────────────────────
t('summarizeRace: bounce rate + after-cost expectancy', () => {
  const recs = [
    { date: 'a', outcome: 'bounce', Dpips: 10 },
    { date: 'b', outcome: 'bounce', Dpips: 10 },
    { date: 'c', outcome: 'break',  Dpips: 10 },
    { date: 'd', outcome: 'none',   Dpips: 10 },
  ];
  const s = summarizeRace(recs, { spreadPips: 1 });
  assert.equal(s.n, 3);                         // resolved only
  assert.equal(s.touches, 4);
  assert.equal(s.bounceRate, 66.7);
  // exp = ((+10) + (+10) + (-10))/3 - 1 = 10/3 - 1 ≈ 2.33
  assert(approx(s.expectancyPips, +((10 / 3) - 1).toFixed(2)));
});
t('summarizeRace: no resolved → zeros', () => {
  const s = summarizeRace([{ date: 'a', outcome: 'none', Dpips: 5 }], {});
  assert.equal(s.n, 0);
  assert.equal(s.bounceRate, 0);
});
t('edgeVsPlacebo: positive delta when real bounces more', () => {
  const e = edgeVsPlacebo({ bounceRate: 55 }, { bounceRate: 50 });
  assert.equal(e.bounceRateDelta, 5);
});

console.log(`\n${passed} passed`);
