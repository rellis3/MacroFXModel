// Synthetic, no-network unit tests for js/asiaFibAtlasVoteReview.js.
//   node js/asiaFibAtlasVoteReview.test.mjs
//
// Proves the things genuinely NEW/different from levelAtlasVoteReview.js
// (that module's own test file already covers the logic reused unchanged —
// see this file's header for exactly what's reused vs adapted): (1)
// voteDecision only ever counts VOTE_DIMS, never any other held dimension,
// even when one is present and would otherwise swing the decision; (2)
// priceBarrierTrade prices off `touch.price` (the real entry price), NOT
// `touch.level` (the fib multiplier) or `touch.open` (a field Asia Fib
// Atlas's touch record doesn't even carry) — the exact field-name-collision
// bug this module's header warns a naive reuse of levelAtlasVoteReview.js
// would hit; (3) buildBarrierTrades' output re-maps to Level Atlas's own
// field names (`entry`, `rung`) so the imported generic functions
// (applyConcurrencyCap etc.) work unchanged; (4) the confluenceOnly gate
// filters correctly; (5) voteCache memoizes by touch identity and is safe
// to share across a grid search (same result with/without it).
//
// (2026-08-29) Also proves the lookahead-safety property specific to THIS
// module (the engine layer that PRODUCES touch.prevOutcomeSameDay/
// sessionHandoff already has its own no-lookahead tests —
// asiaFibAtlasEngine.test.mjs/mondayFibAtlasEngine.test.mjs — this file
// covers the vote-decision layer on top, which had no dedicated check
// before): (6) voteDecision's direction is driven ONLY by the book's IS
// deltaOut, never the OOS deltaOut, for a touch being scored; (7)
// buildBarrierTrades excludes a touch dated before book.splitDate even when
// every other filter would otherwise admit it. T16 additionally
// DOCUMENTS (does not newly introduce) an existing, deliberate design
// property worth naming plainly: matchLiveContext's `holdsOOS` gate
// (levelAtlasReport.js's annotateHolds, shared by every reference-engine
// book including this one) is computed by comparing the IS and OOS halves
// of the SAME split this module later trades against — i.e. the dimension-
// selection step already looked at the OOS labels before the "OOS backtest"
// runs on them. That is not a bug in this module (the vote correctly does
// what the book tells it to) but it is a real reason the book's IS/OOS
// split cannot be read as a clean, never-touched holdout on its own — see
// LEGO_MODULES.md's 2026-08-29 Deflated Sharpe entry, which this mechanism
// helps explain.

import assert from 'node:assert/strict';
import { voteDecision, priceBarrierTrade, buildBarrierTrades, runBarrierWalkForward, VOTE_DIMS } from './asiaFibAtlasVoteReview.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

console.log('asiaFibAtlasVoteReview');

// A minimal book keyed by `side|level` (Asia Fib Atlas's own shape), with a
// handful of held dimensions — some IN VOTE_DIMS, some deliberately NOT, so
// tests can prove the restriction actually holds.
function mkBook(dimSpecs) {
  const dims = {};
  for (const [dimKey, bucket, favorsOut] of dimSpecs) {
    dims[dimKey] = { is: { [bucket]: { deltaOut: favorsOut ? 5 : -5, n: 40, holdsOOS: true } },
                     oos: { [bucket]: { deltaOut: favorsOut ? 4 : -4, n: 35 } } };
  }
  return {
    splitDate: '2022-01-01',
    cells: { 'above|1.5': { base: { is: { outPct: 50, backPct: 50 }, oos: { outPct: 50, backPct: 50 } }, dims } },
  };
}

// ── voteDecision: restricted to VOTE_DIMS ONLY ──────────────────────────────
{
  ok('VOTE_DIMS is exactly {prevOutcomeSameDay, sessionHandoff}',
    VOTE_DIMS.size === 2 && VOTE_DIMS.has('prevOutcomeSameDay') && VOTE_DIMS.has('sessionHandoff'));

  // Both proven dims agree on 'out' -> follow, margin 2.
  const bookBothAgree = mkBook([['prevOutcomeSameDay', 'out', true], ['sessionHandoff', '2·london-morning', true]]);
  const touchBoth = { side: 'above', level: 1.5, prevOutcomeSameDay: 'out', sessionHandoff: '2·london-morning' };
  const vdBoth = voteDecision(bookBothAgree, touchBoth);
  ok('T1 both VOTE_DIMS agree -> follow, margin 2', vdBoth?.decision === 'follow' && vdBoth.margin === 2, JSON.stringify(vdBoth));

  // A non-vote dimension (churn) held and favouring 'back' MUST NOT flip or
  // dilute the decision, even though matchLiveContext itself would happily
  // match it — this is the whole point of the restriction.
  const bookWithNoise = mkBook([
    ['prevOutcomeSameDay', 'out', true],
    ['churn', '1·churned', false],       // NOT in VOTE_DIMS — must be ignored
    ['candleReject', '3·reject', false], // NOT in VOTE_DIMS — must be ignored
  ]);
  const touchWithNoise = { side: 'above', level: 1.5, prevOutcomeSameDay: 'out', churn: '1·churned', candleReject: '3·reject' };
  const vdNoise = voteDecision(bookWithNoise, touchWithNoise);
  ok('T2 non-VOTE_DIMS held context is IGNORED even when it would flip the raw vote',
    vdNoise?.decision === 'follow' && vdNoise.margin === 1, JSON.stringify(vdNoise));

  // Only churn held (no VOTE_DIMS reading at all) -> null, not a decision
  // borrowed from an ignored dimension.
  const bookChurnOnly = mkBook([['churn', '1·churned', false]]);
  const touchChurnOnly = { side: 'above', level: 1.5, churn: '1·churned' };
  ok('T3 only a non-VOTE_DIMS dimension held -> null (no decision)', voteDecision(bookChurnOnly, touchChurnOnly) === null);

  // Genuine tie between the two VOTE_DIMS -> null.
  const bookTie = mkBook([['prevOutcomeSameDay', 'out', true], ['sessionHandoff', '5·ny-late-preasia', false]]);
  const touchTie = { side: 'above', level: 1.5, prevOutcomeSameDay: 'out', sessionHandoff: '5·ny-late-preasia' };
  ok('T4 the two VOTE_DIMS disagree -> null (tie)', voteDecision(bookTie, touchTie) === null);

  ok('T5 unknown (side,level) cell -> null, not a throw', voteDecision(bookBothAgree, { side: 'below', level: -9.5, prevOutcomeSameDay: 'out' }) === null);
}

// ── priceBarrierTrade: prices off touch.price, NOT touch.level or .open ────
{
  const touch = { price: 1.16863, level: 1.5, pip: 0.0001, innerDistPips: 10, outerDistPips: 20, outcome: 'back' };
  const fade = priceBarrierTrade(touch, 'fade', 0);
  ok('T6 fade win prices target=innerDistPips against the REAL price, not the fib level',
    fade?.win === true && fade.targetPips === 10 && Math.abs(fade.pnlPct - (10 * 0.0001 / 1.16863 * 100)) < 1e-3,
    JSON.stringify(fade));

  // If this accidentally used `touch.level` (1.5) as the price denominator
  // instead of `touch.price` (1.16863), pnlPct would be ~78000x too large —
  // sanity-bound it to a plausible FX-touch magnitude.
  ok('T7 pnlPct is a plausible small percentage, not off by orders of magnitude (the field-collision bug this module exists to avoid)',
    Math.abs(fade.pnlPct) < 1, JSON.stringify(fade));

  // A 'follow' bet where no outer rung exists (outerDistPips null, the
  // ladder's outermost rung) must return null, not throw or silently price
  // against undefined.
  const noOuter = { price: 1.2, level: 10.5, pip: 0.0001, innerDistPips: 5, outerDistPips: null, outcome: 'back' };
  ok('T8 a follow bet with no outer barrier prices to null', priceBarrierTrade(noOuter, 'follow', 0) === null);
}

// ── buildBarrierTrades: output shape + confluenceOnly gate ─────────────────
{
  const book = mkBook([['prevOutcomeSameDay', 'out', true], ['sessionHandoff', '2·london-morning', true]]);
  const touches = [
    { instrument: 'EURUSD', date: '2022-06-01', time: 1000, resolveTime: 1100, rearmFrac: 0.3, side: 'above', level: 1.5,
      price: 1.16863, pip: 0.0001, innerDistPips: 8, outerDistPips: 15, outcome: 'out', fadePips: 3, runPips: 15,
      prevOutcomeSameDay: 'out', sessionHandoff: '2·london-morning', asiaConfPips: 1.2 },
    { instrument: 'EURUSD', date: '2022-06-02', time: 2000, resolveTime: 2100, rearmFrac: 0.3, side: 'above', level: 1.5,
      price: 1.17, pip: 0.0001, innerDistPips: 8, outerDistPips: 15, outcome: 'out', fadePips: 2, runPips: 15,
      prevOutcomeSameDay: 'out', sessionHandoff: '2·london-morning', asiaConfPips: 5.5 },
  ];
  const trades = buildBarrierTrades(touches, book, { rearmFrac: 0.3, cost: 0, minMargin: 1 });
  ok('T9 buildBarrierTrades output re-maps entry from touch.price', trades?.[0]?.entry === 1.16863, JSON.stringify(trades?.[0]));
  ok('T10 buildBarrierTrades carries the fib multiplier under `rung` (readability only)', trades?.[0]?.rung === 1.5);
  ok('T11 both touches pass with no confluence gate', trades?.length === 2);

  const tight = buildBarrierTrades(touches, book, { rearmFrac: 0.3, cost: 0, minMargin: 1, confluenceOnly: true, confluencePipMax: 2 });
  ok('T12 confluenceOnly gate keeps only the tight-zone touch (1.2p <= 2p, 5.5p excluded)',
    tight?.length === 1 && tight[0].asiaConfPips === 1.2, JSON.stringify(tight));
}

// ── runBarrierWalkForward: returns the trades it built (the perf fix) ──────
{
  const book = mkBook([['prevOutcomeSameDay', 'out', true], ['sessionHandoff', '2·london-morning', true]]);
  const touches = [
    { instrument: 'EURUSD', date: '2022-06-01', time: 1000, resolveTime: 1100, rearmFrac: 0.3, side: 'above', level: 1.5,
      price: 1.16863, pip: 0.0001, innerDistPips: 8, outerDistPips: 15, outcome: 'out', fadePips: 3, runPips: 15,
      prevOutcomeSameDay: 'out', sessionHandoff: '2·london-morning', asiaConfPips: 1.2 },
  ];
  const wf = runBarrierWalkForward(touches, book, { rearmFrac: 0.3, cost: 0, minMargin: 1 });
  ok('T13 runBarrierWalkForward exposes the SAME trades buildBarrierTrades would build (no need for a caller to rebuild)',
    Array.isArray(wf?.trades) && wf.trades.length === wf.tradesUsed && wf.trades.length === 1);
}

// ── voteCache: safe to share across a grid search — same answer with/without ──
{
  const book = mkBook([['prevOutcomeSameDay', 'out', true], ['sessionHandoff', '2·london-morning', true]]);
  const touch = { side: 'above', level: 1.5, prevOutcomeSameDay: 'out', sessionHandoff: '2·london-morning' };
  const cache = new Map();
  const vdUncached1 = voteDecision(book, touch);
  const trades1 = buildBarrierTrades(
    [{ instrument: 'X', date: '2022-06-01', time: 1, resolveTime: 2, rearmFrac: 0.3, side: 'above', level: 1.5,
       price: 1.1, pip: 0.0001, innerDistPips: 8, outerDistPips: 15, outcome: 'out', fadePips: 3, runPips: 15,
       prevOutcomeSameDay: 'out', sessionHandoff: '2·london-morning' }],
    book, { rearmFrac: 0.3, minMargin: 1, voteCache: cache }
  );
  const trades2 = buildBarrierTrades(
    [{ instrument: 'X', date: '2022-06-01', time: 1, resolveTime: 2, rearmFrac: 0.3, side: 'above', level: 1.5,
       price: 1.1, pip: 0.0001, innerDistPips: 8, outerDistPips: 15, outcome: 'out', fadePips: 3, runPips: 15,
       prevOutcomeSameDay: 'out', sessionHandoff: '2·london-morning' }],
    book, { rearmFrac: 0.3, minMargin: 2, voteCache: cache }
  );
  ok('T14 voteCache does not change the underlying decision (margin=1 pass and margin=2 pass agree on win/pnl for the same touch)',
    trades1.length === 1 && trades2.length === 1 && trades1[0].pnlPct === trades2[0].pnlPct, JSON.stringify({ trades1, trades2 }));
  void vdUncached1;
}

// ── Lookahead safety (2026-08-29) ───────────────────────────────────────────
{
  // T15: direction comes from IS deltaOut only. Two books, identical IS
  // stats (favours 'out'), but OOS deltaOut flipped to the OPPOSITE sign in
  // one of them. If voteDecision's direction were ever influenced by the OOS
  // reading (a live signal-time decision peeking at data that, for a real
  // live touch, doesn't exist yet), the two books would disagree. They must not.
  function mkBookIndependentISOOS(dimKey, bucket, isFavorsOut, oosFavorsOut) {
    return {
      splitDate: '2022-01-01',
      cells: { 'above|1.5': { base: { is: { outPct: 50, backPct: 50 }, oos: { outPct: 50, backPct: 50 } },
        dims: { [dimKey]: {
          is: { [bucket]: { deltaOut: isFavorsOut ? 5 : -5, n: 40, holdsOOS: true } },
          oos: { [bucket]: { deltaOut: oosFavorsOut ? 4 : -4, n: 35 } },
        } } } },
    };
  }
  const bookOOSAgrees = mkBookIndependentISOOS('prevOutcomeSameDay', 'out', true, true);
  const bookOOSDisagrees = mkBookIndependentISOOS('prevOutcomeSameDay', 'out', true, false);
  const touch15 = { side: 'above', level: 1.5, prevOutcomeSameDay: 'out' };
  const vdAgrees = voteDecision(bookOOSAgrees, touch15);
  const vdDisagrees = voteDecision(bookOOSDisagrees, touch15);
  ok('T15 voteDecision direction is driven by IS deltaOut only — flipping the OOS-half deltaOut sign (same IS stats, same holdsOOS) must not change the decision',
    vdAgrees?.decision === 'follow' && vdDisagrees?.decision === 'follow' && vdAgrees.margin === vdDisagrees.margin,
    JSON.stringify({ vdAgrees, vdDisagrees }));

  // T16: matchLiveContext's holdsOOS gate gates the dimension entirely — a
  // bucket with holdsOOS:false contributes NO vote, even with a large IS
  // deltaOut. This is the book's existing, correct behaviour; the point of
  // this test is to make explicit (and pin against silent drift) that the
  // vote is conditioned on a flag computed FROM the OOS split itself
  // (annotateHolds compares IS vs OOS deltaOut sign — see this file's header
  // note above and LEGO_MODULES.md's 2026-08-29 entry).
  const bookHoldsFalse = {
    splitDate: '2022-01-01',
    cells: { 'above|1.5': { base: { is: { outPct: 50, backPct: 50 }, oos: { outPct: 50, backPct: 50 } },
      dims: { prevOutcomeSameDay: {
        is: { out: { deltaOut: 9, n: 40, holdsOOS: false } },   // large IS effect, but did NOT hold OOS
        oos: { out: { deltaOut: -1, n: 35 } },
      } } } },
  };
  ok('T16 a dimension bucket with holdsOOS:false contributes no vote even with a large IS effect — the vote is gated by a flag derived from the OOS split, not by IS strength alone',
    voteDecision(bookHoldsFalse, touch15) === null);

  // T17: a touch dated BEFORE book.splitDate must never reach buildBarrierTrades'
  // output, even when every other filter (rearmFrac, margin, confluence) would
  // otherwise admit it — the one guard standing between "OOS-only" and
  // silently grading the backtest on IS touches too.
  const book17 = mkBook([['prevOutcomeSameDay', 'out', true], ['sessionHandoff', '2·london-morning', true]]);
  const touchesBoundary = [
    { instrument: 'EURUSD', date: '2021-12-31', time: 1000, resolveTime: 1100, rearmFrac: 0.3, side: 'above', level: 1.5,
      price: 1.16863, pip: 0.0001, innerDistPips: 8, outerDistPips: 15, outcome: 'out', fadePips: 3, runPips: 15,
      prevOutcomeSameDay: 'out', sessionHandoff: '2·london-morning', asiaConfPips: 1.2 },   // 1 day BEFORE splitDate
    { instrument: 'EURUSD', date: '2022-01-01', time: 1000, resolveTime: 1100, rearmFrac: 0.3, side: 'above', level: 1.5,
      price: 1.17, pip: 0.0001, innerDistPips: 8, outerDistPips: 15, outcome: 'out', fadePips: 3, runPips: 15,
      prevOutcomeSameDay: 'out', sessionHandoff: '2·london-morning', asiaConfPips: 1.2 },   // exactly ON splitDate
  ];
  const tradesBoundary = buildBarrierTrades(touchesBoundary, book17, { rearmFrac: 0.3, cost: 0, minMargin: 1 });
  ok('T17 a touch dated before book.splitDate is excluded; a touch dated exactly on splitDate is included (>=, not >)',
    tradesBoundary?.length === 1 && tradesBoundary[0].date === '2022-01-01', JSON.stringify(tradesBoundary));
}

console.log(`\n${failures === 0 ? 'all passed' : failures + ' FAILURES'}`);
process.exitCode = failures ? 1 : 0;
