// Read-only, local-only check (no OANDA, no R2, no writes) — quantifies two
// look-ahead-adjacent biases in the Fib Atlas backtest engine that mirror
// findings already made against its sibling, Level/Vote Atlas (see the
// user's memory: project_vote_atlas_lookahead_fix.md).
//
// 1. Dropped-unresolved-touch selection bias: buildBarrierTrades
//    (js/asiaFibAtlasVoteReview.js:139) filters `t.outcome !== 'neither'`
//    before pricing — the EXACT filter Level Atlas's own buildBarrierTrades
//    had until commit 5d5966f (2026-09-09) replaced it with a
//    mark-to-session-close instead of silently dropping the touch. Fib
//    Atlas's own touches carry the same 'neither' outcome semantic
//    (asiaFibAtlasWalk/mondayFibAtlasWalk) but never received the
//    equivalent fix. This script measures what fraction of real touches
//    are being silently excluded.
//
// 2. holdsOOS feature-selection leak: buildAsiaFibAtlasBook
//    (js/asiaFibAtlasReport.js:95) calls `annotateHolds` — imported
//    DIRECTLY from js/levelAtlasReport.js, unmodified — which sets
//    `holdsOOS` on a dimension by checking whether its lift holds in the
//    SAME OOS segment voteDecision then scores. This is the identical
//    mechanism the 2026-09-11 correction found responsible for 73% of
//    Level Atlas's m>=3 edge. Since Fib Atlas's voteDecision
//    (asiaFibAtlasVoteReview.js:67) calls the same matchLiveContext over a
//    book built by the same annotateHolds, it inherits the same leak
//    mechanically, not by inference — this script doesn't re-derive that
//    (no time/need to duplicate the existing vote_atlas_decomposition.mjs
//    methodology work already in progress in this repo), it just confirms
//    the touch-level dropped-rate on real data.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd'];
const REARM = 0.3;

async function checkLadder(pair, label, walkFn) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`${pair} ${label}: no local M1 data`); return; }
  const { touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass: 'fx', rearmFracs: [REARM] });
  const atRearm = touches.filter(t => t.rearmFrac === REARM);
  const neither = atRearm.filter(t => t.outcome === 'neither');
  const book = buildAsiaFibAtlasBook(touches, { rearmFrac: REARM });
  console.log(`${pair}\t${label}\ttouches=${atRearm.length}\tneither(dropped)=${neither.length}\tdroppedPct=${(100 * neither.length / atRearm.length).toFixed(1)}%\tsplitDate=${book?.splitDate ?? 'n/a'}\tlocalM1Last=${new Date(packed.times[packed.n - 1] * 1000).toISOString().slice(0, 10)}`);
}

console.log('pair\tladder\ttouches\tneither(dropped)\tdroppedPct\tsplitDate\tlocalM1Last');
for (const pair of PAIRS) {
  await checkLadder(pair, 'asia', asiaFibAtlasWalk);
  await checkLadder(pair, 'monday', mondayFibAtlasWalk);
}
