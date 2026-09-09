/**
 * Tests for js/hlSignalCore.js's priceTradeFromTouch — pure, synthetic touches.
 *
 * These exist because of the 2026-09-09 correction. The bug that invalidated the
 * whole HL study was not a wrong formula, it was a MISSING POPULATION: touches
 * whose barrier race never resolved before the session close were dropped, and
 * they were the losing half. A regression there would look like nothing at all
 * — no error, no NaN, just better numbers — so the case that matters most below
 * is "an unresolved touch still produces a priced trade".
 *   node js/hlSignalCore.test.mjs
 */
import assert from 'node:assert/strict';
import { BANDS, bandOf, priceTradeFromTouch, HL_TOUCH_SCHEMA } from './hlSignalCore.js';

let passed = 0;
const results = [];
function t(n, f) {
  try { f(); passed++; results.push(`  ✓ ${n}`); }
  catch (e) { results.push(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; }
}

console.log('hlSignalCore');

// An UP-side p50 touch: inner (reversal target) below, outer (continuation
// target) above, entry parked between them at the 60min checkpoint.
const base = {
  instrument: 'EURUSD', pair: 'eurusd', assetClass: 'fx', date: '2024-05-01',
  side: 'up', rung: 'p50', pip: 0.0001,
  revTarget: 1.0800, contTarget: 1.1000, sessionClose: 1.0900, sessionEndTime: 2000,
  resolveTime: 1500, straddle: 0,
  checks: { 60: { frac: 0.1, ckTime: 1000, ckPrice: 1.0950 } },
};
const NO_COST = 0;

t('bands tile [0,1] with no gaps and carry no built-in bet', () => {
  assert.equal(BANDS.length, 4);
  for (const b of BANDS) assert.equal(b.bet, undefined, `${b.key} must not carry a bet`);
  for (const f of [0, 0.149, 0.15, 0.34, 0.35, 0.59, 0.6, 1]) {
    assert.ok(bandOf(f), `no band matched frac ${f}`);
  }
  assert.equal(bandOf(0.1).key, '<15%');
  assert.equal(bandOf(0.5).key, '35-60%');
  assert.equal(bandOf(0.9).key, '>60%');
});

t('continuation that reaches the outer target wins its full target distance', () => {
  const p = priceTradeFromTouch({ ...base, outcome: 'continuation' }, 60, 'continuation', NO_COST);
  assert.equal(p.exitKind, 'target');
  assert.equal(p.win, true);
  // (1.1000 - 1.0950) / 1.0950 * 100
  assert.ok(Math.abs(p.pnlPct - 0.4566) < 0.001, `pnlPct ${p.pnlPct}`);
});

t('continuation that reverses instead loses its full stop distance', () => {
  const p = priceTradeFromTouch({ ...base, outcome: 'reversal' }, 60, 'continuation', NO_COST);
  assert.equal(p.exitKind, 'stop');
  assert.equal(p.win, false);
  // -(1.0950 - 1.0800) / 1.0950 * 100
  assert.ok(Math.abs(p.pnlPct + 1.3699) < 0.001, `pnlPct ${p.pnlPct}`);
});

t('the same touch bet the other way mirrors target and stop', () => {
  const p = priceTradeFromTouch({ ...base, outcome: 'reversal' }, 60, 'reversal', NO_COST);
  assert.equal(p.exitKind, 'target');
  assert.equal(p.win, true);
  assert.ok(Math.abs(p.pnlPct - 1.3699) < 0.001, `pnlPct ${p.pnlPct}`);
});

// ── THE REGRESSION THAT MATTERS ──────────────────────────────────────────────
t('an UNRESOLVED touch still becomes a trade, marked out at the session close', () => {
  const p = priceTradeFromTouch({ ...base, outcome: 'neither' }, 60, 'continuation', NO_COST);
  assert.ok(p, 'unresolved touch must NOT be dropped — that was the 2026-09-09 bug');
  assert.equal(p.exitKind, 'timeout');
  // Entered 1.0950, session closed 1.0900, betting up: a loss, and NOT a full stop.
  assert.equal(p.win, false);
  assert.ok(Math.abs(p.pnlPct + 0.4566) < 0.001, `pnlPct ${p.pnlPct}`);
  assert.ok(p.pnlPct > -1.3699, 'a timeout must not be charged the full stop distance');
});

t('a timeout is signed by the direction bet, not by the price alone', () => {
  const up = priceTradeFromTouch({ ...base, outcome: 'neither' }, 60, 'continuation', NO_COST);
  const dn = priceTradeFromTouch({ ...base, outcome: 'neither' }, 60, 'reversal', NO_COST);
  assert.ok(Math.abs(up.pnlPct + dn.pnlPct) < 1e-9, 'opposite bets on one timeout must be exact mirrors');
  assert.equal(dn.win, true);
});

t('a straddled bar is scored a loss whichever way it is bet', () => {
  for (const bet of ['continuation', 'reversal']) {
    for (const outcome of ['continuation', 'reversal']) {
      const p = priceTradeFromTouch({ ...base, outcome, straddle: 1 }, 60, bet, NO_COST);
      assert.equal(p.exitKind, 'ambiguous', `${bet}/${outcome}`);
      assert.equal(p.win, false, `${bet}/${outcome} must not be awarded a win`);
    }
  }
});

t('cost is charged once, on every exit kind alike', () => {
  const COST = 0.01;
  for (const outcome of ['continuation', 'reversal', 'neither']) {
    const free = priceTradeFromTouch({ ...base, outcome }, 60, 'continuation', 0);
    const paid = priceTradeFromTouch({ ...base, outcome }, 60, 'continuation', COST);
    assert.ok(Math.abs((free.pnlPct - paid.pnlPct) - COST) < 1e-9, `${outcome} did not pay cost exactly once`);
  }
});

t('a v1 record (unresolved, but no sessionClose to mark out at) is refused, not guessed', () => {
  const v1 = { ...base, outcome: 'neither' };
  delete v1.sessionClose;
  assert.equal(priceTradeFromTouch(v1, 60, 'continuation', NO_COST), null);
  assert.ok(HL_TOUCH_SCHEMA >= 2, 'schema must be bumped so readers can refuse v1 files');
});

t('a missing checkpoint or a degenerate barrier returns null rather than a fake trade', () => {
  assert.equal(priceTradeFromTouch({ ...base, outcome: 'continuation' }, 15, 'continuation', NO_COST), null);
  const flat = { ...base, outcome: 'continuation', contTarget: base.checks[60].ckPrice };
  assert.equal(priceTradeFromTouch(flat, 60, 'continuation', NO_COST), null);
});

console.log(results.join('\n'));
console.log(`${passed}/${results.length} passed`);
