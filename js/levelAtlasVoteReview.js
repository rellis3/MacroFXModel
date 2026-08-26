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
