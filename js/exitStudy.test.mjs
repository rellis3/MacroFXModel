/**
 * Exit-study unit tests — simulateExitVariants (analyser) + runExitStudy (strategy).
 *
 * Pure, synthetic M1 paths (no network). Runs offline in the sandbox — real
 * numbers need a Railway Refresh (M1 unreachable here). Run: node js/exitStudy.test.mjs
 */

import assert from 'node:assert/strict';
import { simulateExitVariants } from './forecastAnalyser.js';
import { runExitStudy, runExitGateSweep, runRideRigor } from './perLineStrategy.js';

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

// 4b) Ride (no TP): a fade reverts PAST the inner line → ride captures the extra
//     move that fixed caps at the TP → exFadeRide > exFadeFixed.
test('ride (no TP) rides past inner → beats fixed', () => {
  // fade sell @102, TP(inner)=101, SL(outer)=103, R=1, trail=0.5.
  // bar0: dips to 99.5 (favourable) — fixed exits @TP 101 (+1%); ride skips the TP,
  //   ratchets stop to 99.5+0.5=100.0, closes 100.
  // bar1: ticks back to 100.2 → ride stop 100.0 hit → exit 100 = +2% (sold 102, bought 100).
  const bars = [ bar(102, 102, 99.5, 100), bar(100, 100.2, 100, 100.2) ];
  const ex = simulateExitVariants(bars, 0, UP);
  assert.ok(near(ex.exFadeFixed, 1), `fadeFixed caps at TP (+1): ${ex.exFadeFixed}`);
  assert.ok(near(ex.exFadeRide, 2), `fadeRide rides to trailed stop (+2): ${ex.exFadeRide}`);
  assert.ok(ex.exFadeRide > ex.exFadeFixed, `ride ${ex.exFadeRide} !> fixed ${ex.exFadeFixed}`);
  assert.equal(ex.exFadeRideWhy, 'trail', `ride exit reason: ${ex.exFadeRideWhy}`);
});

// 4c) Ride vs Ride+ : a fade that doesn't resolve in-session exits flat at the close
//     (ride, why='close'); Ride+ keeps trailing into forwardBars and captures the move.
test('ride+ holds past close into next day → beats ride', () => {
  const session = [ bar(102, 102.1, 101.9, 102) ];                 // hovers, no trail hit → EOD close ~flat
  const forwardBars = [ bar(102, 102, 100, 100), bar(100, 100.6, 100, 100.6) ]; // next day drops then ticks up
  const ex = simulateExitVariants(session, 0, { ...UP, forwardBars });
  assert.equal(ex.exFadeRideWhy, 'close', `ride should EOD-close: ${ex.exFadeRideWhy}`);
  assert.ok(near(ex.exFadeRide, 0), `ride exits ~flat at close: ${ex.exFadeRide}`);
  assert.equal(ex.exFadeRideHoldWhy, 'trail', `ride+ should exit on the trail next day: ${ex.exFadeRideHoldWhy}`);
  assert.ok(ex.exFadeRideHold > ex.exFadeRide, `ride+ ${ex.exFadeRideHold} !> ride ${ex.exFadeRide}`);
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
  const win  = { exFadeFixed: 0.9, exFadeChand: 1.1, exFadeWalk: 0.7, exFadeRide: 1.4, exFadeRideHold: 1.6, exFadeRideWhy: 'trail', exFadeRideHoldWhy: 'trail', exFollowFixed: -0.9, exFollowChand: -0.9, exFollowWalk: -0.9, exFollowRide: -0.9, exFollowRideHold: -0.9 };
  const loss = { exFadeFixed: -0.5, exFadeChand: -0.3, exFadeWalk: -0.1, exFadeRide: -0.6, exFadeRideHold: -0.7, exFadeRideWhy: 'close', exFadeRideHoldWhy: 'stop', exFollowFixed: 0.5, exFollowChand: 0.5, exFollowWalk: 0.5, exFollowRide: 0.5, exFollowRideHold: 0.5 };
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
  for (const rule of ['fixed', 'chand', 'walk', 'ride', 'ridehold']) {
    assert.ok(study.rules[rule], `rule ${rule} present`);
    for (const g of ['overall', 'fade', 'follow']) {
      assert.ok(study.rules[rule][g], `rule ${rule}.${g} present`);
      assert.ok('sharpe' in study.rules[rule][g], `rule ${rule}.${g} has sharpe`);
      assert.ok('trades' in study.rules[rule][g], `rule ${rule}.${g} has trades`);
    }
    // cost-sensitivity present on every rule.
    assert.equal(study.rules[rule].costStress.length, 3, `rule ${rule} costStress 1×/2×/3×`);
  }
  // exit composition only on the trailing rides, and it sums sensibly.
  assert.ok(study.rules.ride.composition, 'ride composition present');
  assert.ok(study.rules.ridehold.composition, 'ridehold composition present');
  assert.ok(!study.rules.fixed.composition, 'fixed has no composition');
  assert.ok('bestByGroup' in study, 'bestByGroup present');
  assert.equal(study.missing, 0, 'no missing ex* fields');
  // OOS took the fade decision, so fade block should have trades and follow ~0.
  assert.ok(study.rules.fixed.fade.trades > 0, 'fade trades taken OOS');
});

// Rides are charged an exit-slip leg the fixed TP is not (they exit on a stop). For
// the SAME gross, ride net expectancy must be lower than fixed by ~one slip.
test('rides pay exit slippage (ride net < fixed net for equal gross)', () => {
  const g = { exFadeFixed: 1.0, exFadeChand: 1.0, exFadeWalk: 1.0, exFadeRide: 1.0, exFadeRideHold: 1.0,
              exFadeRideWhy: 'trail', exFadeRideHoldWhy: 'trail',
              exFollowFixed: -1, exFollowChand: -1, exFollowWalk: -1, exFollowRide: -1, exFollowRideHold: -1,
              exFollowRideWhy: 'stop', exFollowRideHoldWhy: 'stop' };
  const mk = date => ({ date, open: 100, line: 'OC50_up', name: 'OC50', side: 'up',
    reverted: true, level: 102, innerLvl: 101, outerLvl: 103, decidedBy: 'barrier', closePx: 100,
    cell: 'OC50_up|fast', extPct: 0.5, retracePct: 0.5, ...g });
  const is = [], oos = [];
  for (let i = 0; i < 60; i++) is.push(mk(`2019-${String((i % 12) + 1).padStart(2, '0')}-15`));
  for (let i = 0; i < 40; i++) oos.push(mk(`2024-${String((i % 12) + 1).padStart(2, '0')}-15`));
  const slip = 0.006;
  const study = runExitStudy({ P: [...is, ...oos] }, { splitFrac: 0.6, minN: 20, marginPct: 0,
    costByPair: { P: 0.01 }, slipByPair: { P: slip } });
  const gap = study.rules.fixed.overall.expectancy - study.rules.ride.overall.expectancy;
  assert.ok(gap > slip * 0.8, `ride should be ~one slip cheaper than fixed: gap ${gap} vs slip ${slip}`);
});

// The entry-gate sweep returns one row per margin with ride/ridehold Sharpe +2×+n.
test('gate sweep: one row per margin with ride 2× robustness fields', () => {
  const g = { exFadeFixed: 0.9, exFadeChand: 1.0, exFadeWalk: 0.8, exFadeRide: 1.1, exFadeRideHold: 1.1,
              exFadeRideWhy: 'trail', exFadeRideHoldWhy: 'trail',
              exFollowFixed: -1, exFollowChand: -1, exFollowWalk: -1, exFollowRide: -1, exFollowRideHold: -1,
              exFollowRideWhy: 'stop', exFollowRideHoldWhy: 'stop' };
  const mk = (date, rev) => ({ date, open: 100, line: 'OC50_up', name: 'OC50', side: 'up',
    reverted: rev, level: 102, innerLvl: 101, outerLvl: 103, decidedBy: 'barrier', closePx: 100,
    cell: 'OC50_up|fast', extPct: 0.5, retracePct: 0.5, ...(rev ? g : { ...g, exFadeRide: -0.6 }) });
  const touches = [];
  for (let i = 0; i < 80; i++) touches.push(mk(`2020-01-${String((i % 28) + 1).padStart(2, '0')}`, i % 4 !== 0));
  for (let i = 0; i < 80; i++) touches.push(mk(`2023-01-${String((i % 28) + 1).padStart(2, '0')}`, i % 4 !== 0));
  const sweep = runExitGateSweep({ P: touches }, { margins: [0, 0.02], splitFrac: 0.5, minN: 20,
    costByPair: { P: 0.01 }, slipByPair: { P: 0.006 } });
  assert.equal(sweep.length, 2, 'one row per margin');
  for (const row of sweep) {
    assert.ok('margin' in row && row.ride && row.ridehold, 'row shape');
    assert.ok('sharpe' in row.ride && 'sharpe2x' in row.ride && 'trades' in row.ride, 'ride fields');
  }
  assert.equal(sweep[0].margin, 0); assert.equal(sweep[1].margin, 0.02);
});

// Ride rigor returns walk-forward / per-year / breadth blocks on the ride exit.
test('ride rigor: walk-forward, per-year and per-pair breadth blocks', () => {
  const g = { exFadeFixed: 0.9, exFadeChand: 1.0, exFadeWalk: 0.8, exFadeRide: 1.2, exFadeRideHold: 1.2,
              exFadeRideWhy: 'trail', exFadeRideHoldWhy: 'trail',
              exFollowFixed: -1, exFollowChand: -1, exFollowWalk: -1, exFollowRide: -1, exFollowRideHold: -1,
              exFollowRideWhy: 'stop', exFollowRideHoldWhy: 'stop' };
  const mk = (pair, date, rev) => ({ date, open: 100, line: 'OC50_up', name: 'OC50', side: 'up',
    reverted: rev, level: 102, innerLvl: 101, outerLvl: 103, decidedBy: 'barrier', closePx: 100,
    cell: 'OC50_up|fast', extPct: 0.5, retracePct: 0.5, ...(rev ? g : { ...g, exFadeRide: -0.6 }) });
  const mkPair = () => { const a = []; for (let y = 2020; y <= 2024; y++) for (let i = 0; i < 40; i++)
    a.push(mk('P', `${y}-${String((i % 12) + 1).padStart(2, '0')}-15`, i % 4 !== 0)); return a; };
  const rr = runRideRigor({ AA: mkPair(), BB: mkPair() }, { splitFrac: 0.5, minN: 20, marginPct: 0,
    folds: 3, costByPair: { AA: 0.01, BB: 0.01 }, slipByPair: { AA: 0.006, BB: 0.006 } });
  assert.ok(rr && rr.walkForward && rr.isVsOos, 'core blocks present');
  assert.ok(Array.isArray(rr.walkForward.folds) && rr.walkForward.folds.length >= 1, 'walk-forward folds');
  assert.ok(Array.isArray(rr.perYear) && rr.perYear.length >= 2, 'per-year rows');
  assert.ok(Array.isArray(rr.perPair) && rr.perPair.length === 2, 'per-pair breadth (2 pairs)');
  assert.ok(rr.breadth && rr.breadth.pairs === 2 && 'top3SharePct' in rr.breadth, 'breadth summary');
  assert.ok('degradation' in rr.isVsOos, 'IS→OOS degradation');
});

// A study touch missing an ex* field must be counted, not crash.
test('missing ex* field is counted', () => {
  const t = { date: '2021-01-01', open: 100, line: 'OC50_up', name: 'OC50', side: 'up',
    reverted: true, level: 102, innerLvl: 101, outerLvl: 103, decidedBy: 'barrier',
    closePx: 100, cell: 'OC50_up|fast', extPct: 0.5, retracePct: 0.5 };   // no ex* fields
  // Need a policy that trades this cell → give enough IS reverting touches.
  // 60 IS fade-winners (2019) + 20 OOS touches that DO have ex* + 3 OOS touches
  // that are MISSING ex* — the missing ones should be counted (policy trades the cell).
  const withEx = { exFadeFixed: 1, exFadeChand: 1, exFadeWalk: 1, exFadeRide: 1, exFadeRideHold: 1, exFadeRideWhy: 'trail', exFadeRideHoldWhy: 'trail', exFollowFixed: -1, exFollowChand: -1, exFollowWalk: -1, exFollowRide: -1, exFollowRideHold: -1 };
  const is = [], oos = [];
  for (let i = 0; i < 60; i++) is.push({ ...t, date: `2019-${String((i % 12) + 1).padStart(2, '0')}-15`, ...withEx });
  for (let i = 0; i < 20; i++) oos.push({ ...t, date: `2024-${String((i % 12) + 1).padStart(2, '0')}-15`, ...withEx });
  for (let i = 0; i < 3; i++) oos.push({ ...t, date: `2024-12-${String(i + 1).padStart(2, '0')}` });   // no ex* fields
  const study = runExitStudy({ P: [...is, ...oos] }, { splitFrac: 0.6, minN: 20, marginPct: 0 });
  assert.ok(study.missing >= 3, `missing counted (${study.missing})`);   // 3 OOS touches × 3 rules = 9
});

console.log(`\n${passed} checks passed.`);
