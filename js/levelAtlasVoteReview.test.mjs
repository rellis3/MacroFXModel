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
import { voteDecision, reorientExcursion, reviewVoteBacktest, priceBarrierTrade, buildBarrierTrades, runBarrierWalkForward, priceAtTighterStop, runStopStudy, runExitVariantStudy, applyConcurrencyCap, buildPortfolioDailySeries, inverseVolWeights, riskAdjustTrades, applyPortfolioHeatCap, applyDrawdownThrottle, applyFadeStopTightening } from './levelAtlasVoteReview.js';

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
      innerDistPips: 8, outerDistPips: 20, pip: 0.0001, open: 1.1, session: 'London',
      fadePips: 3, runPips: 12,
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

  // ── Test 8: trades carry session + REAL path-based MAE/MFE (for a
  // tearsheet's session breakdown and CSV MAE column — not the fixed
  // target/stop distance, the actual worst/best point the path reached).
  // These touches are all 'follow' decisions, so per reorientExcursion's
  // convention MFE=runPips=12, MAE=fadePips=3.
  ok('T8 every trade carries its session, unchanged from the touch', trades.every(t => t.session === 'London'));
  ok('T8 MAE/MFE come from the real path (fadePips/runPips), not the fixed stop/target distance',
     trades.every(t => t.maePct != null && t.mfePct != null && t.maePct !== t.stopPips && t.mfePct !== t.targetPips));
  const expectMaePct = +(3 * 0.0001 / 1.1 * 100).toFixed(4);
  ok('T8 MAE value matches fadePips reoriented for a follow decision', Math.abs(trades[0].maePct - expectMaePct) < 1e-6, JSON.stringify({ got: trades[0].maePct, expect: expectMaePct }));
}

// ── Test 9: priceAtTighterStop — tightening-only, no M1 re-walk ────────────
{
  const base = { entry: 1.1, pip: 0.0001, stopPips: 20, targetPips: 10, pnlPct: +(10 * 0.0001 / 1.1 * 100).toFixed(4), win: true, maePips: 5 };
  const untouched = priceAtTighterStop(base, 8, 0);
  ok('T9 win whose real MAE (5p) never reaches the candidate stop (8p) -> unchanged', untouched.win === true && untouched.pnlPct === base.pnlPct, JSON.stringify(untouched));

  const flipped = priceAtTighterStop(base, 3, 0);
  ok('T9 win whose real MAE (5p) EXCEEDS a tighter candidate stop (3p) -> flips to a loss at -3p', flipped.win === false, JSON.stringify(flipped));
  const expectFlippedPct = +(-(3 * 0.0001 / 1.1 * 100)).toFixed(4);
  ok('T9 flipped loss is sized at the TIGHTER stop, not the original', Math.abs(flipped.pnlPct - expectFlippedPct) < 1e-6, JSON.stringify({ got: flipped.pnlPct, expect: expectFlippedPct }));

  const lossTrade = { entry: 1.1, pip: 0.0001, stopPips: 20, targetPips: 10, pnlPct: -(20 * 0.0001 / 1.1 * 100), win: false, maePips: 20 };
  const tightenedLoss = priceAtTighterStop(lossTrade, 10, 0);
  ok('T9 an already-losing trade stays a loss but SHRINKS at a tighter stop (20p -> 10p)', tightenedLoss.win === false, JSON.stringify(tightenedLoss));
  const expectShrunkPct = +(-(10 * 0.0001 / 1.1 * 100)).toFixed(4);
  ok('T9 shrunk loss is exactly the tighter stop size', Math.abs(tightenedLoss.pnlPct - expectShrunkPct) < 1e-6, JSON.stringify({ got: tightenedLoss.pnlPct, expect: expectShrunkPct }));

  const widerIgnored = priceAtTighterStop(base, 30, 0);
  ok('T9 a WIDER candidate stop (30p > original 20p) is clamped to the original — never widened past what real data can support', widerIgnored.win === true && widerIgnored.pnlPct === base.pnlPct, JSON.stringify(widerIgnored));

  ok('T9 no real MAE on the trade -> null, not a bad number', priceAtTighterStop({ ...base, maePips: null }, 5, 0) === null);
  ok('T9 no entry price -> null, not a throw', priceAtTighterStop({ ...base, entry: null }, 5, 0) === null);

  const withCost = priceAtTighterStop(base, 3, 0.01);
  ok('T9 cost is subtracted on the flipped loss too', Math.abs(withCost.pnlPct - (expectFlippedPct - 0.01)) < 1e-6, JSON.stringify(withCost));
}

// ── Test 10: runStopStudy — grids candidate stops off REAL winners' MAE,
// sliced per session, picks the best by Sharpe among candidates with real n ─
{
  const entry = 1.1, pip = 0.0001, stopPips = 20, targetPips = 10;
  const mkTrade = (win, maePips, session, i) => ({
    entry, pip, stopPips, targetPips, win, maePips, session,
    date: `2022-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
    pnlPct: win ? +(targetPips * pip / entry * 100).toFixed(4) : +(-(stopPips * pip / entry * 100)).toFixed(4),
  });
  const london = [];
  // 25 winners with real MAE spread 1..19p (all < the 20p stop, as any real
  // win must be) + 15 losses whose MAE ≈ the stop itself (how a real loss's
  // decision-agnostic MAE actually comes out — the resolution loop stops the
  // instant the barrier is hit, so it can't see past it).
  for (let i = 0; i < 25; i++) london.push(mkTrade(true, 1 + (i % 19), 'London', i));
  for (let i = 0; i < 15; i++) london.push(mkTrade(false, stopPips, 'London', i + 25));
  const ny = [mkTrade(true, 4, 'NY', 0), mkTrade(false, stopPips, 'NY', 1), mkTrade(true, 6, 'NY', 2)];   // too few to grid
  const trades = [...london, ...ny];

  const bySession = runStopStudy(trades, { sliceBy: t => t.session, minN: 10 });
  ok('T10 splits into London/NY slices', Object.keys(bySession).sort().join(',') === 'London,NY', JSON.stringify(Object.keys(bySession)));
  ok('T10 London band matches a plain summarizeTrades of its own original pnls', bySession.London.band.trades === 40 && bySession.London.band.winRate === 62.5, JSON.stringify(bySession.London.band));
  ok('T10 NY has too few winners to grid -> empty candidates, no best, explanatory note', bySession.NY.candidates.length === 0 && bySession.NY.best === null && !!bySession.NY.note, JSON.stringify(bySession.NY));
  ok('T10 London grids real candidates with stopPips drawn from ITS OWN winners (all < the original 20p stop)', bySession.London.candidates.length > 0 && bySession.London.candidates.every(c => c.stopPips < stopPips), JSON.stringify(bySession.London.candidates.map(c => c.stopPips)));
  ok('T10 a tightened candidate never has a WORSE win rate ceiling than possible (sanity: trades count matches the slice)', bySession.London.candidates.every(c => c.trades === 40));

  const overall = runStopStudy(trades, { minN: 10 });
  ok('T10 sliceBy omitted -> one pooled "overall" group', Object.keys(overall).join(',') === 'overall' && overall.overall.n === trades.length, JSON.stringify(Object.keys(overall)));

  ok('T10 no trades -> null, not a throw', runStopStudy([]) === null && runStopStudy(null) === null);
}

// ── Test 11: runExitVariantStudy — reuses forecastAnalyser's ALREADY-
// VALIDATED simulateExitVariants against a hand-built M1 path, hand-verified
// by arithmetic before running: a 'follow' trade whose price climbs cleanly
// through the fixed target (+20p at bar 10) then KEEPS climbing to a peak
// (+50p at bar 25) before reversing — 'fixed'/'chand' must exit at the
// original target (never see the extra run since both still check TP),
// 'ride' (no TP) must ride the trail all the way to peak-5p (trailFrac=0.5 x
// R=10p stop distance) = +45p, a materially better real result.
{
  const day = Date.UTC(2022, 0, 10, 8, 0, 0) / 1000;   // 2022-01-10 08:00 UTC, January -> no BST, clean 'Europe/London' key
  const n = 30;
  const times = new Int32Array(n), opens = new Float32Array(n), highs = new Float32Array(n),
        lows = new Float32Array(n), closes = new Float32Array(n), volumes = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    times[i] = day + i * 60;
    if (i <= 25) {
      const px = 1.1000 + i * 0.0002;                  // steady climb, +2p/bar, bar10=1.1020 (target), bar25=1.1050 (peak)
      opens[i] = highs[i] = lows[i] = closes[i] = px;
    } else if (i === 26) {
      opens[i] = 1.1050; highs[i] = 1.1050; lows[i] = 1.1040; closes[i] = 1.1040;   // reversal bar, breaches the 1.1045 trail
    } else {
      opens[i] = highs[i] = lows[i] = closes[i] = 1.1030;   // tail bars, irrelevant — everything should have exited by bar 26
    }
    volumes[i] = 10;
  }
  const packed = { n, times, opens, highs, lows, closes, volumes };

  const entry = 1.1000, pip = 0.0001;
  const fixedPnlPct = +((1.1020 - entry) / entry * 100).toFixed(4);   // +20p, the ALREADY-VALIDATED atlasWalk result
  const trade = {
    date: '2022-01-10', time: times[0], entry, pip, side: 'up', decision: 'follow',
    targetPips: 20, stopPips: 10,   // follow: target=outer(+20p)=1.1020, stop=inner(-10p)=1.0990
    pnlPct: fixedPnlPct, win: true,
  };

  const study = runExitVariantStudy([trade], packed, { trailFrac: 0.5, beTrigger: 0.5, cost: 0 });
  ok('T11 matches the trade to its real M1 session (no unmatched)', study.n === 1 && study.unmatched === 0, JSON.stringify({ n: study.n, unmatched: study.unmatched }));
  ok('T11 cross-check: replaying the SAME fixed rule via simulateExitVariants matches the already-validated pnlPct almost exactly', study.crossCheck.maxAbsDiffPct < 0.001, JSON.stringify(study.crossCheck));
  ok('T11 fixed summary total matches the hand-computed +20p result', Math.abs(study.fixed.totalPnl - fixedPnlPct) < 0.001, JSON.stringify(study.fixed));
  ok('T11 chand matches fixed in a clean run-to-target (TP is hit long before any dip could trigger the trail)', Math.abs(study.chand.totalPnl - fixedPnlPct) < 0.001, JSON.stringify(study.chand));
  const expectRidePct = +((1.1045 - entry) / entry * 100).toFixed(4);
  ok('T11 ride (no TP cap) rides the trail to the hand-computed peak-minus-trail exit (+45p), materially beating fixed', Math.abs(study.ride.totalPnl - expectRidePct) < 0.001, JSON.stringify({ got: study.ride.totalPnl, expect: expectRidePct }));
  ok('T11 ride genuinely beats fixed here — this is the "let winners run" hypothesis working on a controlled path', study.ride.totalPnl > study.fixed.totalPnl * 2);

  // A trade whose date has no matching M1 session at all -> unmatched, not a throw.
  const orphan = { ...trade, date: '2099-01-01' };
  const studyOrphan = runExitVariantStudy([orphan], packed, {});
  ok('T11 a trade with no matching session date -> unmatched, excluded, not a throw', studyOrphan.n === 0 && studyOrphan.unmatched === 1);

  ok('T11 no trades / no packed data -> null, not a throw', runExitVariantStudy([], packed) === null && runExitVariantStudy([trade], null) === null);
}

// ── Test 12: applyConcurrencyCap — the answer to the concurrency finding
// (346/622 EURUSD margin>=3 trading days have 2+ trades, 279 genuinely
// overlap in time). Hand-verified timeline, T0 = arbitrary anchor:
//   t1 (long,  T0     -> T0+100)
//   t4 (short, T0+30  -> T0+80)   overlaps t1 in TIME, OPPOSITE direction
//   t2 (long,  T0+50  -> T0+120)  overlaps t1 in TIME, SAME direction
//   t3 (long,  T0+150 -> T0+200)  opens AFTER t1 has resolved — no overlap
{
  const T0 = 1700000000;
  const t1 = { time: T0, resolveTime: T0 + 100, date: '2022-01-01', side: 'up', decision: 'follow', pnlPct: 0.10 };      // long
  const t4 = { time: T0 + 30, resolveTime: T0 + 80, date: '2022-01-01', side: 'down', decision: 'follow', pnlPct: 0.05 }; // short
  const t2 = { time: T0 + 50, resolveTime: T0 + 120, date: '2022-01-01', side: 'up', decision: 'follow', pnlPct: 0.20 }; // long
  const t3 = { time: T0 + 150, resolveTime: T0 + 200, date: '2022-01-02', side: 'up', decision: 'follow', pnlPct: 0.15 }; // long

  const capped = applyConcurrencyCap([t1, t2, t3, t4], { maxConcurrent: 1, perDirection: false });
  ok('T12 maxConcurrent=1, global: keeps t1 (first) and t3 (opens after t1 resolved), skips t4/t2 (both overlap t1)',
     capped.kept === capped.kept && capped.kept.map(t => t.pnlPct).sort().join(',') === [t1.pnlPct, t3.pnlPct].sort().join(','),
     JSON.stringify({ kept: capped.kept.map(t => t.pnlPct), skipped: capped.skipped.map(t => t.pnlPct) }));
  ok('T12 skippedCount/totalCount are correct', capped.skippedCount === 2 && capped.totalCount === 4);
  ok('T12 keptSummary matches a plain summarizeTrades of the KEPT trades only', capped.keptSummary.trades === 2);

  const perDir = applyConcurrencyCap([t1, t2, t3, t4], { maxConcurrent: 1, perDirection: true });
  ok('T12 perDirection=true: t1 (long) and t4 (short) BOTH kept despite overlapping in time — separate budgets',
     perDir.kept.some(t => t === t1) && perDir.kept.some(t => t === t4),
     JSON.stringify(perDir.kept.map(t => t.pnlPct)));
  ok('T12 perDirection=true: t2 (same direction as t1, still overlapping) is the ONLY one skipped', perDir.skippedCount === 1 && perDir.skipped[0] === t2);

  const wider = applyConcurrencyCap([t1, t2, t3], { maxConcurrent: 2, perDirection: false });
  ok('T12 maxConcurrent=2 allows t1 AND t2 to coexist (both long, both overlapping, but under the wider cap)', wider.skippedCount === 0 && wider.kept.length === 3, JSON.stringify({ kept: wider.kept.length, skipped: wider.skippedCount }));

  ok('T12 no trades -> null, not a throw', applyConcurrencyCap([]) === null && applyConcurrencyCap(null) === null);
}

// ── Test 13: buildPortfolioDailySeries / inverseVolWeights ─────────────────
{
  const pairA = [{ date: '2022-01-01', pnlPct: 1.0 }, { date: '2022-01-03', pnlPct: 2.0 }];
  const pairB = [{ date: '2022-01-02', pnlPct: 4.0 }];

  const eq = buildPortfolioDailySeries({ pairA, pairB });
  ok('T13 equal weight (default): non-overlapping dates each just scaled by 1/n',
     JSON.stringify(eq.dates) === JSON.stringify(['2022-01-01', '2022-01-02', '2022-01-03']) &&
     JSON.stringify(eq.dailyReturns) === JSON.stringify([0.5, 2.0, 1.0]),
     JSON.stringify(eq));
  ok('T13 byPair reports each pair\'s own trade count and the weight actually used', eq.byPair.pairA.trades === 2 && eq.byPair.pairA.weight === 0.5 && eq.byPair.pairB.weight === 0.5);

  const sameDay = buildPortfolioDailySeries({ pairA: [{ date: 'd1', pnlPct: 1.0 }], pairB: [{ date: 'd1', pnlPct: 3.0 }] });
  ok('T13 two pairs firing the SAME day: contributions sum on that date', sameDay.dailyReturns[0] === 2.0, JSON.stringify(sameDay));

  const custom = buildPortfolioDailySeries({ pairA: [{ date: 'd1', pnlPct: 1.0 }], pairB: [{ date: 'd1', pnlPct: 1.0 }] }, { weights: { pairA: 0.8, pairB: 0.2 } });
  ok('T13 custom weights apply correctly (0.8x1 + 0.2x1 = 1.0)', Math.abs(custom.dailyReturns[0] - 1.0) < 1e-9, JSON.stringify(custom));

  const missingWeight = buildPortfolioDailySeries({ pairA: [{ date: 'd1', pnlPct: 2 }], pairB: [{ date: 'd1', pnlPct: 100 }] }, { weights: { pairA: 1.0 } });
  ok('T13 a pair missing from weights defaults to 0 (excluded), not an error', missingWeight.dailyReturns[0] === 2.0 && missingWeight.byPair.pairB.weight === 0, JSON.stringify(missingWeight));

  const sameDaySameP = buildPortfolioDailySeries({ pairA: [{ date: 'd1', pnlPct: 1 }, { date: 'd1', pnlPct: 2 }] }, { weights: { pairA: 1 } });
  ok('T13 same-pair same-day trades are summed FIRST, then weighted (1+2=3, not counted as two separate 1x and 2x periods)', sameDaySameP.dailyReturns[0] === 3 && sameDaySameP.dates.length === 1, JSON.stringify(sameDaySameP));

  ok('T13 empty input -> null, not a throw', buildPortfolioDailySeries({}) === null && buildPortfolioDailySeries(null) === null);

  // Inverse-vol weights: pairA has big swings, pairB is much steadier -> pairB gets the bigger weight.
  const volatile = Array.from({ length: 10 }, (_, i) => ({ date: `2022-01-${String(i + 1).padStart(2, '0')}`, pnlPct: i % 2 === 0 ? 5 : -5 }));
  const steady = Array.from({ length: 10 }, (_, i) => ({ date: `2022-01-${String(i + 1).padStart(2, '0')}`, pnlPct: i % 2 === 0 ? 0.5 : -0.5 }));
  const ivw = inverseVolWeights({ volatile, steady });
  ok('T13 inverseVolWeights gives the STEADIER pair the bigger weight', ivw.steady > ivw.volatile, JSON.stringify(ivw));
  ok('T13 inverseVolWeights sum to ~1', Math.abs(ivw.volatile + ivw.steady - 1) < 1e-3, JSON.stringify(ivw));

  const zeroVol = inverseVolWeights({ flat: [{ date: 'd1', pnlPct: 1 }, { date: 'd2', pnlPct: 1 }], volatile });
  ok('T13 a zero-variance pair gets weight 0 rather than a divide-by-zero blowup', zeroVol.flat === 0 && zeroVol.volatile === 1, JSON.stringify(zeroVol));

  ok('T13 inverseVolWeights empty input -> null, not a throw', inverseVolWeights({}) === null && inverseVolWeights(null) === null);
}

// ── Test 14: riskAdjustTrades ───────────────────────────────────────────────
{
  // entry=1.0, pip=0.0001, stopPips=25 -> stop risk% = 25*0.0001/1.0*100 = 0.25%.
  // pnlPct=0.5% is exactly a 2R winner; pnlPct=-0.25% is exactly a 1R loser.
  const winner = { entry: 1.0, pip: 0.0001, stopPips: 25, pnlPct: 0.5, date: 'd1' };
  const loser = { entry: 1.0, pip: 0.0001, stopPips: 25, pnlPct: -0.25, date: 'd2' };
  const adj1 = riskAdjustTrades([winner, loser], 1);
  ok('T14 2R winner at 1% risk -> pnlPct 2.0%, rMultiple 2', adj1[0].pnlPct === 2 && adj1[0].rMultiple === 2, JSON.stringify(adj1[0]));
  ok('T14 1R loser at 1% risk -> pnlPct -1.0%, rMultiple -1', adj1[1].pnlPct === -1 && adj1[1].rMultiple === -1, JSON.stringify(adj1[1]));

  const adj2 = riskAdjustTrades([winner], 2.5);
  ok('T14 same 2R winner at 2.5% risk scales linearly -> pnlPct 5.0%, rMultiple unchanged at 2', adj2[0].pnlPct === 5 && adj2[0].rMultiple === 2, JSON.stringify(adj2[0]));

  ok('T14 non-pnlPct fields (date, etc) pass through unchanged', adj1[0].date === 'd1' && adj1[1].date === 'd2');

  const zeroStop = { entry: 1.0, pip: 0.0001, stopPips: 0, pnlPct: 0.5, date: 'd3' };
  const adjZero = riskAdjustTrades([zeroStop], 1);
  ok('T14 zero stop distance -> pnlPct 0, rMultiple 0 (no divide-by-zero blowup)', adjZero[0].pnlPct === 0 && adjZero[0].rMultiple === 0, JSON.stringify(adjZero[0]));

  ok('T14 empty/null input -> empty array, not a throw', riskAdjustTrades([]).length === 0 && riskAdjustTrades(null).length === 0);

  const defaultRisk = riskAdjustTrades([winner]);
  ok('T14 default riskPct is 1', defaultRisk[0].pnlPct === 2, JSON.stringify(defaultRisk[0]));
}

// ── Test 15: applyConcurrencyCap's heatOf option ────────────────────────────
{
  // maxConcurrent=1 with default heatOf still behaves exactly as before (count-based).
  const plain = applyConcurrencyCap(
    [{ time: 0, resolveTime: 10, pnlPct: 1, date: 'a' }, { time: 5, resolveTime: 15, pnlPct: 1, date: 'b' }],
    { maxConcurrent: 1 },
  );
  ok('T15 default heatOf=1 leaves count-based behaviour unchanged', plain.kept.length === 1 && plain.skipped.length === 1);

  // A: [0,10) heat 0.5; B: [2,8) heat 0.5 (overlaps A, combined heat exactly 1.0 -> both fit);
  // C: [3,12) heat 0.6 (overlaps A+B, combined open heat 1.0 + 0.6 = 1.6 -> skipped);
  // D: [9,15) heat 0.4 (only A still open at t=9 since B resolved at 8 -> 0.5+0.4=0.9 -> kept).
  const A = { time: 0, resolveTime: 10, heat: 0.5, date: 'A' };
  const B = { time: 2, resolveTime: 8, heat: 0.5, date: 'B' };
  const C = { time: 3, resolveTime: 12, heat: 0.6, date: 'C' };
  const D = { time: 9, resolveTime: 15, heat: 0.4, date: 'D' };
  const heat = applyConcurrencyCap([A, B, C, D], { maxConcurrent: 1, heatOf: t => t.heat });
  ok('T15 weighted heat: A, B and D fit the 1.0 budget, C alone is skipped',
     heat.kept.map(t => t.date).join(',') === 'A,B,D' && heat.skipped.map(t => t.date).join(',') === 'C',
     JSON.stringify({ kept: heat.kept.map(t => t.date), skipped: heat.skipped.map(t => t.date) }));
}

// ── Test 16: applyPortfolioHeatCap ──────────────────────────────────────────
{
  // pairA's trade [0,10) and pairB's trade [2,8) overlap — each pair's OWN
  // per-pair cap would pass both (one trade each), but combined they'd risk
  // 2% at once, which a 1%-max portfolio heat cap must catch.
  const pairA = [{ time: 0, resolveTime: 10, riskPctUsed: 1, pnlPct: 2, date: 'd1', pair: 'EURUSD' }];
  const pairB = [{ time: 2, resolveTime: 8, riskPctUsed: 1, pnlPct: -1, date: 'd2', pair: 'GOLD' }];

  const capped = applyPortfolioHeatCap({ EURUSD: pairA, GOLD: pairB }, { maxHeatPct: 1 });
  ok('T16 1%-max heat cap keeps only the FIRST overlapping trade chronologically', capped.kept.length === 1 && capped.kept[0].pair === 'EURUSD', JSON.stringify(capped.kept));
  ok('T16 skippedCount/totalCount are correct', capped.skippedCount === 1 && capped.totalCount === 2);

  const wide = applyPortfolioHeatCap({ EURUSD: pairA, GOLD: pairB }, { maxHeatPct: 2 });
  ok('T16 a 2%-max heat cap allows both overlapping 1% trades', wide.kept.length === 2);

  ok('T16 empty/null input -> null, not a throw', applyPortfolioHeatCap({}) === null && applyPortfolioHeatCap(null) === null);

  ok('T16 a trade with no riskPctUsed falls back to heat 1 (count-based)',
     applyPortfolioHeatCap({ EURUSD: [{ time: 0, resolveTime: 10, pnlPct: 1, date: 'x' }] }, { maxHeatPct: 1 }).kept.length === 1);
}

// ── Test 17: applyDrawdownThrottle ──────────────────────────────────────────
{
  // Hand-derived scenario, default params (trigger -5%, restore 0%, mult 0.5x):
  // A +10% -> equity 1.10, peak 1.10, dd was 0 -> not triggered.
  // B  -8% -> equity 1.012, peak stays 1.10, dd was 0 (pre-B) -> not triggered.
  // C  -6% -> dd BEFORE C = (1.012-1.10)/1.10*100 = -8.0% <= -5 -> TRIGGERS now;
  //           this day's own return IS throttled (0.5x) -> scaled -3%, equity 0.98164.
  // D +20% -> dd before = -10.76%, still throttled -> scaled +10%, equity 1.079804.
  // E  +4% -> dd before = -1.836%, still throttled (not yet a new high) -> scaled +2%,
  //           equity 1.1014000..., which IS a new high (>1.10) -> peak updates to it.
  // F  +3% -> dd before = 0% (AT the new peak) -> restores (>=0) -> mult back to 1x -> scaled +3%.
  const dates = ['A', 'B', 'C', 'D', 'E', 'F'];
  const raw = [10, -8, -6, 20, 4, 3];
  const r = applyDrawdownThrottle(raw, dates);
  ok('T17 multiplier sequence matches the hand-derived trigger/restore timeline',
     JSON.stringify(r.state.map(s => s.mult)) === JSON.stringify([1, 1, 0.5, 0.5, 0.5, 1]),
     JSON.stringify(r.state.map(s => s.mult)));
  ok('T17 throttled boolean sequence', JSON.stringify(r.state.map(s => s.throttled)) === JSON.stringify([false, false, true, true, true, false]));
  ok('T17 scaled daily returns match (raw × that day\'s multiplier)', JSON.stringify(r.dailyReturns) === JSON.stringify([10, -8, -3, 10, 2, 3]), JSON.stringify(r.dailyReturns));
  ok('T17 the trade\'s OWN day return never influences its OWN multiplier (C is throttled using B\'s outcome, not C\'s)', r.state[2].mult === 0.5);

  // Cross-check: recompounding the function's OWN output reproduces the equity
  // path it internally used to make its decisions (self-consistency, same
  // discipline as runExitVariantStudy's crossCheck).
  let eq = 1;
  for (const d of r.dailyReturns) eq *= (1 + d / 100);
  ok('T17 recompounding the output matches the hand-derived final equity (~1.13444)', Math.abs(eq - 1.13444208) < 1e-4, eq);

  // A strategy that never draws down 5% should never throttle at all.
  const noTrigger = applyDrawdownThrottle([1, 1, -1, 1, -2, 1], dates);
  ok('T17 a drawdown that never breaches the trigger never throttles', noTrigger.state.every(s => !s.throttled && s.mult === 1));

  // Custom params: a tighter trigger (-2%) and a stricter restore (must get
  // all the way back to +1% above the OLD peak, not just to breakeven).
  const custom = applyDrawdownThrottle([0, -3, -3, 5, 5], dates.slice(0, 5), { triggerDD: -2, restoreDD: 1, throttleMult: 0.25 });
  ok('T17 custom triggerDD/restoreDD/throttleMult are honoured (tighter trigger fires sooner)', custom.state[2].throttled === true);

  ok('T17 empty/null input -> null, not a throw', applyDrawdownThrottle([], []) === null && applyDrawdownThrottle(null, null) === null);
}

// ── Test 18: applyFadeStopTightening ────────────────────────────────────────
{
  const entry = 1.1, pip = 0.0001, stopPips = 20, targetPips = 10;
  const mk = (decision, win, maePips, i) => ({
    entry, pip, stopPips, targetPips, decision, win, maePips,
    date: `2022-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
    pnlPct: win ? +(targetPips * pip / entry * 100).toFixed(4) : +(-(stopPips * pip / entry * 100)).toFixed(4),
  });
  const fade = [];
  for (let i = 0; i < 25; i++) fade.push(mk('fade', true, 1 + (i % 19), i));   // 25 winners, real MAE 1..19p
  for (let i = 0; i < 15; i++) fade.push(mk('fade', false, stopPips, i + 25)); // 15 losers at the full stop
  const follow = [mk('follow', true, 3, 0), mk('follow', false, stopPips, 1), mk('follow', true, 8, 2)]; // too few to grid, and must stay untouched regardless
  const trades = [...fade, ...follow];

  const result = applyFadeStopTightening(trades, { minN: 10 });
  ok('T18 finds a real candidate stop (enough fade winners) and reports it', result.stopPips != null && result.stopPips < stopPips, JSON.stringify({ stopPips: result.stopPips, percentile: result.percentile }));
  ok('T18 returns the SAME number of trades (re-prices in place, never drops any)', result.trades.length === trades.length);

  const retunedFollow = result.trades.filter(t => t.decision === 'follow');
  ok('T18 follow trades are COMPLETELY untouched (same pnlPct/win/stopPips as input)', follow.every((orig, i) => retunedFollow[i].pnlPct === orig.pnlPct && retunedFollow[i].win === orig.win && retunedFollow[i].stopPips === orig.stopPips));

  const retunedFade = result.trades.filter(t => t.decision === 'fade');
  ok('T18 fade trades\' stopPips shrinks to the tighter candidate', retunedFade.every(t => t.stopPips === Math.min(result.stopPips, stopPips)));
  const flippedCount = retunedFade.filter((t, i) => t.win !== fade[i].win).length;
  ok('T18 at least one former fade WINNER flips to a loss under the tighter stop (that\'s the whole point — real MAE now exceeds it)', flippedCount > 0, `flipped=${flippedCount}`);
  ok('T18 a former loser stays a loser (tightening never turns a loss into a win)', retunedFade.filter((t, i) => !fade[i].win).every(t => t.win === false));

  // Not enough fade-winner data anywhere -> returns the ORIGINAL trades unchanged, not a degraded guess.
  const tooFew = applyFadeStopTightening(follow, { minN: 10 });
  ok('T18 too few fade winners (none here at all) -> stopPips null, trades unchanged', tooFew.stopPips === null && tooFew.trades === follow);

  ok('T18 empty/null input -> empty trades, not a throw', applyFadeStopTightening([]).trades.length === 0 && applyFadeStopTightening(null).trades.length === 0);
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
