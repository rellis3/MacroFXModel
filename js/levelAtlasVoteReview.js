/**
 * Level Atlas Vote Review — MFE/MAE analysis of the dimension-vote decision
 * this session's own validation work surfaced (see LEGO_MODULES.md,
 * 2026-08-26): instead of Level Atlas's flat per-(side,rung) `lean` (shown to
 * carry almost no real information — it never varies within a rung), decide
 * fade/follow from how many of a touch's OWN held context dimensions
 * (session, churn, prevSessionVol, approach speed, candle rejection, etc —
 * `matchLiveContext`'s `supports`/`challenges`) agree, and how strongly.
 *
 * Win RATE alone can't say whether that's tradeable — a 57% win rate is
 * worthless if losses run twice the size of wins. This module measures the
 * REAL win/loss MAGNITUDE using the exact same re-labelling convention
 * `perLineStrategy.js` already established for its own touches (a FADE's
 * adverse excursion is CONTINUATION past the touch; a FOLLOW's adverse
 * excursion is REVERSION back toward the touch) — `fadePips`/`runPips` are
 * already computed causally, from the real M1 path, by `atlasWalk` itself
 * (see that module's own outcome-resolution loop); this is a re-labelling
 * of already-correct numbers, not a second simulation.
 *
 * Pure: operates on already-built `atlasWalk` touches + `buildAtlasBook`
 * book. No network, no M1 re-walk.
 */
import { matchLiveContext } from './levelAtlasReport.js';
import { summarizeTrades } from './metricsCore.js';
import { simulateExitVariants, bucketM1IntoSessions } from './forecastAnalyser.js';
import { portfolioStats } from './backtestStats.js';
import { bisect } from './barUtils.js';

/**
 * The vote-margin decision for one touch: how many of ITS OWN held
 * dimensions favour continuation ('out') vs reversal ('back'), and which
 * side wins. Returns null when there's no held context at all, or the vote
 * is exactly tied (no informative margin) — both cases mean "no decision",
 * not "fade" or "follow" by default.
 *
 *   voteDecision(book, touch) -> { decision:'fade'|'follow', margin, outVotes, backVotes } | null
 */
export function voteDecision(book, touch) {
  const m = matchLiveContext(book, touch);
  if (!m) return null;
  // ALL matched dimensions, not just supports+challenges: matchLiveContext
  // only splits a held dimension into supports/challenges when the CELL'S
  // OWN coarse (side,rung) lean isn't neutral — when it IS neutral, every
  // matched dimension lands in `context` instead (a real caught bug in an
  // earlier draft of this function: using supports+challenges alone silently
  // dropped every touch on a neutral-lean cell, even ones with genuinely
  // informative per-touch votes sitting in `context`).
  const all = [...m.supports, ...m.challenges, ...m.context];
  const outVotes = all.filter(x => x.favors === 'out').length;
  const backVotes = all.filter(x => x.favors === 'back').length;
  if (outVotes === backVotes) return null;
  return { decision: outVotes > backVotes ? 'follow' : 'fade', margin: Math.abs(outVotes - backVotes), outVotes, backVotes };
}

/**
 * Re-labels a touch's decision-agnostic excursion fields for the CHOSEN
 * decision. `fadePips`/`runPips` on every touch already measure, from the
 * real path: how far it retraced toward the touch (fadePips) and how far it
 * extended past it (runPips) — regardless of which way you'd have traded it.
 * A FADE bets on retracement, so that's its favourable (MFE) direction and
 * continuation is its adverse (MAE) one; a FOLLOW is the mirror image.
 *
 *   reorientExcursion(touch, decision) -> { mfePips, maePips }
 */
export function reorientExcursion(touch, decision) {
  return decision === 'fade'
    ? { mfePips: touch.fadePips, maePips: touch.runPips }
    : { mfePips: touch.runPips, maePips: touch.fadePips };
}

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Walks OOS touches (post `book.splitDate`, decided outcomes only, at the
 * book's own `rearmFrac`), applies `voteDecision`, and reports win rate +
 * MFE/MAE (in % of price, from the reoriented pip excursions) + E-ratio
 * (MFE÷MAE — same concept `rangeLineAnalyser.eRatioByCell` already uses:
 * E>1 means the winning side's favourable excursion structurally outruns
 * the losing side's adverse one, E<1 means the reverse) — broken out
 * overall, by rung, and by vote margin (the dose-response check).
 *
 * `excludeRungs` defaults to ['p90'] — the outermost rung has no further
 * rung to break through, so a FOLLOW decision there can never win (a
 * structural artifact of the ladder, not signal; see this module's own
 * validation notes in LEGO_MODULES.md).
 */
export function reviewVoteBacktest(touches, book, { excludeRungs = ['p90'], rearmFrac = 0.3 } = {}) {
  if (!book) return null;
  const oos = touches.filter(t => t.rearmFrac === rearmFrac && t.date >= book.splitDate
    && t.outcome !== 'neither' && !excludeRungs.includes(t.rung));

  const rows = [];
  let skippedNoVote = 0;
  for (const t of oos) {
    const vd = voteDecision(book, t);
    if (!vd) { skippedNoVote++; continue; }
    const { decision, margin } = vd;
    const win = (decision === 'fade' && t.outcome === 'back') || (decision === 'follow' && t.outcome === 'out');
    const { mfePips, maePips } = reorientExcursion(t, decision);
    const denom = t.open > 0 ? t.open : null;
    const mfePct = denom ? +(mfePips * t.pip / denom * 100).toFixed(4) : null;
    // maePips can be 0 on a clean win with zero adverse wiggle; keep as 0, not null.
    const maePct = denom ? +(Math.abs(maePips) * t.pip / denom * 100).toFixed(4) : null;
    rows.push({ rung: t.rung, side: t.side, decision, margin, win, mfePct, maePct });
  }

  const summarize = (rs) => {
    const n = rs.length;
    if (!n) return { n: 0, winRate: null, meanMfePct: null, meanMaePct: null, medianMfePct: null, medianMaePct: null, eRatio: null };
    const wins = rs.filter(r => r.win).length;
    const mfes = rs.map(r => r.mfePct).filter(x => x != null);
    const maes = rs.map(r => r.maePct).filter(x => x != null);
    const meanMfe = mean(mfes), meanMae = mean(maes);
    return {
      n, winRate: +(wins / n * 100).toFixed(1),
      meanMfePct: meanMfe != null ? +meanMfe.toFixed(4) : null,
      meanMaePct: meanMae != null ? +meanMae.toFixed(4) : null,
      medianMfePct: (() => { const v = median(mfes); return v != null ? +v.toFixed(4) : null; })(),
      medianMaePct: (() => { const v = median(maes); return v != null ? +v.toFixed(4) : null; })(),
      eRatio: (meanMfe != null && meanMae > 0) ? +(meanMfe / meanMae).toFixed(3) : null,
    };
  };

  const byRung = {};
  for (const r of rows) (byRung[r.rung] ??= []).push(r);
  const byMargin = {};
  for (const r of rows) (byMargin[r.margin] ??= []).push(r);
  // fade/follow decision mix: the ladder's outer barrier sits farther from a
  // touch than its inner one, so a 'follow' win structurally has to travel
  // farther than a 'fade' win — E-ratio can differ by DECISION TYPE for a
  // purely geometric reason having nothing to do with which votes are right.
  // Pooling both into one E-ratio (as the overall/byRung/byMargin summaries
  // do) can hide that a lopsided fade/follow MIX, not a weak signal, is what's
  // dragging the pooled number down — split out so that's checkable.
  const byDecision = {};
  for (const r of rows) (byDecision[r.decision] ??= []).push(r);
  const byMarginDecision = {};
  for (const r of rows) (byMarginDecision[`${r.margin}|${r.decision}`] ??= []).push(r);

  return {
    overall: summarize(rows),
    byRung: Object.fromEntries(Object.entries(byRung).map(([k, v]) => [k, summarize(v)])),
    byMargin: Object.fromEntries(Object.entries(byMargin).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => [k, summarize(v)])),
    byDecision: Object.fromEntries(Object.entries(byDecision).map(([k, v]) => [k, summarize(v)])),
    byMarginDecision: Object.fromEntries(
      Object.entries(byMarginDecision)
        .sort((a, b) => (+a[0].split('|')[0] - +b[0].split('|')[0]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => [k, summarize(v)])
    ),
    skippedNoVote, oosTotal: oos.length,
  };
}

/**
 * The HONEST version of a traded outcome: a real bracket order, target/stop
 * FIXED at the moment of touch (`innerDistPips`/`outerDistPips` — the actual
 * rung distances `atlasWalk` already computes, known before the outcome plays
 * out), not the best/worst point the path happened to reach. `fadePips`/
 * `runPips` (used by `reorientExcursion` above) answer "how favourable could
 * this have been" — this answers "what would a real order actually have
 * paid," which is the number that matters before anything gets called
 * tradeable. Reuses the touch's own already-computed `outcome` (which barrier
 * was hit first) rather than re-simulating the path a second way.
 *
 *   priceBarrierTrade(touch, decision, cost) -> { win, pnlPips, pnlPct, targetPips, stopPips } | null
 */
export function priceBarrierTrade(touch, decision, cost = 0) {
  const denom = touch.open > 0 ? touch.open : null;
  const targetPips = decision === 'fade' ? touch.innerDistPips : touch.outerDistPips;
  const stopPips = decision === 'fade' ? touch.outerDistPips : touch.innerDistPips;
  // A 'follow' bet at p90 (no outer rung exists) can't be priced with a real
  // target — same structural gap `reviewVoteBacktest`'s p90 exclusion exists
  // for, enforced here too so a caller can't accidentally price one anyway.
  if (denom == null || targetPips == null || stopPips == null) return null;
  const win = (decision === 'fade' && touch.outcome === 'back') || (decision === 'follow' && touch.outcome === 'out');
  const pnlPips = win ? targetPips : -stopPips;
  const pnlPct = +((pnlPips * touch.pip / denom * 100) - cost).toFixed(4);
  return { win, pnlPips: +pnlPips.toFixed(1), pnlPct, targetPips, stopPips };
}

/**
 * Builds the real trade list a vote-margin gate would have taken — one row
 * per OOS touch with a decision, priced via `priceBarrierTrade` (fixed
 * target/stop, not MFE/MAE) — the input `summarizeTrades`/a chart both need.
 * `minMargin` lets a caller test "would only taking margin>=N clear the bar"
 * without re-deriving the vote from scratch.
 *
 *   buildBarrierTrades(touches, book, opts) -> [{ instrument, date, time, resolveTime,
 *     side, rung, entry, pip, decision, margin, targetPips, stopPips, win, pnlPct }]
 */
export function buildBarrierTrades(touches, book, { excludeRungs = ['p90'], rearmFrac = 0.3, cost = 0, minMargin = 1 } = {}) {
  if (!book) return null;
  const oos = touches.filter(t => t.rearmFrac === rearmFrac && t.date >= book.splitDate
    && t.outcome !== 'neither' && !excludeRungs.includes(t.rung));
  const trades = [];
  for (const t of oos) {
    const vd = voteDecision(book, t);
    if (!vd || vd.margin < minMargin) continue;
    const priced = priceBarrierTrade(t, vd.decision, cost);
    if (!priced) continue;
    // Real intra-trade adverse/favourable excursion (from the actual M1 path,
    // via the SAME reorientExcursion already used for the MFE/MAE review
    // above) — riding along for a tearsheet's MAE column, which per this
    // project's own house rule (CLAUDE.md) must come from the real path, not
    // be approximated from the fixed stop distance.
    const { mfePips, maePips } = reorientExcursion(t, vd.decision);
    const denom = t.open > 0 ? t.open : null;
    trades.push({
      instrument: t.instrument, date: t.date, time: t.time, resolveTime: t.resolveTime,
      side: t.side, rung: t.rung, session: t.session, entry: t.level, pip: t.pip,
      decision: vd.decision, margin: vd.margin,
      targetPips: priced.targetPips, stopPips: priced.stopPips,
      // Raw pips ALONGSIDE the %-of-price versions below — the stop study
      // (runStopStudy) needs pips to compare directly against stopPips/
      // targetPips (both pips), and round-tripping through % would lose
      // precision for no reason since the pips are already in hand here.
      mfePips: +mfePips.toFixed(1), maePips: +Math.abs(maePips).toFixed(1),
      mfePct: denom ? +(mfePips * t.pip / denom * 100).toFixed(4) : null,
      maePct: denom ? +(Math.abs(maePips) * t.pip / denom * 100).toFixed(4) : null,
      win: priced.win, pnlPct: priced.pnlPct,
    });
  }
  return trades;
}

/**
 * Walk-forward + cost-stress on the REAL barrier-priced trade list —
 * `summarizeTrades` (already the project's one honest per-trade summary:
 * Sharpe + its own error bar, min track record, profit factor, skew/kurtosis-
 * adjusted, max DD — see `js/metricsCore.js`) run per calendar year and at
 * 1x/2x/3x the given cost, so a thin edge that only survives at the modelled
 * cost (and not 2x it) is visible rather than hidden behind one summary
 * number. Per Lego Principle 5 — no new metrics invented here.
 *
 *   runBarrierWalkForward(touches, book, opts) -> { overall, byYear, costStress, tradesUsed }
 */
export function runBarrierWalkForward(touches, book, { excludeRungs = ['p90'], rearmFrac = 0.3, cost = 0, minMargin = 1 } = {}) {
  const trades = buildBarrierTrades(touches, book, { excludeRungs, rearmFrac, cost, minMargin });
  if (!trades) return null;
  const pnls = trades.map(t => t.pnlPct), dates = trades.map(t => t.date);

  const byYear = {};
  for (const t of trades) (byYear[t.date.slice(0, 4)] ??= []).push(t);

  const costStress = {};
  for (const mult of [1, 2, 3]) {
    // Re-derive pnl at mult*cost from the STORED gross-minus-1x-cost pnl by
    // adding back the 1x cost once, then charging mult*cost, rather than
    // re-pricing every trade from scratch a second way.
    const stressedPnls = trades.map(t => +(t.pnlPct + cost - mult * cost).toFixed(4));
    costStress[`${mult}x`] = summarizeTrades(stressedPnls, dates);
  }

  return {
    overall: summarizeTrades(pnls, dates),
    byYear: Object.fromEntries(Object.entries(byYear).sort().map(([y, ts]) => [y, summarizeTrades(ts.map(t => t.pnlPct), ts.map(t => t.date))])),
    costStress,
    tradesUsed: trades.length,
  };
}

function pctile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length))];
}

/**
 * Re-prices ONE already-built trade under a TIGHTER candidate stop, using its
 * own real adverse excursion (`maePips`) — no M1 re-walk needed, same
 * discipline `perLineStrategy.js`'s own `pnlAtSL` already established for
 * exactly this reason: WIDENING a stop needs to know what price did AFTER
 * the original barrier was hit, which this decision-agnostic excursion data
 * cannot see (the touch's own resolution loop stops the instant a barrier is
 * hit) — so `candidateStopPips` is silently clamped to never exceed the
 * trade's own `stopPips`. A tighter stop can only ever convert a WIN into a
 * (smaller) loss, never the reverse, and an already-losing trade's loss only
 * ever shrinks — both directions are mechanically safe with existing data.
 *
 *   priceAtTighterStop(trade, candidateStopPips, cost) -> { win, pnlPct } | null
 */
export function priceAtTighterStop(trade, candidateStopPips, cost) {
  if (trade.maePips == null || !(trade.entry > 0)) return null;
  const s = Math.min(candidateStopPips, trade.stopPips);
  const sPct = s * trade.pip / trade.entry * 100;
  const maePct = trade.maePips * trade.pip / trade.entry * 100;
  if (maePct >= sPct) return { win: false, pnlPct: +(-sPct - cost).toFixed(4) };
  return { win: trade.win, pnlPct: trade.pnlPct };
}

/**
 * Apply a FIXED stop-tightening fraction to FADE trades only, leaving follow
 * trades untouched — the exact shape validated for the Fib Atlas engines
 * (analysis/fib_atlas_sl_tightening_backtest.mjs, 2026-08-29): fade's give-
 * back-predicts-loss signal is 30-100% stronger than follow's at every
 * checkpoint (analysis/fib_atlas_mae_timing_study.mjs), so tightening is
 * only applied where it was actually shown to help. `frac` is the fraction
 * of the trade's OWN stopPips to use as the new (tighter) stop, e.g. 0.9 —
 * `null`/`1` is a no-op passthrough. Engine-agnostic (reuses
 * `priceAtTighterStop` unchanged): works on Level Atlas's own trade shape or
 * Fib Atlas's, since `buildBarrierTrades` deliberately outputs the same
 * field names. `cost=0` by default because repricing an already-built trade
 * is the SAME trade exiting earlier, not a new one — the real cost is
 * already baked into its original `pnlPct` (see asiaFibAtlasRoutes.js's
 * `/run` build step), so re-applying cost here would double-charge it.
 *
 * `preserveSizing` (2026-08-30, default false — OPT-IN, zero behavior
 * change for every existing caller including the already-shipped live
 * toggle): when true, stamps `sizingStopPips` with the trade's ORIGINAL
 * (pre-tightening) stop distance before shrinking `stopPips` itself.
 * `riskAdjustTrades` prefers `sizingStopPips` when present — see that
 * function's own doc for why this exists: without it, a tighter stop
 * shrinks the risk-sizing denominator too, which fixed-fractional sizing
 * responds to by upsizing the position, inflating BOTH the win and the
 * loss legs (found 2026-08-30, see LEGO_MODULES.md's correction entry).
 * `preserveSizing:true` isolates "does the tighter exit itself help"
 * from "is this actually a bigger bet" by holding position size at what
 * the ORIGINAL, untightened stop would have sized — a win's payout comes
 * back byte-identical to baseline; only trades the tighter stop actually
 * catches change, and by less than the full risk unit (proportional to
 * how much tighter the stop is), not to exactly `-riskPct%` every time.
 *
 *   applyFadeStopFraction(trades, frac, cost=0, {preserveSizing=false}) -> trades (same shape, fade rows repriced)
 */
export function applyFadeStopFraction(trades, frac, cost = 0, { preserveSizing = false } = {}) {
  if (!trades?.length || frac == null || frac >= 1) return trades ?? [];
  return trades.map(t => {
    if (t.decision !== 'fade' || t.maePips == null) return t;
    const priced = priceAtTighterStop(t, t.stopPips * frac, cost);
    if (!priced) return t;
    const sizingStopPips = preserveSizing ? (t.sizingStopPips ?? t.stopPips) : null;
    return { ...t, ...priced, stopPips: Math.min(t.stopPips * frac, t.stopPips), ...(sizingStopPips != null ? { sizingStopPips } : {}) };
  });
}

/**
 * Cost-efficiency filter (2026-08-30) — OOS-validated on the Fib Atlas
 * engines (analysis/fib_atlas_cost_efficiency_filter.mjs; see
 * LEGO_MODULES.md) after the SAME `t.pnlPct`-includes-a-flat-`cost`
 * convention `priceBarrierTrade` uses turned out to be the actual driver
 * of a reported "avg win way smaller than avg loss" finding — gross
 * (pre-cost) wins and losses were symmetric (target:stop ~1:1 by design);
 * cost subtracted as a flat amount off every trade regardless of outcome
 * mechanically shrinks small-target-distance winners far more than it
 * deepens losses in relative terms. This filter just stops TAKING the
 * trades where that effect dominates — a pure selection gate (fewer
 * trades, none resized), so unlike a stop-repricing lever there's no
 * leverage-in-disguise question to check: position sizing is untouched.
 *
 * `minCostRatio` is how many multiples of the trade's OWN gross target
 * move must clear its pair's round-trip `cost` to be kept, e.g. 3 means
 * "only take trades whose target is worth >= 3x what the round trip
 * costs". `cost` here is the SAME per-pair constant `priceBarrierTrade`
 * already subtracts (`stored.cost` from the R2 blob) — NOT re-fetched or
 * re-derived, just reused as the ratio's denominator. `null`/`<= 1` is a
 * no-op passthrough (a ratio of 1 already describes today's status quo:
 * any trade with a nominally-positive gross target is taken).
 *
 *   applyCostEfficiencyFilter(trades, cost, minCostRatio) -> trades (subset, unchanged shape)
 */
export function applyCostEfficiencyFilter(trades, cost, minCostRatio) {
  if (!trades?.length || minCostRatio == null || minCostRatio <= 1 || !(cost > 0)) return trades ?? [];
  return trades.filter(t => {
    const targetPnlPct = t.targetPips * t.pip / t.entry * 100;
    return targetPnlPct / cost >= minCostRatio;
  });
}

/**
 * Trailing/continuation exit for WINNING rows — originally follow-only
 * (2026-08-30 — the owner's own suggestion: "if we are trading a level
 * which will continue the same direction we move to, sl etc and don't
 * close and open a trade?"), generalized the same day to fade wins too
 * (the owner's own follow-up: "why have we not tested both sides of the
 * line for the continuation or fade?" — a fair miss, fade had no reason
 * to be excluded from "let a winner keep running" once follow's own
 * version tested clean). OOS-validated on the Fib Atlas engines for
 * follow (analysis/fib_atlas_trailing_continuation_backtest.mjs; see
 * LEGO_MODULES.md): OOS Sharpe 16.15->16.73, avg win +12% relative, avg
 * loss and maxDD BYTE-IDENTICAL (no leverage-in-disguise — this lever
 * never touches `stopPips`, unlike the SL-tightening levers, so it
 * doesn't interact with `riskAdjustTrades`' per-trade sizing the way
 * those do). Fade side not yet separately validated — see the fade-decision
 * entry in LEGO_MODULES.md for whatever that run found.
 *
 * Unlike every other lever in this file, this one needs the real M1 path
 * PAST the trade's own resolution — the stored `mfePips`/`maePips` only
 * cover the excursion up through the first barrier hit. So this is a
 * GENERATION-TIME brick (called once, inside each engine's own `runOne`
 * where `packed` M1 bars are already loaded for the walk — no second M1
 * fetch), not a request-time one: it ADDS `trailedPnlPct`/`trailedPnlPips`/
 * `trailedResolveTime` fields to eligible rows (everything else passes
 * through unchanged) so the read-time routes can cheaply pick base vs.
 * trailed per request via a toggle, with zero M1 access at request time.
 *
 * From the trade's own `resolveTime` bar, walks `packed` forward tracking
 * a trailing stop that only ever ratchets in the FAVORABLE direction for
 * THIS trade's own decision — for a 'follow' win on `side==='above'`,
 * favorable is new highs (price keeps running away from the range); for a
 * 'fade' win on the SAME `side==='above'`, favorable is the OPPOSITE, new
 * lows (price keeps reverting back toward the range) — fade and follow on
 * the same side are mirror images, not the same direction, so the sign is
 * decision-dependent, not side-dependent alone (`awaySgn` = the natural
 * "away from range" direction from `side`; fade flips it, follow doesn't).
 * The trail is initialized AT the trade's own original fixed-target price
 * — so the worst case (an instant reversal) is IDENTICAL to the untrailed
 * exit, and `pnlPips` is explicitly floored at the original `targetPips`
 * as a second belt-and-braces guarantee. `givebackFrac` (validated at 0.02
 * for follow — see the analysis script's own header for why the grid was
 * extended before trusting this value, not just taking the first grid's
 * edge pick) is how much of the peak excursion beyond that original
 * target gets given back before the trail fires. Bounded to the trade's
 * own calendar `date` (forced mark-to-close at day-end if never stopped
 * out) — every trade stays same-day, matching `dailySeriesFor`'s
 * one-observation-per-day convention elsewhere in this file.
 *
 * A trade whose exact resolution bar can't be located in `packed` (stale/
 * gapped M1, or the trade predates this pair's stored M1 window) is left
 * with no trailed fields — a silent no-op for that ONE row at read time
 * (falls back to the base exit), not a thrown error for the whole batch.
 *
 * `cost` is the SAME flat per-pair round-trip cost `priceBarrierTrade`
 * already subtracts from every trade's base `pnlPct` — passed straight
 * through here (not re-derived from the base `pnlPct`) so the trailed
 * figure is charged cost exactly once, the same as the base figure.
 *
 *   applyTrailingContinuation(trades, packed, { givebackFrac, cost, decisions }) ->
 *     trades (same shape, eligible winning rows gain trailedPnlPct/trailedPnlPips/trailedResolveTime)
 */
export function applyTrailingContinuation(trades, packed, { givebackFrac = 0.02, cost = 0, decisions = ['follow'] } = {}) {
  if (!trades?.length || !packed?.times?.length) return trades ?? [];
  const { times, highs, lows, closes } = packed;
  return trades.map(t => {
    if (!decisions.includes(t.decision) || !t.win) return t;
    const awaySgn = t.side === 'above' ? 1 : -1; // "away from range" direction implied by which side the rung is on
    const sgn = t.decision === 'follow' ? awaySgn : -awaySgn; // fade's favorable direction mirrors follow's
    const outer = t.entry + sgn * t.targetPips * t.pip;
    const idx = bisect(times, t.resolveTime);
    if (idx >= times.length || times[idx] !== t.resolveTime) return t; // can't locate the exact bar -- leave untrailed
    const boundary = Date.parse(t.date + 'T00:00:00Z') / 1000 + 86400;
    let runExtreme = outer, exitTime = t.resolveTime, exitPrice = outer;
    for (let j = idx; j < times.length && times[j] < boundary; j++) {
      const fwd = sgn > 0 ? highs[j] : lows[j];
      const bwd = sgn > 0 ? lows[j] : highs[j];
      if (sgn > 0 ? fwd > runExtreme : fwd < runExtreme) runExtreme = fwd;
      const trailStop = runExtreme - sgn * givebackFrac * Math.abs(runExtreme - outer);
      if (sgn > 0 ? bwd <= trailStop : bwd >= trailStop) { exitTime = times[j]; exitPrice = trailStop; break; }
      exitTime = times[j]; exitPrice = closes[j]; // forced mark-to-close at day-end if never stopped out
    }
    const pnlPips = Math.max((exitPrice - t.entry) / t.pip * sgn, t.targetPips); // floor: never worse than the original fixed exit
    const trailedPnlPct = +(pnlPips * t.pip / t.entry * 100 - cost).toFixed(4);
    return { ...t, trailedPnlPips: +pnlPips.toFixed(1), trailedPnlPct, trailedResolveTime: exitTime };
  });
}

/**
 * READ-TIME counterpart to `applyTrailingContinuation` above — swaps the
 * pre-computed `trailedPnlPct`/`trailedPnlPips`/`trailedResolveTime`
 * fields (stored on the row by the generation-time brick) into the row's
 * live `pnlPct`/`pnlPips`/`resolveTime` when `on` is true. No M1 access,
 * no computation — just a field swap, cheap enough for a request-time
 * toggle. Call this BEFORE `applyConcurrencyCap`: that function reads
 * `resolveTime` to decide which trades survive the per-pair cap, and the
 * (possibly longer) trailed occupancy window must be in place before that
 * decision, not applied after — the same correctness point
 * `analysis/fib_atlas_trailing_continuation_backtest.mjs` documents. A row
 * with no trailed fields (couldn't be trailed at generation time) passes
 * through unchanged either way.
 *
 *   applyStoredContinuationExit(trades, on) -> trades (same shape)
 */
export function applyStoredContinuationExit(trades, on) {
  if (!trades?.length || !on) return trades ?? [];
  return trades.map(t => t.trailedPnlPct == null ? t
    : { ...t, pnlPct: t.trailedPnlPct, pnlPips: t.trailedPnlPips, resolveTime: t.trailedResolveTime });
}

/**
 * The stop/target study: does a TIGHTER stop, grounded in this trade list's
 * OWN real winners'-MAE percentiles (never invented — the exact grid-grounding
 * discipline `perLineStrategy.js`'s `runStopStudy` already uses), beat the
 * current fixed-rung stop? `sliceBy(trade) -> string|null` optionally splits
 * the grid per group (e.g. `t => t.session`) — a session/vol-regime-specific
 * stop is a genuinely different question from one global number, and this
 * lets a caller ask either. Each slice grids its OWN candidate stops from ITS
 * OWN winners (a session's typical adverse excursion isn't the same as
 * another's), summarized via `summarizeTrades` at n≥minN before a candidate
 * is trusted enough to compare.
 *
 *   runStopStudy(trades, { cost, sliceBy, minN, percentiles }) ->
 *     { [sliceKey]: { n, band: {...summarizeTrades}, candidates: [{p, stopPips, ...summarizeTrades}], best } }
 */
export function runStopStudy(trades, { cost = 0, sliceBy = null, minN = 30, percentiles = [50, 75, 90, 95] } = {}) {
  if (!trades?.length) return null;
  const groups = new Map();
  for (const t of trades) {
    const key = sliceBy ? (sliceBy(t) ?? '—') : 'overall';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const out = {};
  for (const [key, group] of groups) {
    const band = summarizeTrades(group.map(t => t.pnlPct), group.map(t => t.date));
    const winnerMae = group.filter(t => t.win && t.maePips != null).map(t => t.maePips).sort((a, b) => a - b);
    if (winnerMae.length < minN) { out[key] = { n: group.length, band, candidates: [], best: null, note: `fewer than ${minN} winners with real MAE — grid skipped` }; continue; }

    const seen = new Set();
    const candidates = [];
    for (const p of percentiles) {
      const stopPips = pctile(winnerMae, p);
      if (stopPips == null || seen.has(stopPips)) continue;
      seen.add(stopPips);
      // Keep pnl/date paired through the filter — a trade with no real MAE
      // (priceAtTighterStop returns null) must drop its date too, not just
      // its pnl, or the two arrays silently misalign.
      const priced = group.map(t => ({ p: priceAtTighterStop(t, stopPips, cost), date: t.date })).filter(x => x.p);
      if (!priced.length) continue;
      const summary = summarizeTrades(priced.map(x => x.p.pnlPct), priced.map(x => x.date));
      candidates.push({ p, stopPips, ...summary });
    }
    const eligible = candidates.filter(c => c.trades >= minN);
    const best = eligible.length ? eligible.reduce((a, b) => (b.sharpe > a.sharpe ? b : a)) : null;
    out[key] = { n: group.length, band, candidates, best };
  }
  return out;
}

/**
 * Applies a TIGHTER stop to FADE decisions only, grounded in THIS pair's own
 * fade-winners' real MAE (via `runStopStudy`) — built after a real,
 * OOS-validated finding (2026-08-27, `scripts/oos_validate_fade_stop.mjs`):
 * fade trades' current ladder-geometry stop runs oversized relative to what
 * winning fades actually need, so avg loss ends up bigger than avg win
 * despite a healthy win rate. Follow decisions are LEFT UNTOUCHED — the same
 * analysis found follow's current stop is already close to appropriate
 * (tightening it mostly hurts), consistent with the ladder's own geometry
 * (a follow's win structurally has to travel farther than a fade's).
 *
 * Deliberately scoped to ONE pair's own trades at a time — the candidate
 * grid is in raw PIPS, and pip size varies 100x+ across instruments
 * (EURUSD pip=0.0001 vs GOLD/index pip=1), so pooling trades from DIFFERENT
 * pairs before gridding would compare apples to oranges (a bug caught and
 * fixed before this function was written — see LEGO_MODULES.md). Never
 * WIDENS a stop (`priceAtTighterStop`'s own `Math.min` clamp) and returns
 * the ORIGINAL trades unchanged if there isn't enough fade-winner data to
 * trust a candidate (`runStopStudy`'s own `minN` gate) — a pair this can't
 * help is left exactly as it was, not degraded by a bad small-sample pick.
 *
 *   applyFadeStopTightening(trades, { cost, minN, percentiles }) ->
 *     { trades: [...], stopPips, percentile } | { trades, stopPips: null } (no change made)
 */
export function applyFadeStopTightening(trades, { cost = 0, minN = 30, percentiles = [50, 75, 90, 95] } = {}) {
  if (!trades?.length) return { trades: trades ?? [], stopPips: null, percentile: null };
  const study = runStopStudy(trades, { cost, sliceBy: t => (t.decision === 'fade' ? 'fade' : null), minN, percentiles });
  const best = study?.fade?.best;
  if (!best) return { trades, stopPips: null, percentile: null };
  const retuned = trades.map(t => {
    if (t.decision !== 'fade') return t;
    const priced = priceAtTighterStop(t, best.stopPips, cost);
    return priced ? { ...t, ...priced, stopPips: Math.min(best.stopPips, t.stopPips) } : t;
  });
  return { trades: retuned, stopPips: best.stopPips, percentile: best.p };
}

/**
 * A/B: the current fixed-rung target/stop vs a chandelier trail / no-cap
 * ride — reusing `forecastAnalyser.js`'s ALREADY-VALIDATED `simulateExitVariants`
 * (the exact exit walker `perLineStrategy.js`'s own exit study already trusts
 * for this), not a new simulation. The fixed-rung outcome ALREADY has a
 * correct, causal answer from `atlasWalk` itself — riding past it (chandelier
 * or an uncapped ride) means walking bars PAST that original resolution
 * point, which needs the real M1 path again — hence this function takes the
 * raw `packed` M1 data, unlike every other function in this module.
 *
 * `bucketM1IntoSessions(packed, 'Europe/London')` is the SAME call
 * `levelAtlasEngine.js`'s `atlasWalk` makes internally — reusing it (not a
 * second slicing) guarantees each trade's `date` lands in the identical
 * session bars atlasWalk itself walked, so `touchIdx` (found by matching
 * `bar.time === t.time`, exact — `t.time` was set FROM `bar.time` originally)
 * lines up on the correct bar.
 *
 * Self-check built in: `crossCheck` reprices the SAME fixed-rung outcome via
 * `simulateExitVariants`'s own 'fixed' rule and compares it to the trade's
 * already-validated `pnlPct` (gross, since simulateExitVariants has no cost
 * model). Checked on real EURUSD (2026-08-27): 8 of 1189 trades (0.7%)
 * disagree, ALL because the touch resolved on the SAME bar it entered on (a
 * single M1 bar wide enough to span both target AND stop — a real ~70-pip
 * news-spike bar in one case) — `atlasWalk`'s own resolution loop checks the
 * OUTER/continuation barrier first regardless of decision, while
 * `simulateExitVariants` always checks the STOP first regardless of side.
 * Neither convention is wrong — an OHLC bar can't say which threshold was
 * actually touched first intrabar — but the two ALREADY-EXISTING, both
 * independently-used engines made opposite tie-break assumptions, and this
 * function inherits atlasWalk's original resolution as the trusted one (it's
 * what's already shipped) while flagging the disagreement rather than hiding
 * it. A nonzero `crossCheck.maxAbsDiffPct` around this magnitude on a big
 * enough sample is this known, explained, rare edge case — NOT evidence of a
 * reconstruction bug — but investigate again if it ever comes back large
 * relative to n, or before trusting a small sample. If this ever drifts for
 * a DIFFERENT reason, the inner/outer/touchIdx reconstruction below has a
 * real bug and the chand/ride numbers should not be trusted until it's
 * fixed — that's the whole reason this check exists, not a formality.
 *
 * `trailFrac` default (0.5, `simulateExitVariants`'s own default) is TOO
 * TIGHT for this ladder's rung distances — checked on real EURUSD margin≥3
 * (2026-08-27): at 0.5, the trail activates from bar ZERO (ratchets on every
 * bar including the entry bar, not after some minimum favourable move), so
 * 98.3% of trades exit via 'trail' almost immediately and total P&L
 * collapses to ~25% vs the fixed rule's ~73%. At 1.5-2.0 the ride's total
 * P&L recovers to roughly TIE the fixed rule (~70-73%) — still not a proven
 * improvement, but no longer an artifact of an overly tight default. Pass
 * `trailFrac` explicitly; do not trust this function's own default for
 * anything beyond a smoke test.
 *
 *   runExitVariantStudy(trades, packed, { trailFrac, beTrigger, cost }) ->
 *     { n, unmatched, crossCheck: {maxAbsDiffPct}, fixed, chand, ride: {...summarizeTrades} }
 */
export function runExitVariantStudy(trades, packed, { trailFrac = 0.5, beTrigger = 0.5, cost = 0 } = {}) {
  if (!trades?.length || !packed?.n) return null;
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const rows = [];
  let unmatched = 0, maxAbsDiffPct = 0;
  for (const t of trades) {
    const bars = sessions.get(t.date);
    if (!bars?.length) { unmatched++; continue; }
    const touchIdx = bars.findIndex(b => b.time === t.time);
    if (touchIdx < 0) { unmatched++; continue; }
    const isUp = t.side === 'up';
    const innerDistPips = t.decision === 'fade' ? t.targetPips : t.stopPips;
    const outerDistPips = t.decision === 'fade' ? t.stopPips : t.targetPips;
    const sgn = isUp ? 1 : -1;
    const inner = t.entry - sgn * innerDistPips * t.pip;
    const outer = t.entry + sgn * outerDistPips * t.pip;
    const ex = simulateExitVariants(bars, touchIdx, { touchLvl: t.entry, inner, outer, isUp, open: bars[0].open, trailFrac, beTrigger });
    const pick = (fadeKey, followKey) => t.decision === 'fade' ? ex[fadeKey] : ex[followKey];

    const fixedReplay = +(pick('exFadeFixed', 'exFollowFixed') - cost).toFixed(4);
    maxAbsDiffPct = Math.max(maxAbsDiffPct, Math.abs(fixedReplay - t.pnlPct));

    rows.push({
      date: t.date, fixedPnl: t.pnlPct,   // the already-validated atlasWalk result — kept, not replaced
      chandPnl: +(pick('exFadeChand', 'exFollowChand') - cost).toFixed(4),
      ridePnl: +(pick('exFadeRide', 'exFollowRide') - cost).toFixed(4),
    });
  }
  const dates = rows.map(r => r.date);
  return {
    n: rows.length, unmatched,
    crossCheck: { maxAbsDiffPct: +maxAbsDiffPct.toFixed(4) },
    fixed: summarizeTrades(rows.map(r => r.fixedPnl), dates),
    chand: summarizeTrades(rows.map(r => r.chandPnl), dates),
    ride: summarizeTrades(rows.map(r => r.ridePnl), dates),
  };
}

/**
 * Which way a decided touch is actually BETTING, in market terms — needed
 * because 'fade'/'follow' alone don't say: a fade on an up-touch bets DOWN,
 * a follow on an up-touch bets UP, and the two other combinations mirror
 * that. `applyConcurrencyCap`'s `perDirection` mode groups by this, not by
 * raw side/decision, so a long and a short opened at the same moment are
 * correctly treated as occupying SEPARATE risk budgets. Exported (2026-08-28)
 * for `tradeFactors`/`applyExposureCap` below — a second consumer that needs
 * the SAME sign convention (a wrong direction here silently inverts which
 * trades a factor cap thinks are stacking vs offsetting).
 *
 * `isUp` recognizes BOTH engines' own `side` vocabulary (2026-08-31, found
 * while testing `applyExposureCap` on Fib Atlas trades for the first time):
 * Level Atlas's touches use `side: 'up'|'down'`; Fib Atlas's use
 * `side: 'above'|'below'` (the touched rung sits above/below the day's
 * range) — structurally the SAME "which way is outward" concept, just a
 * different word. Before this fix, `t.side === 'up'` was always false for
 * EVERY Fib Atlas trade (it never carries the literal string 'up'), so
 * `betDirection` silently returned a direction that depended ONLY on
 * `decision` (fade always 'long', follow always 'short'), ignoring `side`
 * completely — every Fib Atlas trade's real long/short direction was wrong
 * for both `perDirection` concurrency budgets and `tradeFactors`' currency
 * sign, an existing correctness bug this exposure-cap test caught before
 * trusting any result built on it, not after. Caught by reading the
 * function against real trade data rather than assuming it was already
 * engine-agnostic just because it accepted a generic `{decision, side}`
 * shape. Level Atlas's own 'up'/'down' behavior is completely unchanged
 * (it never sends 'above'/'below', so the added check is a no-op for it).
 */
export function betDirection(t) {
  const withSide = t.decision === 'follow';
  const isUp = t.side === 'up' || t.side === 'above';
  return (withSide === isUp) ? 'long' : 'short';
}

/**
 * Filters an already-built trade list (from `buildBarrierTrades`) down to
 * what a REAL, capital-limited account could actually have taken — the
 * concurrency finding this exists to answer: 346 of 622 EURUSD trading days
 * (margin≥3) have 2+ trades, and 279 of those genuinely overlap in TIME (a
 * second trade opens before the first resolves), which every Sharpe number
 * reported so far silently assumes could run at full size simultaneously.
 *
 * At most `maxConcurrent` positions may be open at once; a later-arriving
 * signal that would exceed the cap is SKIPPED, not merged or extended —
 * merging into an already-open position (the "same-direction extend" idea)
 * is a genuinely different, not-yet-built mechanism (it needs a re-walk past
 * the original resolution point, the same kind of machinery
 * `runExitVariantStudy` uses, and depends on a properly-tuned trail rule
 * that study just showed isn't settled yet). This is deliberately the
 * SIMPLER, more conservative answer first: how much of the reported edge
 * survives if you just refuse the trades you couldn't actually have
 * afforded, rather than assuming you can extend your way out of the
 * conflict. `perDirection:true` tracks long and short exposure on SEPARATE
 * budgets (a simultaneous long+short isn't the same capital conflict as two
 * same-direction trades stacking); `perDirection:false` (default) caps
 * TOTAL concurrent exposure regardless of direction — the more conservative
 * of the two, appropriate as the default for a single account.
 *
 * Pure — does not touch `buildBarrierTrades`'s own output or re-derive
 * anything from touches/M1; operates only on the trade list already built.
 *
 * `heatOf(trade)` (2026-08-27) generalizes the budget from a plain POSITION
 * COUNT to a summed HEAT — default `() => 1` makes `maxConcurrent` mean
 * exactly what it always meant (an integer position count), unchanged for
 * every existing caller. Passing a real per-trade risk fraction (e.g.
 * `t.riskPctUsed` from `riskAdjustTrades`) turns this into a PORTFOLIO HEAT
 * CAP — `maxConcurrent` then means "max % of account at risk at once" and
 * a new trade is skipped if adding its own risk would exceed that budget,
 * even if the position COUNT is small (one fat trade can use up the same
 * budget as several thin ones). `applyPortfolioHeatCap` below is the
 * intended entry point for that use — this function itself doesn't care
 * whether "heat" means one thing or another, it just sums whatever
 * `heatOf` returns.
 *
 * `priorityOf` (2026-08-30, optional — see LEGO_MODULES.md's Fib Atlas
 * entry-priority-ordering entry): a `trade -> number` scorer used ONLY to
 * break ties among trades sharing the EXACT SAME entry `time` (higher
 * score wins the earlier admission slot); `undefined`/omitted keeps the
 * original array order for those ties (backward-compatible, zero behavior
 * change for every existing caller). Deliberately NEVER reorders trades at
 * DIFFERENT times — that would mean deferring an earlier trade's admission
 * decision on the hope a better one shows up later, which a live system
 * can't do (look-ahead). Same-timestamp ties are the one case where
 * reordering is causally free: every trade in that batch is already known
 * at that instant, so choosing among them isn't using future information.
 *
 *   applyConcurrencyCap(trades, { maxConcurrent, perDirection, heatOf, priorityOf }) ->
 *     { kept, skipped, skippedCount, totalCount, keptSummary: {...summarizeTrades} }
 */
export function applyConcurrencyCap(trades, { maxConcurrent = 1, perDirection = false, heatOf = () => 1, priorityOf = null } = {}) {
  if (!trades?.length) return null;
  const sorted = [...trades].sort((a, b) => a.time - b.time || (priorityOf ? priorityOf(b) - priorityOf(a) : 0));
  const open = perDirection ? { long: [], short: [] } : { all: [] };
  const kept = [], skipped = [];
  for (const t of sorted) {
    const key = perDirection ? betDirection(t) : 'all';
    // Drop any tracked positions that have already resolved strictly before
    // this trade's own entry time — they're no longer occupying the budget.
    open[key] = open[key].filter(p => p.resolveTime > t.time);
    const openHeat = open[key].reduce((a, p) => a + p.heat, 0);
    const thisHeat = heatOf(t);
    if (openHeat + thisHeat <= maxConcurrent + 1e-9) {
      open[key].push({ resolveTime: t.resolveTime, heat: thisHeat });
      kept.push(t);
    } else {
      skipped.push(t);
    }
  }
  return {
    kept, skipped, skippedCount: skipped.length, totalCount: trades.length,
    keptSummary: summarizeTrades(kept.map(t => t.pnlPct), kept.map(t => t.date)),
  };
}

// One pair's own daily-summed return series — the SAME convention
// perLineStrategy.js's own (module-local, unexported) dailySeries already
// uses: sum a day's trades' pnlPct into ONE observation, so a day with
// multiple resolving trades isn't double-counted as multiple independent
// periods (the exact reasoning runBarrierWalkForward's daily Sharpe already
// applies to one pair — this is the same idea one level up, across pairs).
function dailySeriesFor(trades) {
  const m = new Map();
  for (const t of trades ?? []) m.set(t.date, (m.get(t.date) ?? 0) + t.pnlPct);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/**
 * Combines MULTIPLE pairs' own (already-selected — e.g. minMargin +
 * `applyConcurrencyCap`) trade lists into ONE portfolio daily return series.
 * Does NOT decide the weighting policy itself — `weights` (a plain
 * {pair: fraction} map) is the caller's call; omit it for the simplest,
 * most transparent "split capital evenly across pairs" model (1/n each), or
 * pass `inverseVolWeights`' output for a risk-parity blend (this project's
 * own Multi-Factor Book/Position Sizer already size by vol for exactly this
 * reason — "same $ risk regardless of the pair's own volatility", not
 * invented here). A pair missing from `weights` defaults to 0 (excluded,
 * not an error) so a caller can pass a superset of trade lists and select
 * which ones count via `weights` without re-filtering the input.
 *
 * Feed the result into `js/backtestStats.js`'s `portfolioStats` for the
 * honest daily-aggregated Sharpe/CAGR/maxDD — same brick every other daily
 * series in this module already uses, not a new metric.
 *
 *   buildPortfolioDailySeries({ EURUSD: trades, GOLD: trades, ... }, { weights }) ->
 *     { dailyReturns, dates, byPair: {[pair]: {trades, weight}} }
 */
export function buildPortfolioDailySeries(perPairTrades, { weights = null } = {}) {
  const pairs = Object.keys(perPairTrades ?? {});
  if (!pairs.length) return null;
  const w = weights ?? Object.fromEntries(pairs.map(p => [p, 1 / pairs.length]));

  const byDate = new Map();
  const byPair = {};
  for (const pair of pairs) {
    const trades = perPairTrades[pair] ?? [];
    const weight = w[pair] ?? 0;
    byPair[pair] = { trades: trades.length, weight };
    for (const [date, pnl] of dailySeriesFor(trades)) {
      byDate.set(date, (byDate.get(date) ?? 0) + pnl * weight);
    }
  }
  const dates = [...byDate.keys()].sort();
  return { dailyReturns: dates.map(d => +byDate.get(d).toFixed(4)), dates, byPair };
}

/**
 * Inverse-realized-vol weights across pairs — same $ risk regardless of a
 * pair's own volatility, the SAME sizing convention this project's
 * Multi-Factor Book/Position Sizer already use, not a new model. Uses each
 * pair's OWN daily-summed return series' stdev as the vol proxy — the SAME
 * series `buildPortfolioDailySeries` will combine, so weights and the
 * series they're applied to are always measuring the same thing. A pair
 * with ~zero variance (a degenerate/near-empty trade list) gets weight 0
 * rather than an infinite inverse — excluded, not a divide-by-zero.
 *
 *   inverseVolWeights({ EURUSD: trades, ... }) -> { EURUSD: fraction, ... } (sums to 1) | null
 */
export function inverseVolWeights(perPairTrades) {
  const pairs = Object.keys(perPairTrades ?? {});
  if (!pairs.length) return null;
  const vols = {};
  for (const pair of pairs) {
    const series = dailySeriesFor(perPairTrades[pair]).map(([, pnl]) => pnl);
    const m = series.length ? series.reduce((a, b) => a + b, 0) / series.length : 0;
    const variance = series.length ? series.reduce((a, b) => a + (b - m) ** 2, 0) / series.length : 0;
    vols[pair] = Math.sqrt(variance);
  }
  const invVols = Object.fromEntries(pairs.map(p => [p, vols[p] > 1e-9 ? 1 / vols[p] : 0]));
  const total = Object.values(invVols).reduce((a, b) => a + b, 0);
  return total > 0 ? Object.fromEntries(pairs.map(p => [p, +(invVols[p] / total).toFixed(4)])) : null;
}

/**
 * Re-expresses each trade's `pnlPct` as a FIXED FRACTION-OF-ACCOUNT risk
 * outcome instead of a raw price-move %, using the SAME R-multiple formula
 * this project already uses in both tearsheets' Currency P&L CSV export
 * (`stopPips * pip / entry * 100` as the per-trade risk unit — a genuinely
 * per-trade-varying denominator, not a fixed % of price). `riskPct` is the
 * % of account risked on EVERY trade regardless of pair or stop distance —
 * this is what makes cross-pair combination forward-implementable without
 * needing to know trade count/frequency in advance (see LEGO_MODULES.md):
 * you don't pre-compute a NAV split, you just risk the same % every trade
 * and let realized portfolio volatility be whatever it turns out to be.
 *
 * Pure re-labelling — does not change win/loss, only the % magnitude. A
 * trade with zero stop distance (shouldn't occur, but keeps this safe) is
 * left with pnlPct 0 and rMultiple 0 rather than dividing by zero.
 *
 * Prefers `t.sizingStopPips` over `t.stopPips` when present (2026-08-30) —
 * a stop-tightening lever that reprices `stopPips` to a NEW, smaller value
 * (`applyFadeStopFraction`'s `preserveSizing:true` mode) can stamp
 * `sizingStopPips` with the trade's ORIGINAL distance so this function
 * keeps sizing the position off the pre-tightening risk unit instead of
 * silently upsizing it — see that function's own doc for why this
 * matters (found 2026-08-30: fixed-fractional sizing off a just-tightened
 * stop inflates the win leg too, not just shrinking the loss leg).
 * Falls back to `t.stopPips` when `sizingStopPips` is absent, so every
 * existing caller (nothing sets that field by default) is byte-identical.
 *
 *   riskAdjustTrades(trades, 1) -> same trades, pnlPct replaced by R × 1%, rMultiple added
 */
export function riskAdjustTrades(trades, riskPct = 1) {
  return (trades ?? []).map(t => {
    const sizingPips = t.sizingStopPips ?? t.stopPips;
    const stopRiskPct = sizingPips * t.pip / t.entry * 100;
    const r = stopRiskPct > 1e-9 ? t.pnlPct / stopRiskPct : 0;
    return { ...t, pnlPct: +(r * riskPct).toFixed(4), rMultiple: +r.toFixed(3), riskPctUsed: riskPct };
  });
}

/**
 * Portfolio-level "heat" cap (Van Tharp's term) — the cross-PAIR sibling of
 * `applyConcurrencyCap`'s per-pair cap. Each pair's own trades are ALREADY
 * capped independently (one budget per instrument); this catches the gap
 * that leaves open even after that: nothing stops 5 different pairs each
 * having a live position at once, each independently risking its own
 * `riskPctUsed` (from `riskAdjustTrades`), silently stacking to several
 * times any single trade's risk. Merges every pair's trades into ONE
 * chronological list and re-applies `applyConcurrencyCap` with `heatOf`
 * summing REAL risk instead of counting positions — `maxHeatPct` directly
 * means "never risk more than X% of account across every open position at
 * once, regardless of which pairs they're on".
 *
 * A trade missing `riskPctUsed` (i.e. not run through `riskAdjustTrades` —
 * NAV-split mode) falls back to heat 1 per trade, which only makes sense
 * paired with a `maxHeatPct` expressed as a position count in that case;
 * this function is really intended for fixed-risk-sized trades.
 *
 * `priorityOf` (2026-08-30, optional): passed straight through to
 * `applyConcurrencyCap` — see that function's own doc. This is the level
 * where entry-priority ordering actually matters for this engine: real
 * contention is cross-pair (many Fib Atlas lines evaluate at the same
 * session-open timestamp), not within one pair's own trade list.
 *
 *   applyPortfolioHeatCap({ EURUSD: trades, GOLD: trades, ... }, { maxHeatPct, priorityOf }) ->
 *     { kept, skipped, skippedCount, totalCount, keptSummary } | null
 */
export function applyPortfolioHeatCap(perPairTrades, { maxHeatPct = 3, priorityOf = null } = {}) {
  const merged = Object.values(perPairTrades ?? {}).flat();
  if (!merged.length) return null;
  return applyConcurrencyCap(merged, { maxConcurrent: maxHeatPct, heatOf: t => t.riskPctUsed ?? 1, priorityOf });
}

/**
 * Drawdown throttle — reduces risk after the STRATEGY'S OWN realized equity
 * curve breaches a drawdown threshold, restores it once equity recovers.
 * Built specifically because `applyPortfolioHeatCap` (a cap on SIMULTANEOUS
 * exposure) was shown, on real data, to barely dent the portfolio's actual
 * worst drawdown — that drawdown turned out to be a 19-day, correlated
 * losing STRETCH across pairs (win rate 45.5% vs 58.9% overall), not a
 * pile-up of concurrent positions at one moment (see LEGO_MODULES.md). A
 * cap on concurrency can't fix a sequential-losses problem; this responds
 * to the pain directly, the way a real trader (or CTA risk desk) would.
 *
 * Strictly causal: the multiplier applied to day `i`'s return is decided
 * from the equity/peak built from days `0..i-1` ONLY (using the ALREADY-
 * THROTTLED path, since that's the equity a real account would actually
 * have) — day i's own return can never influence its own sizing. Operates
 * on the ALREADY-COMBINED portfolio daily series (not individual trades):
 * since every trade's pnlPct already scales linearly with its own risk% via
 * `riskAdjustTrades`, scaling a day's SUMMED return by a scalar is
 * mathematically identical to having risk-adjusted every trade that day
 * with `riskPct × multiplier` in the first place — no need to re-touch
 * individual trades.
 *
 * `restoreDD` (default 0 — a literal new equity high) is deliberately a
 * LESS-negative threshold than `triggerDD` (hysteresis) — restoring at the
 * same level the trigger fired would flip-flop the multiplier on ordinary
 * day-to-day noise near the boundary.
 *
 *   applyDrawdownThrottle(dailyReturns, dates, { triggerDD, restoreDD, throttleMult }) ->
 *     { dailyReturns, dates, state: [{date, throttled, mult, ddAtDecision}] } | null
 */
export function applyDrawdownThrottle(dailyReturns, dates, { triggerDD = -5, restoreDD = 0, throttleMult = 0.5 } = {}) {
  if (!dailyReturns?.length) return null;
  let equity = 1, peak = 1, throttled = false;
  const scaled = [], state = [];
  for (let i = 0; i < dailyReturns.length; i++) {
    const ddNow = (equity - peak) / peak * 100;
    if (!throttled && ddNow <= triggerDD) throttled = true;
    else if (throttled && ddNow >= restoreDD) throttled = false;
    const mult = throttled ? throttleMult : 1;
    const r = dailyReturns[i] * mult;
    scaled.push(+r.toFixed(4));
    equity *= (1 + r / 100);
    if (equity > peak) peak = equity;
    state.push({ date: dates[i], throttled, mult, ddAtDecision: +ddNow.toFixed(2) });
  }
  return { dailyReturns: scaled, dates, state };
}

/**
 * FX pair -> [base, quote] 3-letter currency legs. Non-FX instruments map to
 * a single synthetic "currency" (their own symbol) so the gate below can
 * treat them uniformly without pretending they share USD/EUR/etc exposure
 * with an actual currency pair.
 */
const CCY_LEGS = {
  EURUSD: ['EUR', 'USD'], GBPUSD: ['GBP', 'USD'], USDJPY: ['USD', 'JPY'], AUDUSD: ['AUD', 'USD'],
  NZDUSD: ['NZD', 'USD'], USDCAD: ['USD', 'CAD'], USDCHF: ['USD', 'CHF'],
  EURJPY: ['EUR', 'JPY'], EURGBP: ['EUR', 'GBP'], EURAUD: ['EUR', 'AUD'], EURCAD: ['EUR', 'CAD'], EURCHF: ['EUR', 'CHF'],
  GBPJPY: ['GBP', 'JPY'], GBPAUD: ['GBP', 'AUD'], GBPCHF: ['GBP', 'CHF'],
  AUDJPY: ['AUD', 'JPY'], AUDCAD: ['AUD', 'CAD'], CADJPY: ['CAD', 'JPY'], CHFJPY: ['CHF', 'JPY'], NZDJPY: ['NZD', 'JPY'],
};
export function currencyLegs(pair) {
  return CCY_LEGS[pair] ?? [pair];
}

/**
 * Daily per-currency loss circuit breaker — a DIFFERENT cut than
 * `applyPortfolioHeatCap` (caps simultaneous exposure regardless of
 * instrument) or `applyDrawdownThrottle` (reacts to the strategy's OWN
 * multi-day equity curve). This reacts to same-day REALIZED losses
 * concentrated in one currency, e.g. "if today's realized JPY-linked loss
 * already exceeds 3%, stop opening new JPY-linked trades for the rest of
 * the day" — built because inspecting the worst portfolio days directly
 * (2026-08-28) showed no single PAIR ever drives more than ~30% of a bad
 * day's loss, but a single CURRENCY (usually JPY or USD — the two most
 * heavily-referenced legs in the traded pair set) often drives 40-80% of it,
 * spread across several pairs sharing that leg (a classic risk-off JPY
 * unwind or broad USD move hitting every pair that touches it at once).
 *
 * Strictly causal per trade: a candidate trade at time `t.time` is blocked
 * if any of ITS OWN currency legs already has realized (CLOSED, i.e.
 * `resolveTime <= t.time`) cumulative loss beyond `-maxDailyLossPct` for
 * that calendar date — trades still OPEN (not yet resolved) never count
 * toward the tally, exactly like a real trader can only react to a position
 * once it's actually closed, not to one still running. Legs are tallied
 * from KEPT trades only (a blocked trade contributes nothing, having never
 * been opened). Tallies reset at each new `date`.
 *
 * Known, deliberate limitation (see LEGO_MODULES.md): on days where many
 * pairs enter within the same few minutes (a scheduled macro release, e.g.
 * the 12:30 UTC cluster on 2024-09-06 / 2023-10-06), this gate can't help —
 * every trade in the burst is already open, and therefore already exposed,
 * before any of them resolves and updates a currency's tally. It only
 * protects against the SLOWER, trickle-across-sessions pattern, which is
 * the more common of the two shapes among the worst days.
 *
 *   applyCurrencyLossGate(trades, { maxDailyLossPct }) ->
 *     { kept, skipped, skippedCount, totalCount, keptSummary }
 */
export function applyCurrencyLossGate(trades, { maxDailyLossPct = 3 } = {}) {
  if (!trades?.length) return { kept: [], skipped: [], skippedCount: 0, totalCount: 0, keptSummary: null };
  const byDate = new Map();
  for (const t of trades) {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date).push(t);
  }
  const kept = [], skipped = [];
  for (const dayTrades of byDate.values()) {
    const sorted = [...dayTrades].sort((a, b) => a.time - b.time);
    const tally = {}; // currency -> cumulative REALIZED pnlPct so far today
    // Event queue: opens (decision points) and closes (tally updates) of
    // trades already accepted, merged and replayed in time order so a close
    // that lands before a later open updates the tally in time to gate it.
    const pending = []; // {resolveTime, legs, pnlPct} for kept, not-yet-resolved trades
    for (const t of sorted) {
      // Apply any closes that have happened by this trade's open time.
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].resolveTime <= t.time) {
          const p = pending.splice(i, 1)[0];
          for (const c of p.legs) tally[c] = (tally[c] ?? 0) + p.pnlPct;
        }
      }
      const legs = currencyLegs(t.pair ?? t.instrument);
      const blocked = legs.some(c => (tally[c] ?? 0) <= -maxDailyLossPct);
      if (blocked) { skipped.push(t); continue; }
      kept.push(t);
      pending.push({ resolveTime: t.resolveTime, legs, pnlPct: t.pnlPct });
    }
  }
  return {
    kept, skipped, skippedCount: skipped.length, totalCount: trades.length,
    keptSummary: summarizeTrades(kept.map(t => t.pnlPct), kept.map(t => t.date)),
  };
}

/**
 * Merges raw event epochs (seconds, e.g. `calendarLoader.majorEventEpochs()`
 * mapped to `.epoch`) into sorted, NON-overlapping `[start,end]` windows
 * (seconds, same units as a trade's `time`/`resolveTime`) — a scheduled news
 * print routinely produces several simultaneous rows at the identical epoch
 * (NFP alone tags 2+ "Major" sub-releases at 12:30 UTC), which would
 * otherwise leave duplicate/overlapping windows for every consumer to
 * re-handle. Deliberately CURRENCY-BLIND (unlike `eventGateCore.js`'s
 * per-currency `buildEventWindows`) — built after checking real trade data
 * (2026-08-28) showed a currency-scoped gate misses a third of THIS
 * portfolio outright (`pairCcys` returns `[]` for gold and every index) and
 * still misses FX crosses without a literal USD leg that visibly move on a
 * USD print anyway (broad risk-sentiment contagion, not FX-pair mechanics).
 *
 *   mergeMajorEventWindows(epochs, { preMin, postMin }) -> [{start, end}]
 */
export function mergeMajorEventWindows(epochs, { preMin = 30, postMin = 15 } = {}) {
  if (!epochs?.length) return [];
  const raw = [...epochs].sort((a, b) => a - b).map(e => ({ start: e - preMin * 60, end: e + postMin * 60 }));
  const merged = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const last = merged[merged.length - 1];
    if (raw[i].start <= last.end) last.end = Math.max(last.end, raw[i].end);
    else merged.push(raw[i]);
  }
  return merged;
}

/**
 * Scheduled, CURRENCY-BLIND news-proximity risk throttle — a DIFFERENT
 * mechanism from `applyCurrencyLossGate` above (which reacts to REALIZED
 * losses, per currency, after they happen). This instead pre-emptively
 * shrinks risk on EVERY pair (gold/indices included — see
 * `mergeMajorEventWindows`'s doc for why currency-scoped coverage isn't
 * enough here) around a small, KNOWN set of scheduled Major-impact windows —
 * the schedule itself is public information well in advance, so acting on it
 * ahead of time is not lookahead (same reasoning `calendarLoader.js`'s own
 * header gives). Built after checking that trades opened near a Major event
 * do NOT lose more on average (a clean null on the direct EV hypothesis —
 * see LEGO_MODULES.md) — the real risk is a rare day where a print moves
 * many correlated positions the same losing direction AT ONCE, a
 * variance/tail story a per-trade EV filter can't see but a scheduled
 * exposure cut can.
 *
 * `mult=0` degenerates to a full block (zeroes the trade's contribution) —
 * a KNOWN approximation, not a true block: it doesn't free the concurrency/
 * heat budget slot the trade would otherwise have occupied for a different
 * trade to take. Close enough given every pair here is already capped to 1
 * concurrent position by `applyConcurrencyCap` upstream, but stated
 * plainly rather than silently assumed.
 *
 * Scales `pnlPct` AND `riskPctUsed` together (not just pnlPct) so a
 * DOWNSTREAM heat cap — which sums `riskPctUsed` as its budget — correctly
 * sees the REDUCED risk a throttled trade actually took, not its pre-
 * throttle size. Windows are PRE-MERGED (`mergeMajorEventWindows`) and
 * sorted, so membership is a single bisect per trade, not a per-window scan.
 *
 *   applyNewsProximityThrottle(trades, { windows, mult }) -> trades (same length, some scaled)
 */
export function applyNewsProximityThrottle(trades, { windows = [], mult = 0.3 } = {}) {
  if (!trades?.length || !windows.length) return trades ?? [];
  const starts = windows.map(w => w.start);
  const inWindow = t => {
    let i = bisectLeft(starts, t);
    if (i > 0 && t <= windows[i - 1].end) return true;
    if (i < windows.length && t >= windows[i].start && t <= windows[i].end) return true;
    return false;
  };
  return trades.map(t => {
    if (!inWindow(t.time)) return t;
    return { ...t, pnlPct: +(t.pnlPct * mult).toFixed(4), riskPctUsed: +((t.riskPctUsed ?? 1) * mult).toFixed(4), newsThrottled: true };
  });
}

function bisectLeft(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

// Equity indices behave as ONE correlated "risk-on/risk-off" cluster
// regardless of currency denomination (documented on the portfolio page's
// own correlated-risk card) — deliberately its OWN factor, separate from
// gold: gold's historical beta to a risk-off shock is often the OPPOSITE
// sign to equities (flight-to-safety), not the same one, so lumping them
// together would silently treat a genuine hedge as a stack.
const EQUITY_RISK_SET = new Set(['NQ', 'SPX', 'DOW', 'US2000', 'DE30', 'UK100']);

/**
 * Decomposes ONE trade into its signed risk-FACTOR exposure — the piece
 * `applyPortfolioHeatCap` (gross % regardless of sign or instrument) and
 * `applyCurrencyLossGate` (reactive to REALIZED loss, not exposure) both
 * lack: a PRE-TRADE read on which underlying currencies/clusters are
 * ALREADY stacked, so two trades that HEDGE each other (long EURUSD + long
 * USDCHF: +EUR-USD and +USD-CHF net to ~0 USD exposure) aren't budgeted the
 * same as two that STACK (long USDJPY + long USDCHF: +USD twice, real
 * doubled exposure). FX pairs split into base(+)/quote(-) via
 * `currencyLegs`, signed by `betDirection`; gold gets its own 'XAU' factor;
 * the 6 indices share one 'EQUITY_RISK' factor (see above). Each entry's
 * weight is the trade's OWN `riskPctUsed` (defaults to 1) — a bigger trade
 * contributes proportionally more exposure, not a flat ±1.
 *
 *   tradeFactors(trade) -> [{ factor, weight }]   (weight already signed)
 */
export function tradeFactors(t) {
  const pair = String(t.pair ?? t.instrument ?? '').toUpperCase();
  const dir = betDirection(t) === 'long' ? 1 : -1;
  const risk = t.riskPctUsed ?? 1;
  if (EQUITY_RISK_SET.has(pair)) return [{ factor: 'EQUITY_RISK', weight: dir * risk }];
  if (pair === 'GOLD') return [{ factor: 'XAU', weight: dir * risk }];
  const legs = currencyLegs(pair);
  if (legs.length === 2) return [{ factor: legs[0], weight: dir * risk }, { factor: legs[1], weight: -dir * risk }];
  return legs.map(f => ({ factor: f, weight: dir * risk }));
}

/**
 * Pre-trade NET signed exposure cap — the piece missing from the risk stack
 * built so far. `applyPortfolioHeatCap` sums gross risk (a long and a short
 * cost the same budget even though they partly cancel); `applyCurrencyLossGate`
 * only reacts AFTER a currency has already realized a loss that day. This
 * instead tracks, continuously and causally, the RUNNING net exposure per
 * risk factor (`tradeFactors`) across currently-OPEN positions, and blocks a
 * candidate trade only if accepting it would push ONE OF ITS OWN factors'
 * net exposure beyond `maxNetExposurePct` — an offsetting trade (opposite
 * sign on that factor) is free to add EVEN WHEN the account is already
 * heavily exposed elsewhere; a same-sign stack is the thing this actually
 * targets.
 *
 * Strictly causal, GLOBAL time order (not per-date like the currency loss
 * gate — exposure is a running position, not a daily-reset tally): a trade
 * releases its factor contribution only once its OWN `resolveTime` has
 * passed relative to the candidate being evaluated, exactly like
 * `applyCurrencyLossGate`'s pending-trade queue.
 *
 *   applyExposureCap(trades, { maxNetExposurePct, factorsOf }) ->
 *     { kept, skipped, skippedCount, totalCount, keptSummary }
 */
export function applyExposureCap(trades, { maxNetExposurePct = 3, factorsOf = tradeFactors } = {}) {
  if (!trades?.length) return { kept: [], skipped: [], skippedCount: 0, totalCount: 0, keptSummary: null };
  const sorted = [...trades].sort((a, b) => a.time - b.time);
  const net = {};       // factor -> current net signed exposure from OPEN trades
  const pending = [];   // {resolveTime, factors} for kept, not-yet-resolved trades
  const kept = [], skipped = [];
  for (const t of sorted) {
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].resolveTime <= t.time) {
        const p = pending.splice(i, 1)[0];
        for (const f of p.factors) net[f.factor] = (net[f.factor] ?? 0) - f.weight;
      }
    }
    const factors = factorsOf(t);
    const wouldBreach = factors.some(f => Math.abs((net[f.factor] ?? 0) + f.weight) > maxNetExposurePct);
    if (wouldBreach) { skipped.push(t); continue; }
    kept.push(t);
    for (const f of factors) net[f.factor] = (net[f.factor] ?? 0) + f.weight;
    pending.push({ resolveTime: t.resolveTime, factors });
  }
  return {
    kept, skipped, skippedCount: skipped.length, totalCount: trades.length,
    keptSummary: summarizeTrades(kept.map(t => t.pnlPct), kept.map(t => t.date)),
  };
}
