// Fib Atlas holdsOOS decomposition (2026-09-11) — Fib Atlas's own version of
// the check that found Vote Atlas's edge was 73% look-ahead
// (project_vote_atlas_lookahead_fix.md's 2026-09-11 correction).
//
// STRICTLY READ-ONLY / ADDITIVE: this is a brand-new, standalone script. It
// does not edit, and does not call `putJSON`/write to, ANY existing file —
// not js/levelAtlasReport.js, not js/asiaFibAtlasReport.js, not any Vote
// Atlas or Fib Atlas route. It only IMPORTS the real, unmodified production
// functions and runs them purely in memory on locally-cached M1 parquet
// (VolRangeForecaster/data/m1, capped ~2026-08-20 — fine here since this
// question is about book-construction bias, not data freshness).
//
// Mechanism under test (js/asiaFibAtlasReport.js:95, js/levelAtlasReport.js's
// `annotateHolds`, both imported unmodified below): `buildAsiaFibAtlasBook`
// splits a pool of touches into IS/OOS, then sets each dimension's
// `holdsOOS` flag by checking whether its IS-measured lift ALSO holds in
// that SAME OOS segment. `voteDecision` (asiaFibAtlasVoteReview.js, also
// imported unmodified) only counts a dimension if holdsOOS is true. Fed the
// real OOS touches, that's selecting features because they worked on the
// test set, then scoring them on it.
//
// Method (identical in spirit to the already-existing
// analysis/vote_atlas_decomposition.mjs, independently re-derived here for
// Fib Atlas's own touch shape/vote/cost path — not a copy, since Fib Atlas's
// voteDecision/DIMENSIONS/pricing all differ from Level Atlas's):
//   1. Walk once, split ONCE into (is, oos) via the SAME splitAt Level/Fib
//      Atlas both already use — this defines the real test set, fixed for
//      both books below.
//   2. LEAKY book = buildAsiaFibAtlasBook(ALL touches) — exactly what
//      runOne ships today. Its holdsOOS is checked against the real oos.
//   3. HONEST book = buildAsiaFibAtlasBook(IS-ONLY touches) — same function,
//      unmodified, just handed a smaller pool. It performs its own internal
//      IS'/OOS' split of the training data only, so its holdsOOS is a
//      genuine train-time check that never looks at the real oos.
//   4. Score the SAME real `oos` touches under each book via the real
//      voteDecision + priceBarrierTrade (both imported, unmodified) — only
//      the book differs, so any gap is attributable to the leak alone.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { voteDecision, priceBarrierTrade } from '../js/asiaFibAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];   // full default 16-pair set
const REARM = 0.3;

function meanStdT(xs) {
  const n = xs.length;
  if (!n) return { n, mean: null, t: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const se = Math.sqrt(variance / n);
  return { n, mean, t: se > 0 ? mean / se : null };
}

function scoreUnderBook(realOOS, book, cost, minMargin) {
  const pnls = [];
  for (const t of realOOS) {
    const vd = voteDecision(book, t);
    if (!vd || vd.margin < minMargin) continue;
    const priced = priceBarrierTrade(t, vd.decision, cost);
    if (!priced) continue;
    pnls.push(priced.pnlPct);
  }
  return meanStdT(pnls);
}

async function decomposeLadder(pair, label, walkFn) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`${pair} ${label}: no local M1`); return; }
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM] });
  const pool = touches.filter(t => t.rearmFrac === REARM);
  const { split, is, oos } = splitAt(pool);
  const realOOS = oos.filter(t => t.outcome !== 'neither');   // same population buildBarrierTrades scores

  const leakyBook = buildAsiaFibAtlasBook(touches, { rearmFrac: REARM });
  const honestBook = buildAsiaFibAtlasBook(is, { rearmFrac: REARM });   // fed IS-only — never sees the real oos

  console.log(`\n=== ${pair} ${label} (split ${split}, is=${is.length}, oos=${oos.length}, realOOS=${realOOS.length}, cost=${cost}) ===`);
  console.log('minMargin\tLEAKY n\tLEAKY mean%\tLEAKY t\tHONEST n\tHONEST mean%\tHONEST t');
  for (const minMargin of [1, 2]) {
    const leaky = scoreUnderBook(realOOS, leakyBook, cost, minMargin);
    const honest = scoreUnderBook(realOOS, honestBook, cost, minMargin);
    console.log(`m>=${minMargin}\t${leaky.n}\t${leaky.mean?.toFixed(4) ?? '—'}\t${leaky.t?.toFixed(2) ?? '—'}\t${honest.n}\t${honest.mean?.toFixed(4) ?? '—'}\t${honest.t?.toFixed(2) ?? '—'}`);
  }
}

for (const pair of PAIRS) {
  for (const [label, walkFn] of [['asia', asiaFibAtlasWalk], ['monday', mondayFibAtlasWalk]]) {
    try { await decomposeLadder(pair, label, walkFn); }
    catch (e) { console.log(`${pair} ${label}: FAILED (${e.message}) — skipping, continuing with the rest`); }
  }
}
