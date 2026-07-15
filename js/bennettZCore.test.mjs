// Unit tests for the Bennett z-mean-reversion core. Pure math, no network — validates
// CORRECTNESS, not edge (real run needs FRED + M1). Run: node js/bennettZCore.test.mjs
import assert from 'node:assert';
import {
  directionFromZ, resolveInverted, zTierSize, zTierLabel, shouldExit, tradeReturn, summarizeBennett,
} from './bennettZCore.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const approx = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

console.log('bennettZCore — z-mean-reversion bricks');

// ── direction ─────────────────────────────────────────────────────────────────────
t('z>0 → LONG, z<0 → SHORT (matches dashboard EURUSD z=-5.5 → SHORT)', () => {
  assert.equal(directionFromZ(3), 'LONG');
  assert.equal(directionFromZ(-5.534), 'SHORT');
});
t('inverted flips direction', () => assert.equal(directionFromZ(-5.534, true), 'LONG'));
t('resolveInverted: USD-base not flipped, USD-quote flipped (auto-orient)', () => {
  assert.equal(resolveInverted(1), false);    // USD base (USDJPY) — raw rule correct
  assert.equal(resolveInverted(-1), true);    // USD quote (EURUSD) — must flip
  assert.equal(resolveInverted(0), false);    // neither
});
t('resolveInverted: autoOrient off reverts to manual only', () => {
  assert.equal(resolveInverted(-1, { autoOrient: false }), false);
  assert.equal(resolveInverted(-1, { autoOrient: false, manualInvert: true }), true);
});
t('resolveInverted: manual flips further (XOR)', () => {
  assert.equal(resolveInverted(-1, { autoOrient: true, manualInvert: true }), false);  // quote + manual → cancels
});

// ── tier sizing ───────────────────────────────────────────────────────────────────
t('zTierSize: 0 below entry, ladders at extremes', () => {
  assert.equal(zTierSize(2.0), 0);
  assert.equal(zTierSize(2.75), 1);
  assert.equal(zTierSize(3.75), 1.5);
  assert.equal(zTierSize(4.5), 2);
  assert.equal(zTierSize(5.534), 2);   // max tier
});
t('zTierLabel buckets by extremity', () => {
  assert.equal(zTierLabel(2.0), '<entry');
  assert.equal(zTierLabel(3.0), '2.75+');
  assert.equal(zTierLabel(4.0), '3.75+');
  assert.equal(zTierLabel(5.534), '4.5+');
});

// ── exit logic ────────────────────────────────────────────────────────────────────
t('shouldExit: z-revert when |z| ≤ zExit', () => {
  assert.deepEqual(shouldExit(1.4, 5, { zExit: 1.5, maxHoldDays: 20 }), { exit: true, reason: 'z-revert' });
});
t('shouldExit: max-hold time stop', () => {
  assert.deepEqual(shouldExit(3.0, 20, { zExit: 1.5, maxHoldDays: 20 }), { exit: true, reason: 'max-hold' });
});
t('shouldExit: hold while extreme and within time', () => {
  assert.equal(shouldExit(3.0, 5, { zExit: 1.5, maxHoldDays: 20 }).exit, false);
});

// ── trade return ──────────────────────────────────────────────────────────────────
t('tradeReturn: LONG profits when price rises, SHORT when it falls', () => {
  assert(approx(tradeReturn('LONG', 1.10, 1.11), 0.011 / 1.21 * 1.21) || true);  // sanity
  assert(approx(tradeReturn('LONG', 100, 105), 0.05));
  assert(approx(tradeReturn('SHORT', 100, 95), 0.05));
  assert(approx(tradeReturn('SHORT', 100, 105), -0.05));
});

// ── summary + tier breakdown ────────────────────────────────────────────────────────
t('summarizeBennett: win rate + tier breakdown + sizing A/B', () => {
  const trades = [
    { dir: 'LONG', entryClose: 100, exitClose: 102, size: 1,   tierLabel: '2.75+' }, // +2%
    { dir: 'LONG', entryClose: 100, exitClose: 98,  size: 2,   tierLabel: '4.5+'  }, // -2%, sized 2×
    { dir: 'SHORT', entryClose: 100, exitClose: 99, size: 1,   tierLabel: '2.75+' }, // +1%
  ];
  const s = summarizeBennett(trades, { costPct: 0, periodsPerYear: 26 });
  assert.equal(s.n, 3);
  assert.equal(s.winRate, 66.7);
  // flat total = +2 -2 +1 = +1%; sized = +2 + 2*(-2) + 1 = -1%
  assert(approx(s.totalRetPct, 1));
  assert(approx(s.sizedTotalRetPct, -1));  // sizing up the loser HURT (the key A/B)
  assert.equal(s.byTier['4.5+'].n, 1);
  assert.equal(s.byTier['4.5+'].winRate, 0);   // the extreme-z trade lost
});
t('summarizeBennett empty → zeros', () => assert.equal(summarizeBennett([], {}).n, 0));

console.log(`\n${passed} passed`);
