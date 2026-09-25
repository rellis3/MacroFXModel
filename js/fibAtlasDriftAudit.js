/**
 * Fib Atlas drift audit — the js/voteAtlasDriftAudit.js pattern, ported for
 * Fib Atlas's own engine shape (2026-09-25, REWRITTEN 2026-09-25).
 *
 * REWRITE, same day, same reason as js/voteAtlasDriftAudit.js's own rewrite:
 * re-deriving everything from raw M1 via asiaFibAtlasWalk/mondayFibAtlasWalk
 * on every call was both the cause of a real production outage (CPU-bound
 * parquet decode blocking the server's one event loop) and — separately —
 * wrong, since it never applied the SAME portfolio-level filters (margin,
 * per-pair concurrency cap, cost-efficiency, gap filter) the live bot's own
 * config actually uses. The source of truth is the SAME precomputed,
 * nightly-refreshed `{ladder}-fib-atlas/{pair}-votetrades.json` files
 * /api/asia-fib-atlas/vote-portfolio and /api/monday-fib-atlas/vote-portfolio
 * already read — small R2 JSON fetches, not M1 decodes, already carrying
 * decision/margin/win/pnlPct/gapMin/etc precomputed.
 *
 * Structural differences from Vote Atlas, confirmed by direct investigation:
 *  - Two ladders, two separate R2 prefixes ('asia-fib-atlas',
 *    'monday-fib-atlas'), but the SAME buildBarrierTrades schema (Level
 *    Atlas's shared code) — confirmed directly against a real stored trade:
 *    the fib extension multiplier (e.g. -0.25) lives on the STORED trade's
 *    `rung` field, not `level` (level/entry is the raw price, same generic
 *    naming Level Atlas's own touches use). `side` is 'above'/'below', not
 *    'up'/'down'.
 *  - The comment tag (`FA[a_a1.25]` v1, `FA2[m_b-2.5]` v2) carries the ladder
 *    (a=asia, m=monday) and side+level, but — unlike Vote Atlas's own
 *    "downp50_1" — NO trailing instance-ordinal. Re-touches of the same rung
 *    reuse the identical tag; the live bot disambiguates via its own
 *    in-memory RearmTracker state, which isn't recoverable from a closed
 *    trade record after the fact. So a real trade is matched to the NEAREST
 *    same-day/side/rung stored trade by time_open, not an ordinal lookup.
 *  - Live default params (read directly off the frozen constants the live
 *    zone pricers actually use — js/asiaFibAtlasZonePricer.js,
 *    js/mondayFibAtlasZonePricer.js — not guessed): minMargin=2 (both),
 *    maxGapMin=30 (asia) / 180 (monday) when gap_filter is on for that
 *    ladder, minCostRatio=3 (asia) / 4 (monday). No currency-loss-gate
 *    equivalent exists for Fib Atlas.
 */
import { applyConcurrencyCap, applyCostEfficiencyFilter, applyGapFilter } from './levelAtlasVoteReview.js';
import { getJSON } from './r2Store.js';
import { resolveKey } from './instrumentRegistry.js';

const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };

const _SYMBOL_OVERRIDE = { DE40: 'de30', US2000: 'us2000', US30: 'dow', US500: 'spx', US100: 'nq', UK100: 'uk100' };

// Same continuation/reversal sign logic Vote Atlas's own betDirection uses,
// re-derived rather than reused because betDirection's `side==='up'` check
// would silently mis-map on Fib Atlas's 'above'/'below' vocabulary — better
// to be explicit here than risk one wrong branch on a mismatched string.
function fibBetDirection(decision, side) {
  const contSign = side === 'above' ? 1 : -1;
  const dirSign = decision === 'fade' ? -contSign : contSign;
  return dirSign > 0 ? 'long' : 'short';
}

// Adapts GET /api/trade-history's raw MT5 records for Fib Atlas's own tag
// shape: "FA[a_a1.25]" (v1) / "FA2[m_b-2.5]" (v2) -> {pair, ladder, side,
// level, date, direction, profit, time_open}. `commentPrefix` is 'FA' or
// 'FA2' — must match exactly, not as a substring ("FA[" would also match
// inside "FA2[...").
export function normalizeTradeHistoryForFibAtlasAudit(rawTrades, commentPrefix) {
  const re = new RegExp(`^${commentPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(a|m)_([ab])(-?\\d+(?:\\.\\d+)?)\\]$`);
  const out = [];
  for (const t of rawTrades || []) {
    const m = re.exec(t.comment || '');
    if (!m) continue;
    const [, ladderCode, sideCode, levelStr] = m;
    const sym = String(t.symbol || '').toUpperCase();
    let pair = _SYMBOL_OVERRIDE[sym];
    if (!pair) { try { pair = resolveKey(sym)?.toLowerCase(); } catch { /* fall through */ } }
    if (!pair) pair = sym.toLowerCase();
    // MT5 stamps time_open on the BROKER's clock (commonly +2/+3h, see
    // pylego/broker/clock.py's own convention and project_broker_clock_
    // offset.md) -- the stored trades' own `.time` is true UTC. Fib Atlas's
    // tag carries no ordinal (this file's own header doc), so matching falls
    // back to "nearest stored trade by time_open" -- un-corrected, that's
    // nearest by a clock running ~3h ahead, which reliably picks the WRONG
    // trade outright on any day with more than one real touch a few hours
    // apart (confirmed live 2026-09-25).
    out.push({
      pair, ladder: ladderCode === 'a' ? 'asia' : 'monday',
      side: sideCode === 'a' ? 'above' : 'below',
      level: parseFloat(levelStr),
      date: t.date, direction: t.direction, profit: t.profit,
      time_open: (t.time_open || 0) - (t.tz_offset_sec || 0),
    });
  }
  return out;
}

async function loadStoredFibTrades(pair, ladder) {
  const stored = await getJSON(`${LADDER_PREFIX[ladder]}/${pair}-votetrades.json`);
  if (!stored?.trades) return { trades: null, cost: null, reason: 'no vote-backtest data for this pair/ladder' };
  return { trades: stored.trades, cost: stored.cost, reason: null };
}

export async function auditFibAtlasDrift(tradeEntries, { minMargin = 2 } = {}) {
  const byKey = {};
  for (const t of tradeEntries) (byKey[`${t.pair}|${t.ladder}`] ??= []).push(t);

  const results = [];
  for (const [key, trades] of Object.entries(byKey)) {
    const [pair, ladder] = key.split('|');
    const { trades: stored, reason } = await loadStoredFibTrades(pair, ladder);
    if (!stored) { for (const trade of trades) results.push({ ...trade, note: reason }); continue; }

    for (const trade of trades) {
      const sameDaySideRung = stored.filter(t => t.date === trade.date && t.side === trade.side && t.rung === trade.level);
      if (!sameDaySideRung.length) { results.push({ ...trade, note: 'no matching stored trade found' }); continue; }
      let matched = sameDaySideRung[0], bestDt = Math.abs((matched.time || 0) - (trade.time_open || 0));
      for (const t of sameDaySideRung) {
        const dt = Math.abs((t.time || 0) - (trade.time_open || 0));
        if (dt < bestDt) { matched = t; bestDt = dt; }
      }

      if (matched.margin < minMargin) {
        results.push({ ...trade, note: `margin ${matched.margin} < ${minMargin}, should not have traded`, myDecision: matched.decision, myMargin: matched.margin });
        continue;
      }
      const myDir = fibBetDirection(matched.decision, trade.side);
      const actualDir = trade.direction === 'BUY' ? 'long' : 'short';

      const realProfit = typeof trade.profit === 'number' ? trade.profit : null;
      const winLossMatch = realProfit != null ? (realProfit > 0) === matched.win : undefined;

      results.push({
        ...trade, myDecision: matched.decision, myMargin: matched.margin, myDir, actualDir, dirMatch: myDir === actualDir,
        timedOut: matched.timedOut, myWinLoss: matched.win ? 'WIN' : 'LOSS', winLossMatch, expectedPnlPct: matched.pnlPct ?? null,
      });
    }
  }

  const withVote = results.filter(r => r.dirMatch !== undefined);
  const mismatches = withVote.filter(r => !r.dirMatch);
  const noVoteOrThin = results.filter(r => r.dirMatch === undefined);
  const winLossChecked = results.filter(r => r.winLossMatch !== undefined);
  const winLossMismatches = winLossChecked.filter(r => !r.winLossMatch);
  const unresolved = results.filter(r => r.timedOut);
  const expectedPnlPctSum = results.reduce((s, r) => s + (r.expectedPnlPct ?? 0), 0);
  return {
    generatedAt: new Date().toISOString(),
    totalTrades: tradeEntries.length,
    checkedWithVote: withVote.length,
    directionMatches: withVote.length - mismatches.length,
    directionMismatches: mismatches.length,
    matchRate: withVote.length ? +((withVote.length - mismatches.length) / withVote.length * 100).toFixed(1) : null,
    thinMarginOrNoVote: noVoteOrThin.length,
    mismatchDetail: mismatches,
    winLossChecked: winLossChecked.length,
    winLossMatches: winLossChecked.length - winLossMismatches.length,
    winLossMismatches: winLossMismatches.length,
    winLossMatchRate: winLossChecked.length ? +((winLossChecked.length - winLossMismatches.length) / winLossChecked.length * 100).toFixed(1) : null,
    unresolvedInBacktest: unresolved.length,
    expectedPnlPctTotal: +expectedPnlPctSum.toFixed(3),
    results,
  };
}

// Population, not just output — same reasoning as Vote Atlas's own
// countVoteAtlasCandidates. Applies the SAME portfolio-level filters the
// live bot's own config uses (margin, gap filter, cost-efficiency filter,
// per-pair concurrency cap) — a raw margin>=minMargin count is NOT what
// the live bot would actually take, which is exactly what produced Vote
// Atlas's original 45-vs-17 mismatch.
export async function countFibAtlasCandidates(pairs, date, {
  ladders = ['asia', 'monday'], maxConcurrent = 1, perDirection = false,
  minMargin = { asia: 2, monday: 2 },
  maxGapMin = { asia: 30, monday: 180 },
  minCostRatio = { asia: 3, monday: 4 },
  gapFilterOn = { asia: true, monday: true },
} = {}) {
  let total = 0;
  const byPair = {};
  for (const pair of pairs) {
    let n = 0;
    const notes = [];
    for (const ladder of ladders) {
      const { trades: stored, cost, reason } = await loadStoredFibTrades(pair, ladder);
      if (!stored) { notes.push(`${ladder}: ${reason}`); continue; }
      const marginFiltered = stored.filter(t => t.margin >= (minMargin[ladder] ?? 2));
      const costFiltered = applyCostEfficiencyFilter(marginFiltered, cost, minCostRatio[ladder] ?? null);
      const gapFiltered = applyGapFilter(costFiltered, gapFilterOn[ladder] ? (maxGapMin[ladder] ?? null) : null);
      const capped = applyConcurrencyCap(gapFiltered, { maxConcurrent, perDirection });
      const dayTrades = (capped?.kept ?? []).filter(t => t.date === date);
      n += dayTrades.length;
    }
    byPair[pair] = notes.length ? { candidates: n, note: notes.join('; ') } : { candidates: n };
    total += n;
  }
  return { total, byPair };
}
