/**
 * Exit-study unit tests — simulateExitVariants (analyser) + runExitStudy (strategy).
 *
 * Pure, synthetic M1 paths (no network). Runs offline in the sandbox — real
 * numbers need a Railway Refresh (M1 unreachable here). Run: node js/exitStudy.test.mjs
 */

import assert from 'node:assert/strict';
import { simulateExitVariants } from './forecastAnalyser.js';
import { runExitStudy } from './perLineStrategy.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Bar helper.
const bar = (o, h, l, c) => ({ time: 0, open: o, high: h, low: l, close: c });

// A canonical up-line touch: open=100, entry (touchLvl)=102, inner=101 (toward
// open), outer=103 (away). fade sells @102 (TP=101, SL=103); follow buys @102
// (TP=103, SL=101). open=100 for %-normalisation.
const UP = { touchLvl: 102, inner: 101, outer: 103, isUp: true, open: 100 };

console.log('simulateExitVariants:');

// 1) Clean revert to inner → fade fixed ≈ +distToInner; chand/walk ≈ same.
test('clean revert to inner → fade fixed ≈ +distToInner, chand/walk match', () => {
  // Sell @102, price drops straight to 101 (favourable for a sell). No adverse move.
  const bars = [ bar(102, 102, 101, 101) ];   // touch bar spans down to inner (TP)
  const ex = simulateExitVariants(bars, 0, UP);
  const distToInner = (UP.touchLvl - UP.inner) / UP.open * 100;   // +1.0
  assert.ok(near(ex.exFadeFixed, distToInner), `fadeFixed ${ex.exFadeFixed} vs ${distToInner}`);
  // trail/BE never triggered adversely → same exit as fixed.
  assert.ok(near(ex.exFadeChand, distToInner), `fadeChand ${ex.exFadeChand}`);
  assert.ok(near(ex.exFadeWalk,  distToInner), `fadeWalk ${ex.exFadeWalk}`);
});

// 2) Clean continuation to outer → follow fixed ≈ +distToOuter.
test('clean continuation to outer → follow fixed ≈ +distToOuter', () => {
  // Follow buys @102, price runs straight up to 103 (outer = follow TP).
  const bars = [ bar(102, 103, 102, 103) ];
  const ex = simulateExitVariants(bars, 0, UP);
  const distToOuter = (UP.outer - UP.touchLvl) / UP.open * 100;   // +1.0
  assert.ok(near(ex.exFollowFixed, distToOuter), `followFixed ${ex.exFollowFixed} vs ${distToOuter}`);
  assert.ok(near(ex.exFollowChand, distToOuter), `followChand ${ex.exFollowChand}`);
  assert.ok(near(ex.exFollowWalk,  distToOuter), `followWalk ${ex.exFollowWalk}`);
});

// 3) Whipsaw: fade runs favourably then reverses through the FIXED stop, but the
//    CHANDELIER has ratcheted below and locks a profit → exFadeChand > exFadeFixed.
test('whipsaw → chandelier locks profit > fixed', () => {
  // fade sell @102, SL(fixed)=103, R=1, trail=0.5·R=0.5.
  // bar0: dips to 101.4 (favourable, no TP@101) → chand stop = 101.4 + 0.5 = 101.9.
  // bar1: rallies to 103 → fixed stop (103) hit = loss; chand stop (101.9) hit first
  //       on the way up? adverse for a sell = high. bar1 high 103 ≥ 101.9 → chand
  //       exits at 101.9 (a PROFIT: sold 102, bought back 101.9).
  const bars = [ bar(102, 102, 101.4, 101.6), bar(101.6, 103, 101.6, 103) ];
  const ex = simulateExitVariants(bars, 0, UP);
  // fixed: bar1 high 103 hits SL 103 → exit 103 → loss (sold 102, bought 103) = -1%.
  assert.ok(ex.exFadeFixed < 0, `fadeFixed should lose: ${ex.exFadeFixed}`);
  // chand exit @101.9 → +0.1% (sold 102, bought 101.9).
  assert.ok(near(ex.exFadeChand, (102 - 101.9) / 100 * 100), `fadeChand ${ex.exFadeChand}`);
  assert.ok(ex.exFadeChand > ex.exFadeFixed, `chand ${ex.exFadeChand} !> fixed ${ex.exFadeFixed}`);
});

// 4) Give-back: fade goes ~beTrigger toward TP then back to entry → WALK exits
//    ~breakeven while FIXED rides to the full outer stop → exFadeWalk > exFadeFixed.
test('give-back → walk exits ~breakeven > fixed full stop', () => {
  // fade sell @102, TP(inner)=101, |TP-E|=1, beTrigger=0.5 → BE arms at 0.5 progress
  // (price 101.5). bar0: dips to 101.4 (progress 0.6 ≥ 0.5) but does NOT tag TP@101,
  //   so no exit; stop walks to breakeven E=102 for later bars.
  // bar1: rallies to 103. adverse (high) 103 ≥ walk-stop 102 → exit at 102 = breakeven.
  //   fixed stop 103 → exit 103 = full -1% loss.
  const bars = [ bar(102, 102, 101.4, 101.5), bar(101.5, 103, 101.5, 103) ];
  const ex = simulateExitVariants(bars, 0, UP);
  assert.ok(near(ex.exFadeWalk, 0), `fadeWalk should be ~breakeven: ${ex.exFadeWalk}`);
  assert.ok(ex.exFadeFixed < 0, `fadeFixed should lose: ${ex.exFadeFixed}`);
  assert.ok(ex.exFadeWalk > ex.exFadeFixed, `walk ${ex.exFadeWalk} !> fixed ${ex.exFadeFixed}`);
});

// 5) Conservative ordering: a single bar that spans BOTH the stop and the TP exits
//    at the STOP (stop checked first).
test('bar spanning both stop and TP → exits at stop', () => {
  // fade sell @102: SL=103, TP=101. A bar with high 103 AND low 101 touches both.
  const bars = [ bar(102, 103, 101, 102) ];
  const ex = simulateExitVariants(bars, 0, UP);
  // stop-first → exit @103 → full loss -1% (sold 102, bought 103).
  assert.ok(near(ex.exFadeFixed, -1), `fadeFixed spanning-bar should = stop (-1): ${ex.exFadeFixed}`);
  // follow buy @102: SL=101, TP=103. Same bar hits both → stop @101 → -1%.
  assert.ok(near(ex.exFollowFixed, -1), `followFixed spanning-bar should = stop (-1): ${ex.exFollowFixed}`);
});

// Sanity: fixed variants match the triple-barrier gross for clean paths (dn side too).
test('dn-side clean revert → fade fixed = +distToInner', () => {
  // dn line: touch below open. open=100, entry=98, inner=99 (toward open), outer=97.
  // fade BUYS @98 (TP=inner=99). Price rises to 99.
  const DN = { touchLvl: 98, inner: 99, outer: 97, isUp: false, open: 100 };
  const bars = [ bar(98, 99, 98, 99) ];
  const ex = simulateExitVariants(bars, 0, DN);
  assert.ok(near(ex.exFadeFixed, (99 - 98) / 100 * 100), `dn fadeFixed ${ex.exFadeFixed}`);
});

// ── runExitStudy smoke test ─────────────────────────────────────────────────
console.log('runExitStudy:');

test('smoke: three rules present with overall/fade/follow blocks', () => {
  // Build synthetic touches spanning IS + OOS across two "pairs". Each touch carries
  // the six ex* fields + a cell + reverted flag so buildPolicy can learn on IS.
  const mk = (date, side, reverted, ex) => ({
    date, open: 100, line: `OC50_${side}`, name: 'OC50', side,
    reverted, level: side === 'up' ? 102 : 98,
    innerLvl: side === 'up' ? 101 : 99, outerLvl: side === 'up' ? 103 : 97,
    decidedBy: 'barrier', closePx: 100,
    cell: `OC50_${side}|fast`,
    extPct: 0.5, retracePct: 0.5,
    ...ex,
  });
  // A fade-favourable cell: reverts often, so buildPolicy learns 'fade' on IS.
  const win  = { exFadeFixed: 0.9, exFadeChand: 1.1, exFadeWalk: 0.7, exFollowFixed: -0.9, exFollowChand: -0.9, exFollowWalk: -0.9 };
  const loss = { exFadeFixed: -0.5, exFadeChand: -0.3, exFadeWalk: -0.1, exFollowFixed: 0.5, exFollowChand: 0.5, exFollowWalk: 0.5 };
  const touches = [];
  // 80 IS touches (mostly reverting winners) + 80 OOS touches.
  for (let i = 0; i < 80; i++) {
    const rev = i % 4 !== 0;   // 75% revert → fade edge
    touches.push(mk(`2020-01-${String((i % 28) + 1).padStart(2, '0')}`, 'up', rev, rev ? win : loss));
  }
  for (let i = 0; i < 80; i++) {
    const rev = i % 4 !== 0;
    touches.push(mk(`2023-01-${String((i % 28) + 1).padStart(2, '0')}`, 'up', rev, rev ? win : loss));
  }
  const study = runExitStudy({ EURUSD: touches }, { splitFrac: 0.5, minN: 20, marginPct: 0,
    costByPair: { EURUSD: 0.01 }, slipByPair: { EURUSD: 0.006 } });
  assert.ok(study, 'study returned');
  for (const rule of ['fixed', 'chand', 'walk']) {
    assert.ok(study.rules[rule], `rule ${rule} present`);
    for (const g of ['overall', 'fade', 'follow']) {
      assert.ok(study.rules[rule][g], `rule ${rule}.${g} present`);
      assert.ok('sharpe' in study.rules[rule][g], `rule ${rule}.${g} has sharpe`);
      assert.ok('trades' in study.rules[rule][g], `rule ${rule}.${g} has trades`);
    }
  }
  assert.ok('bestByGroup' in study, 'bestByGroup present');
  assert.equal(study.missing, 0, 'no missing ex* fields');
  // OOS took the fade decision, so fade block should have trades and follow ~0.
  assert.ok(study.rules.fixed.fade.trades > 0, 'fade trades taken OOS');
});

// A study touch missing an ex* field must be counted, not crash.
test('missing ex* field is counted', () => {
  const t = { date: '2021-01-01', open: 100, line: 'OC50_up', name: 'OC50', side: 'up',
    reverted: true, level: 102, innerLvl: 101, outerLvl: 103, decidedBy: 'barrier',
    closePx: 100, cell: 'OC50_up|fast', extPct: 0.5, retracePct: 0.5 };   // no ex* fields
  // Need a policy that trades this cell → give enough IS reverting touches.
  // 60 IS fade-winners (2019) + 20 OOS touches that DO have ex* + 3 OOS touches
  // that are MISSING ex* — the missing ones should be counted (policy trades the cell).
  const withEx = { exFadeFixed: 1, exFadeChand: 1, exFadeWalk: 1, exFollowFixed: -1, exFollowChand: -1, exFollowWalk: -1 };
  const is = [], oos = [];
  for (let i = 0; i < 60; i++) is.push({ ...t, date: `2019-${String((i % 12) + 1).padStart(2, '0')}-15`, ...withEx });
  for (let i = 0; i < 20; i++) oos.push({ ...t, date: `2024-${String((i % 12) + 1).padStart(2, '0')}-15`, ...withEx });
  for (let i = 0; i < 3; i++) oos.push({ ...t, date: `2024-12-${String(i + 1).padStart(2, '0')}` });   // no ex* fields
  const study = runExitStudy({ P: [...is, ...oos] }, { splitFrac: 0.6, minN: 20, marginPct: 0 });
  assert.ok(study.missing >= 3, `missing counted (${study.missing})`);   // 3 OOS touches × 3 rules = 9
});

console.log(`\n${passed} checks passed.`);
