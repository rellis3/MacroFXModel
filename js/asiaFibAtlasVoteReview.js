/**
 * Asia Fib Atlas Vote Review — the trade-call backtest the owner asked for
 * (2026-08-27): "wait for asia to complete, pull the range lines like the
 * indicator, grab the line with confluence, when price hits trade what the
 * atlas says — is there a profitable trade?" Mirrors
 * `js/levelAtlasVoteReview.js`'s already-validated barrier-priced backtest
 * (real fixed target/stop from the touch's own rung distances, real M1-
 * derived outcome, true IS/OOS split, cost-stressed) rather than inventing a
 * new fill mechanism — that module's `reorientExcursion`/`applyConcurrencyCap`/
 * `buildPortfolioDailySeries`/`inverseVolWeights`/`riskAdjustTrades`/
 * `applyPortfolioHeatCap`/`applyDrawdownThrottle` are already engine-agnostic
 * (they operate on an already-built trade list's generic `{pnlPct, date,
 * time, resolveTime, entry, pip, stopPips, side, decision}` shape) and are
 * imported straight from there, not copied.
 *
 * What's genuinely different here, so NOT reused as-is:
 *   - Level Atlas's touch record uses `rung` (a label like 'p50') for the
 *     book-cell key and `level` for the raw touched PRICE. Asia Fib Atlas's
 *     touch record uses `level` for the fib MULTIPLIER (e.g. 1.5) and
 *     `price` for the raw touched price — the SAME field name means a
 *     DIFFERENT thing in each engine. Blindly reusing Level Atlas's
 *     `buildBarrierTrades` (which reads `entry: t.level`) against an Asia
 *     Fib Atlas touch would silently price every trade off the fib
 *     multiplier instead of the real price — this module reads `t.price`
 *     for entry and `t.level` only as the book-cell key, and re-outputs
 *     `entry`/`pip`/`stopPips`/etc. under Level Atlas's OWN field names so
 *     every downstream generic function still works unchanged.
 *   - The vote itself is DELIBERATELY restricted to the two dimensions the
 *     26-pair widen check (LEGO_MODULES.md §1aq) found generalize almost
 *     everywhere — `prevOutcomeSameDay` and `sessionHandoff` — not all ~30
 *     context dimensions like Level Atlas's own vote. Voting on every
 *     dimension here would be the "found a few winners among 70 slices"
 *     multiple-testing trap this project's own house rules warn against;
 *     Level Atlas's wider vote was itself only trusted after its OWN
 *     separate validation (see that module's header). A margin here can
 *     only ever be 0 (no decision / disagreement), 1 (one dimension voted),
 *     or 2 (both agree) — much coarser than Level Atlas's vote, by design.
 *   - An optional `confluenceOnly` gate (the owner's own framing — "grab the
 *     line with confluence") filters entries to touches where
 *     `asiaConfPips` (Asia vs previous-Asia, the core confluence track) was
 *     tight — default ≤2 pips, matching the owner's own "2 pip level"
 *     phrasing and `pipZoneBucket`'s own '≤2p' boundary (buckets 1-3).
 *
 * Pure: operates on already-built `asiaFibAtlasWalk` touches + a
 * `buildAsiaFibAtlasBook` book. No network, no M1 re-walk.
 */
import { matchLiveContext } from './levelAtlasReport.js';
import { DIMENSIONS } from './asiaFibAtlasReport.js';
import { reorientExcursion } from './levelAtlasVoteReview.js';
import { summarizeTrades } from './metricsCore.js';

const ASIA_DIM_LABEL = new Map(DIMENSIONS);

// The two dimensions the 26-pair widen check proved general (§1aq) — the
// ONLY dimensions this vote is allowed to use. Exported so a caller (or a
// test) can see exactly what the vote is restricted to, not a hidden magic set.
export const VOTE_DIMS = new Set(['prevOutcomeSameDay', 'sessionHandoff']);

/**
 * The vote-margin decision for one touch, restricted to VOTE_DIMS only (see
 * this module's header for why — NOT all held dimensions the way Level
 * Atlas's own vote uses). Returns null when neither dimension currently
 * holds for this touch, or they disagree (a tie carries no information).
 *
 *   voteDecision(book, touch) -> { decision:'fade'|'follow', margin, outVotes, backVotes } | null
 */
export function voteDecision(book, touch) {
  const m = matchLiveContext(book, touch, { keyField: 'level', dimLabels: ASIA_DIM_LABEL });
  if (!m) return null;
  const all = [...m.supports, ...m.challenges, ...m.context].filter(x => VOTE_DIMS.has(x.dimKey));
  const outVotes = all.filter(x => x.favors === 'out').length;
  const backVotes = all.filter(x => x.favors === 'back').length;
  if (outVotes === backVotes) return null;   // covers both "no vote" (0-0) and a genuine tie (1-1)
  return { decision: outVotes > backVotes ? 'follow' : 'fade', margin: Math.abs(outVotes - backVotes), outVotes, backVotes };
}

/**
 * Real bracket order, target/stop FIXED at the moment of touch
 * (`innerDistPips`/`outerDistPips`, already computed causally by
 * `asiaFibAtlasWalk` — same field names as Level Atlas, reused unchanged).
 * `denom` is `touch.price` (the real touched price) — NOT `touch.open`
 * (Level Atlas's own denominator field, which Asia Fib Atlas's touch record
 * doesn't carry) and NOT `touch.level` (the fib multiplier, would be wrong
 * by 1-2 orders of magnitude). A 'follow' bet at the ladder's outermost
 * rung (no further rung exists to measure `outerDistPips` from) returns
 * null here — same structural gap Level Atlas's own p90 has, handled the
 * same way: by the null check, not a hardcoded rung-name exclude list.
 *
 *   priceBarrierTrade(touch, decision, cost) -> { win, pnlPips, pnlPct, targetPips, stopPips } | null
 */
export function priceBarrierTrade(touch, decision, cost = 0) {
  const denom = touch.price > 0 ? touch.price : null;
  const targetPips = decision === 'fade' ? touch.innerDistPips : touch.outerDistPips;
  const stopPips = decision === 'fade' ? touch.outerDistPips : touch.innerDistPips;
  if (denom == null || targetPips == null || stopPips == null) return null;
  const win = (decision === 'fade' && touch.outcome === 'back') || (decision === 'follow' && touch.outcome === 'out');
  const pnlPips = win ? targetPips : -stopPips;
  const pnlPct = +((pnlPips * touch.pip / denom * 100) - cost).toFixed(4);
  return { win, pnlPips: +pnlPips.toFixed(1), pnlPct, targetPips, stopPips };
}

// `voteDecision` re-derives its match against the book from scratch every
// call (iterating every dimension on the cell) — cheap for one touch, but a
// caller sweeping several {minMargin, confluenceOnly} combinations over the
// SAME (book, touches) pair (e.g. a grid search) would otherwise pay that
// cost once PER GRID CELL for touches that appear in every cell. `voteCache`
// (an optional Map, shared across calls by the CALLER) memoizes by touch
// object identity — safe because `voteDecision(book, t)` is a pure function
// of exactly those two arguments, and a grid search always reuses the same
// `touches` array (same object references) and the same `book`.
function cachedVote(book, t, voteCache) {
  if (!voteCache) return voteDecision(book, t);
  if (!voteCache.has(t)) voteCache.set(t, voteDecision(book, t));
  return voteCache.get(t);
}

/**
 * Builds the real trade list a vote-margin (+ optional confluence) gate
 * would have taken — one row per OOS touch with a decision, priced via
 * `priceBarrierTrade`. Output fields deliberately match Level Atlas's OWN
 * trade-row shape (`entry`, `pip`, `stopPips`, `targetPips`, `pnlPct`,
 * `date`, `time`, `resolveTime`, `side`, `decision`, `margin`, `win`,
 * `mfePips`/`maePips`/`mfePct`/`maePct`) so `applyConcurrencyCap`,
 * `riskAdjustTrades`, `buildPortfolioDailySeries`, `inverseVolWeights`,
 * `applyPortfolioHeatCap` (all imported straight from `levelAtlasVoteReview.js`,
 * unchanged) work on this module's trades with zero adaptation — `rung`
 * carries this engine's own `level` (the fib multiplier) for readability in
 * a tearsheet, not used by any downstream generic function.
 *
 * `voteCache` (optional Map): pass the SAME Map across a grid search over
 * this (touches, book) pair to skip re-deriving each touch's vote per cell —
 * see `cachedVote` above.
 *
 *   buildBarrierTrades(touches, book, opts) -> [{ instrument, date, time, resolveTime,
 *     side, rung, entry, pip, decision, margin, targetPips, stopPips, win, pnlPct }]
 */
export function buildBarrierTrades(touches, book, { rearmFrac = 0.3, cost = 0, minMargin = 1, confluenceOnly = false, confluencePipMax = 2, voteCache = null } = {}) {
  if (!book) return null;
  let oos = touches.filter(t => t.rearmFrac === rearmFrac && t.date >= book.splitDate && t.outcome !== 'neither');
  if (confluenceOnly) oos = oos.filter(t => t.asiaConfPips != null && t.asiaConfPips <= confluencePipMax);

  const trades = [];
  for (const t of oos) {
    const vd = cachedVote(book, t, voteCache);
    if (!vd || vd.margin < minMargin) continue;
    const priced = priceBarrierTrade(t, vd.decision, cost);
    if (!priced) continue;
    const { mfePips, maePips } = reorientExcursion(t, vd.decision);
    const denom = t.price > 0 ? t.price : null;
    trades.push({
      instrument: t.instrument, date: t.date, time: t.time, resolveTime: t.resolveTime,
      side: t.side, rung: t.level, entry: t.price, pip: t.pip,
      decision: vd.decision, margin: vd.margin,
      targetPips: priced.targetPips, stopPips: priced.stopPips,
      mfePips: +mfePips.toFixed(1), maePips: +Math.abs(maePips).toFixed(1),
      mfePct: denom ? +(mfePips * t.pip / denom * 100).toFixed(4) : null,
      maePct: denom ? +(Math.abs(maePips) * t.pip / denom * 100).toFixed(4) : null,
      win: priced.win, pnlPct: priced.pnlPct,
      asiaConfPips: t.asiaConfPips ?? null,
    });
  }
  return trades;
}

/**
 * Walk-forward + cost-stress on the REAL barrier-priced trade list —
 * `summarizeTrades` (Sharpe + error bar, min track record, profit factor,
 * skew/kurtosis-adjusted, max DD) per calendar year and at 1x/2x/3x the
 * given cost, same discipline and same shared metric brick
 * `levelAtlasVoteReview.runBarrierWalkForward` already uses — no new
 * metrics invented.
 *
 *   runBarrierWalkForward(touches, book, opts) -> { overall, byYear, costStress, tradesUsed }
 */
export function runBarrierWalkForward(touches, book, opts = {}) {
  const trades = buildBarrierTrades(touches, book, opts);
  if (!trades) return null;
  const cost = opts.cost ?? 0;
  const pnls = trades.map(t => t.pnlPct), dates = trades.map(t => t.date);

  const byYear = {};
  for (const t of trades) (byYear[t.date.slice(0, 4)] ??= []).push(t);

  const costStress = {};
  for (const mult of [1, 2, 3]) {
    const stressedPnls = trades.map(t => +(t.pnlPct + cost - mult * cost).toFixed(4));
    costStress[`${mult}x`] = summarizeTrades(stressedPnls, dates);
  }

  return {
    overall: summarizeTrades(pnls, dates),
    byYear: Object.fromEntries(Object.entries(byYear).sort().map(([y, ts]) => [y, summarizeTrades(ts.map(t => t.pnlPct), ts.map(t => t.date))])),
    costStress,
    tradesUsed: trades.length,
    // The already-built trade list itself — a caller that also wants the raw
    // trades (a tearsheet, a cross-pair combine) can read it straight off
    // this result instead of paying for a second buildBarrierTrades pass
    // over the same touches (found the hard way: an earlier version of
    // scripts/run_asia_fib_atlas_vote_backtest.mjs called both, doubling the
    // per-grid-cell cost for no reason).
    trades,
  };
}
