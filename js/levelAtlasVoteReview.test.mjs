// Synthetic, no-network unit tests for js/levelAtlasVoteReview.js.
//   node js/levelAtlasVoteReview.test.mjs
//
// Proves: (1) voteDecision correctly counts supports+challenges and picks
// the majority side, returning null on a tie or no held context; (2)
// reorientExcursion swaps fadePips/runPips correctly per decision — the bug
// this whole review exists because of (an earlier ad-hoc script referenced a
// field, `matched`, that doesn't exist on matchLiveContext's return object,
// silently skipping every touch); (3) reviewVoteBacktest's win-rate/MFE/MAE
// aggregation is correct on a small hand-built book+touch set, and margin
// buckets a real dose-response pattern the way the real-data check did.

import assert from 'node:assert/strict';
import { voteDecision, reorientExcursion, reviewVoteBacktest, priceBarrierTrade, buildBarrierTrades, runBarrierWalkForward } from './levelAtlasVoteReview.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

console.log('levelAtlasVoteReview');

// A minimal book: one cell (up|p50) with a handful of held dimensions, so
// matchLiveContext has real supports/challenges to count from.
function mkBook(dimSpecs) {
  // dimSpecs: [[dimKey, bucketValue, favorsOut(bool)], ...] — each becomes a
  // held (holdsOOS:true) bucket in the up|p50 cell.
  const dims = {};
  for (const [dimKey, bucket, favorsOut] of dimSpecs) {
    dims[dimKey] = { is: { [bucket]: { deltaOut: favorsOut ? 5 : -5, n: 40, holdsOOS: true } },
                     oos: { [bucket]: { deltaOut: favorsOut ? 4 : -4, n: 35 } } };
  }
  return {
    splitDate: '2022-01-01',
    cells: { 'up|p50': { base: { is: { outPct: 50, backPct: 50 }, oos: { outPct: 50, backPct: 50 } }, dims } },
  };
}

// ── Test 1: voteDecision counts votes and breaks ties as "no decision" ─────
{
  const book = mkBook([['dimA', 'x', true], ['dimB', 'y', true], ['dimC', 'z', false]]);
  const touch2to1 = { side: 'up', rung: 'p50', dimA: 'x', dimB: 'y', dimC: 'z' };
  const vd = voteDecision(book, touch2to1);
  ok('T1 2-vs-1 out-votes -> follow, margin 1', vd?.decision === 'follow' && vd.margin === 1, JSON.stringify(vd));

  const bookTied = mkBook([['dimA', 'x', true], ['dimC', 'z', false]]);
  const touchTied = { side: 'up', rung: 'p50', dimA: 'x', dimC: 'z' };
  ok('T1 tied votes -> null (no decision)', voteDecision(bookTied, touchTied) === null);

  const touchNoReading = { side: 'up', rung: 'p50' };   // no dim values at all
  ok('T1 no matching dimension values -> null', voteDecision(book, touchNoReading) === null);

  ok('T1 unknown (side,rung) cell -> null, not a throw', voteDecision(book, { side: 'down', rung: 'p90' }) === null);
}

// ── Test 2: reorientExcursion swaps fadePips/runPips per decision ──────────
{
  const touch = { fadePips: 12, runPips: 30 };
  const fadeOriented = reorientExcursion(touch, 'fade');
  ok('T2 fade: MFE=fadePips, MAE=runPips', fadeOriented.mfePips === 12 && fadeOriented.maePips === 30, JSON.stringify(fadeOriented));
  const followOriented = reorientExcursion(touch, 'follow');
  ok('T2 follow: MFE=runPips, MAE=fadePips (the swap)', followOriented.mfePips === 30 && followOriented.maePips === 12, JSON.stringify(followOriented));
}

// ── Test 3: reviewVoteBacktest end-to-end on a small hand-built set ────────
{
  const book = mkBook([['dimA', 'high', true], ['dimB', 'high', true], ['dimC', 'high', false]]);
  const touches = [];
  // margin=1 (2 vs 1 -> follow), roughly coin-flip outcomes.
  for (let i = 0; i < 20; i++) {
    touches.push({
      instrument: 'EURUSD', side: 'up', rung: 'p50', rearmFrac: 0.3, date: `2022-02-${String(1 + i % 25).padStart(2, '0')}`,
      dimA: 'high', dimB: 'high', dimC: 'high', outcome: i % 2 === 0 ? 'out' : 'back',
      fadePips: 5, runPips: 15, pip: 0.0001, open: 1.1,
    });
  }
  const bookAllThree = mkBook([['dimA', 'high', true], ['dimB', 'high', true], ['dimD', 'high', true]]);
  // margin=3 (3 vs 0 -> follow), mostly WINS this time (outcome='out').
  const touches2 = [];
  for (let i = 0; i < 20; i++) {
    touches2.push({
      instrument: 'EURUSD', side: 'up', rung: 'p50', rearmFrac: 0.3, date: `2022-03-${String(1 + i % 25).padStart(2, '0')}`,
      dimA: 'high', dimB: 'high', dimD: 'high', outcome: i < 16 ? 'out' : 'back',   // 80% win
      fadePips: 5, runPips: 15, pip: 0.0001, open: 1.1,
    });
  }
  const p90Touches = [{ instrument: 'EURUSD', side: 'up', rung: 'p90', rearmFrac: 0.3, date: '2022-04-01',
    dimA: 'high', dimB: 'high', outcome: 'back', fadePips: 5, runPips: 0, pip: 0.0001, open: 1.1 }];

  const r1 = reviewVoteBacktest(touches, book, { rearmFrac: 0.3 });
  ok('T3 low-margin book: n and skip counts add up', r1.overall.n + r1.skippedNoVote === touches.length, JSON.stringify({ n: r1.overall.n, skip: r1.skippedNoVote }));
  ok('T3 low-margin book: roughly coin-flip win rate', Math.abs(r1.overall.winRate - 50) < 15, `${r1.overall.winRate}%`);
  ok('T3 MFE/MAE reported and E-ratio computed (follow: MFE=runPips=15p, MAE=fadePips=5p on wins/losses alike -> E~=3)', Math.abs(r1.overall.eRatio - 3) < 0.01, JSON.stringify(r1.overall));

  const r2 = reviewVoteBacktest(touches2, bookAllThree, { rearmFrac: 0.3 });
  ok('T3 higher-margin book: win rate noticeably higher than the low-margin book (dose-response sanity)', r2.overall.winRate > r1.overall.winRate, `${r2.overall.winRate}% vs ${r1.overall.winRate}%`);

  const rP90 = reviewVoteBacktest(p90Touches, book, { rearmFrac: 0.3 });
  ok('T3 p90 excluded by default', rP90.overall.n === 0 && rP90.oosTotal === 0);
  const rP90Included = reviewVoteBacktest(p90Touches, book, { rearmFrac: 0.3, excludeRungs: [] });
  ok('T3 p90 can be included if explicitly asked for', rP90Included.oosTotal === 1);

  ok('T3 byRung and byMargin break down the SAME touches (byMargin totals match overall n)',
     Object.values(r1.byMargin).reduce((s, v) => s + v.n, 0) === r1.overall.n);

  ok('T3 returns null (not throw) with no book', reviewVoteBacktest(touches, null) === null);
}

// ── Test 4: byDecision/byMarginDecision separate fade from follow ──────────
// Same book, two DIFFERENT dimension subsets on the same cell so one group of
// touches votes follow and another votes fade — proves the pooled overall
// E-ratio can hide a fade/follow MIX effect: here both groups have IDENTICAL
// fadePips/runPips (5 and 20), so the only reason their E-ratios differ is
// which pip figure gets labelled MFE vs MAE by `reorientExcursion` — exactly
// the ladder-geometry point (outer barrier farther than inner) that a pooled
// number would mask.
{
  const book = mkBook([['dimA', 'high', true], ['dimB', 'high', false], ['dimC', 'high', false]]);
  const touches = [];
  for (let i = 0; i < 10; i++) {
    touches.push({ instrument: 'EURUSD', side: 'up', rung: 'p50', rearmFrac: 0.3, date: `2022-05-${String(1 + i).padStart(2, '0')}`,
      dimA: 'high', outcome: i < 7 ? 'out' : 'back', fadePips: 5, runPips: 20, pip: 0.0001, open: 1.1 });        // votes follow, margin 1
    touches.push({ instrument: 'EURUSD', side: 'up', rung: 'p50', rearmFrac: 0.3, date: `2022-06-${String(1 + i).padStart(2, '0')}`,
      dimB: 'high', dimC: 'high', outcome: i < 7 ? 'back' : 'out', fadePips: 5, runPips: 20, pip: 0.0001, open: 1.1 }); // votes fade, margin 2
  }
  const r = reviewVoteBacktest(touches, book, { rearmFrac: 0.3 });
  ok('T4 byDecision splits follow/fade into separate n=10 groups', r.byDecision.follow?.n === 10 && r.byDecision.fade?.n === 10, JSON.stringify({ follow: r.byDecision.follow?.n, fade: r.byDecision.fade?.n }));
  ok('T4 follow E-ratio > 1 (MFE=runPips=20 > MAE=fadePips=5)', r.byDecision.follow.eRatio > 1, r.byDecision.follow.eRatio);
  ok('T4 fade E-ratio < 1 on the SAME underlying pips (MFE=fadePips=5 < MAE=runPips=20)', r.byDecision.fade.eRatio < 1, r.byDecision.fade.eRatio);
  ok('T4 byMarginDecision keys are margin|decision and partition the same rows', r.byMarginDecision['1|follow']?.n === 10 && r.byMarginDecision['2|fade']?.n === 10, JSON.stringify(Object.keys(r.byMarginDecision)));
  ok('T4 byDecision totals match overall n', r.byDecision.follow.n + r.byDecision.fade.n === r.overall.n);
}

// ── Test 5: priceBarrierTrade prices the FIXED target/stop, not MFE/MAE ────
{
  const base = { open: 1.1, pip: 0.0001, innerDistPips: 10, outerDistPips: 25 };
  const fadeWin = priceBarrierTrade({ ...base, outcome: 'back' }, 'fade', 0);
  ok('T5 fade win: pnlPips = +innerDistPips (target hit)', fadeWin.win === true && fadeWin.pnlPips === 10, JSON.stringify(fadeWin));
  const fadeLoss = priceBarrierTrade({ ...base, outcome: 'out' }, 'fade', 0);
  ok('T5 fade loss: pnlPips = -outerDistPips (stop hit)', fadeLoss.win === false && fadeLoss.pnlPips === -25, JSON.stringify(fadeLoss));
  const followWin = priceBarrierTrade({ ...base, outcome: 'out' }, 'follow', 0);
  ok('T5 follow win: pnlPips = +outerDistPips', followWin.win === true && followWin.pnlPips === 25, JSON.stringify(followWin));
  const followLoss = priceBarrierTrade({ ...base, outcome: 'back' }, 'follow', 0);
  ok('T5 follow loss: pnlPips = -innerDistPips', followLoss.win === false && followLoss.pnlPips === -10, JSON.stringify(followLoss));

  const withCost = priceBarrierTrade({ ...base, outcome: 'back' }, 'fade', 0.05);
  const grossPct = fadeWin.pnlPips * base.pip / base.open * 100;
  ok('T5 cost is subtracted from pnlPct, not from pnlPips', Math.abs(withCost.pnlPct - (grossPct - 0.05)) < 1e-3, JSON.stringify(withCost));

  const noOuter = priceBarrierTrade({ ...base, outerDistPips: null, outcome: 'back' }, 'follow', 0);
  ok('T5 a follow bet with no outer rung (p90) cannot be priced -> null, not a bad number', noOuter === null);
  const noOpen = priceBarrierTrade({ ...base, open: null, outcome: 'back' }, 'fade', 0);
  ok('T5 no open price -> null, not a throw', noOpen === null);
}

// ── Test 6/7: buildBarrierTrades + runBarrierWalkForward end-to-end ────────
{
  const book = mkBook([['dimA', 'high', true], ['dimB', 'high', true], ['dimC', 'high', false]]);
  const touches = [];
  for (let i = 0; i < 40; i++) {
    const year = i < 20 ? '2022' : '2023';
    touches.push({
      instrument: 'EURUSD', side: 'up', rung: 'p50', rearmFrac: 0.3,
      date: `${year}-0${1 + (i % 9)}-15`, time: 1700000000 + i * 3600, resolveTime: 1700003600 + i * 3600,
      dimA: 'high', dimB: 'high', dimC: 'high',   // 2 out-votes (dimA,dimB) vs 1 back-vote (dimC) -> follow, margin 1
      outcome: i % 3 === 0 ? 'back' : 'out',      // ~67% win for a follow decision
      innerDistPips: 8, outerDistPips: 20, pip: 0.0001, open: 1.1,
    });
  }
  const trades = buildBarrierTrades(touches, book, { rearmFrac: 0.3 });
  ok('T6 buildBarrierTrades returns one priced row per decided OOS touch', trades.length === 40, trades.length);
  ok('T6 every trade carries the decision + margin + real pnlPct (not MFE/MAE)', trades.every(t => t.decision === 'follow' && t.margin === 1 && Number.isFinite(t.pnlPct)));
  ok('T6 win pnlPips is the FIXED outerDistPips=20, not a path-dependent excursion', trades.filter(t => t.win).every(t => t.pnlPct > 0));

  const highMargin = buildBarrierTrades(touches, book, { rearmFrac: 0.3, minMargin: 2 });
  ok('T6 minMargin filters out lower-margin touches (all these are margin=1)', highMargin.length === 0, highMargin.length);

  const wf = runBarrierWalkForward(touches, book, { rearmFrac: 0.3, cost: 0.01 });
  ok('T7 tradesUsed matches buildBarrierTrades count', wf.tradesUsed === trades.length);
  ok('T7 byYear splits 2022/2023 into 20 trades each', wf.byYear['2022']?.trades === 20 && wf.byYear['2023']?.trades === 20, JSON.stringify({ y22: wf.byYear['2022']?.trades, y23: wf.byYear['2023']?.trades }));
  ok('T7 costStress 1x matches overall (same cost)', wf.costStress['1x'].expectancy === wf.overall.expectancy, JSON.stringify({ x1: wf.costStress['1x'].expectancy, overall: wf.overall.expectancy }));
  ok('T7 costStress 3x expectancy is lower than 1x (heavier cost drag)', wf.costStress['3x'].expectancy < wf.costStress['1x'].expectancy, JSON.stringify({ x1: wf.costStress['1x'].expectancy, x3: wf.costStress['3x'].expectancy }));
  ok('T7 returns null (not throw) with no book', runBarrierWalkForward(touches, null) === null);
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
