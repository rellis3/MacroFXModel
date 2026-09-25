/**
 * Vote Atlas drift audit — shared core, 2026-09-13, REWRITTEN 2026-09-25.
 *
 * Extracted from analysis/vote_atlas_live_trade_validation.mjs (the manual
 * 150-trade audit run 2026-09-12) so BOTH a one-off analysis script and
 * server.js's own scheduled weekly job call the SAME logic, not two
 * implementations of the same check (see CLAUDE.md's "Live-vs-backtest
 * parity" rule, added the same night, about exactly this failure mode).
 *
 * REWRITE, 2026-09-25: the original version re-derived everything from raw
 * M1 via atlasWalk on every call — expensive (a genuine production outage,
 * twice, from the CPU-bound parquet decode blocking the server's one event
 * loop) AND wrong (a candidate count of 45 against a ground-truth backtest
 * total of 17 for the same day). The actual source of truth is the SAME
 * precomputed, nightly-refreshed `{pair}-votetrades.json` files
 * `/api/level-atlas/vote-portfolio` already reads — built once by the
 * nightly job from an honest, look-ahead-free book (the schema-3/4 fixes
 * this file's own git history references), and already carrying the
 * decision/margin/win/pnlPct this module used to re-derive by hand. Reading
 * them is a small R2 JSON fetch, not a multi-million-row parquet decode, and
 * it's provably the SAME number the page the user checks manually shows —
 * there's no second implementation to drift out of sync with the first.
 *
 * For each closed trade: find its matching stored trade (by date/side/rung/
 * instance-ordinal, the same info the bot's own comment tag encodes) and
 * compare the ACTUAL direction/outcome against what's already recorded
 * there. A trade whose stored margin is <minMargin isn't a "mismatch" — same
 * thin-margin category the original version already established.
 */
import { betDirection } from './levelAtlasVoteReview.js';
import { applyConcurrencyCap, applyCurrencyLossGate, riskAdjustTrades, VOTE_TRADES_SCHEMA } from './levelAtlasVoteReview.js';
import { pickFresher, loadLocalVoteTrades, PREFIX as LEVEL_ATLAS_PREFIX } from './levelAtlasRoutes.js';
import { getJSON } from './r2Store.js';
import { resolveKey } from './instrumentRegistry.js';

export const KEY_TO_PAIR = { rut: 'us2000', spx: 'spx', de40: 'de30', ftse: 'uk100', gold: 'gold', nq: 'nq', dow: 'dow' };

// Adapts GET /api/trade-history's raw MT5 records into the {key, zone_id,
// date, direction, profit} shape this module expects, by parsing the zone
// tag each bot's own comment carries -- "VA[downp50_1]" (v2), "VA3[downp50_1]"
// (v3). Built 2026-09-25 so v2 and v3 can share this ONE audit function via a
// normalizer instead of v3 needing its own copy just because it lacks the
// older volatility_bot_v2_trade_log KV shape v2 has. `tagPrefix` must match
// exactly (not a substring) -- "VA[" would also match inside "VA3[..." otherwise.
// resolveKey() doesn't know these broker index symbols (confirmed 2026-09-22
// investigation: resolveKey('DE40') -> null, resolveKey('US2000') -> 'rut',
// a DIFFERENT canonical name than local storage/atlasWalk use) -- same
// manual override this session's own reconciliation scripts needed.
const _SYMBOL_OVERRIDE = { DE40: 'de30', US2000: 'us2000', US30: 'dow', US500: 'spx', US100: 'nq', UK100: 'uk100' };

export function normalizeTradeHistoryForVoteAtlasAudit(rawTrades, tagPrefix) {
  const re = new RegExp(`^${tagPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[([a-z0-9_]+)\\]$`);
  const out = [];
  for (const t of rawTrades || []) {
    const m = re.exec(t.comment || '');
    if (!m) continue;
    const sym = String(t.symbol || '').toUpperCase();
    let pair = _SYMBOL_OVERRIDE[sym];
    if (!pair) { try { pair = resolveKey(sym)?.toLowerCase(); } catch { /* fall through */ } }
    if (!pair) pair = sym.toLowerCase();
    // time_open corrected to true UTC (MT5 stamps on the broker's clock,
    // commonly +2/+3h -- same fix js/fibAtlasDriftAudit.js's own normalizer
    // already applies) -- carried through so a caller can cross-reference
    // an unmatched real trade against the bot's own decision log by time,
    // the same way missedCandidates already can.
    out.push({ key: pair, zone_id: m[1], date: t.date, direction: t.direction, profit: t.profit,
      time_open: (t.time_open || 0) - (t.tz_offset_sec || 0) });
  }
  return out;
}

// Reads the SAME stored votetrades file /api/level-atlas/vote-portfolio
// reads (pickFresher: R2 first, local file as fallback). Returns null (with
// a reason) rather than throwing -- a missing/stale-schema pair is a
// reportable condition for the caller, not a hard failure for every pair.
async function loadStoredVoteTrades(pair) {
  const stored = pickFresher(await getJSON(`${LEVEL_ATLAS_PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
  if (!stored) return { trades: null, reason: 'no vote-backtest data for this pair' };
  if ((stored.schema ?? 1) < VOTE_TRADES_SCHEMA) return { trades: null, reason: `stale schema (current is ${VOTE_TRADES_SCHEMA})` };
  return { trades: stored.trades, reason: null };
}

export async function auditVoteAtlasDrift(tradeLogEntries, { minMargin = 3 } = {}) {
  const byPair = {};
  for (const t of tradeLogEntries) {
    const pair = KEY_TO_PAIR[t.key] ?? t.key;
    (byPair[pair] ??= []).push(t);
  }

  const results = [];
  for (const [pair, pairTrades] of Object.entries(byPair)) {
    const { trades: stored, reason } = await loadStoredVoteTrades(pair);
    if (!stored) {
      for (const trade of pairTrades) results.push({ ...trade, pair, note: reason });
      continue;
    }

    for (const trade of pairTrades) {
      const m = (trade.zone_id || '').match(/^(up|down)(p50|p75|p90)_(\d+)$/);
      if (!m) { results.push({ ...trade, pair, note: 'unparseable zone_id' }); continue; }
      const [, side, rung, instanceStr] = m;
      const instance = +instanceStr;
      const sameDay = stored.filter(t => t.date === trade.date && t.side === side && t.rung === rung).sort((a, b) => a.time - b.time);
      const matched = sameDay[instance - 1];
      if (!matched) { results.push({ ...trade, pair, side, rung, instance, note: `no matching stored trade (${sameDay.length} on that day)` }); continue; }

      if (matched.margin < minMargin) {
        results.push({ ...trade, pair, side, rung, instance, note: `margin ${matched.margin} < ${minMargin}, should not have traded`, myDecision: matched.decision, myMargin: matched.margin });
        continue;
      }
      const myDir = betDirection({ decision: matched.decision, side });
      const actualDir = trade.direction === 'BUY' ? 'long' : 'short';

      // Win/loss verdict (already computed and stored — no re-simulation
      // needed) + the stored expected P&L. `matched.timedOut` (session ended
      // before the race resolved) is reported separately, never folded into
      // a mismatch -- the backtest genuinely never reached a verdict for
      // that zone, same discipline the original version established.
      const realProfit = typeof trade.profit === 'number' ? trade.profit : (typeof trade.pnl === 'number' ? trade.pnl : null);
      const winLossMatch = realProfit != null ? (realProfit > 0) === matched.win : undefined;

      results.push({
        ...trade, pair, side, rung, instance, myDecision: matched.decision, myMargin: matched.margin, myDir, actualDir, dirMatch: myDir === actualDir,
        timedOut: matched.timedOut, myWinLoss: matched.win ? 'WIN' : 'LOSS', winLossMatch, expectedPnlPct: matched.pnlPct ?? null,
        // matchedTime identifies exactly which stored candidate this real
        // trade consumed -- lets a caller cross-reference against
        // countVoteAtlasCandidates' own kept-candidate list (same `.time`
        // field, same source file) to find candidates NO real trade ever
        // matched, i.e. genuinely missed signals, not just a count gap.
        matchedTime: matched.time,
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
    totalTrades: tradeLogEntries.length,
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

// Population, not just output (2026-09-25) — auditVoteAtlasDrift above only
// answers "of the trades the bot actually took, did they match the
// backtest." It says nothing about trades the backtest would have taken
// that the bot silently skipped (margin timing, a plan-refresh miss, spread
// filters, risk_guard/stack_guard, or a genuine bug) — a 100% match rate on
// a bot that's quietly skipping half its real signals is not the clean
// result it looks like.
//
// This must count the SAME trades /api/level-atlas/vote-portfolio would
// show for this date, under the SAME portfolio-level filters the live bot's
// own config actually uses (per-pair concurrency cap, currency loss gate) —
// not just a raw margin>=minMargin count, which is what produced the
// original, wrong 45-vs-17 mismatch: the stored file's margin filter alone
// says nothing about which of those candidates a capital-limited, gated
// portfolio would actually have taken.
export async function countVoteAtlasCandidates(pairs, date, {
  minMargin = 3, maxConcurrent = 1, perDirection = false,
  ccyLossGate = false, maxDailyLossPct = 1, riskPct = 1,
} = {}) {
  const perPairKept = {};
  const missing = [];
  for (const pair of pairs) {
    const { trades: stored, reason } = await loadStoredVoteTrades(pair);
    if (!stored) { missing.push({ pair, reason }); continue; }
    const filtered = stored.filter(t => t.margin >= minMargin);
    const capped = applyConcurrencyCap(filtered, { maxConcurrent, perDirection });
    // riskAdjustTrades BEFORE the ccy gate -- confirmed live 2026-09-25 via a
    // direct A/B against the real /vote-portfolio route (curl, no cache):
    // the real gate skips 3279 of 26891 candidates; this function, before
    // this fix, only skipped ~1127-1190. Root cause: applyCurrencyLossGate's
    // tally sums `pnlPct` directly, and the STORED pnlPct is a raw,
    // price-based percentage that varies wildly across asset classes (0.2%
    // on one trade, 0.6% on another, tiny on indices) -- riskAdjustTrades
    // rescales every trade to a CONSTANT per-trade risk (a full loss becomes
    // exactly -riskPct), which is what the real route feeds the gate in
    // fixed-risk mode (the live bots' own sizing). Skipping this step meant
    // same-day same-currency losses almost never summed past -1%, so the
    // gate barely ever fired -- not the pair-casing bug (real, but smaller),
    // the actual dominant cause of the original 45/39-vs-17 mismatch.
    const adjusted = riskAdjustTrades(capped?.kept ?? [], riskPct);
    // Tagged UPPERCASE (not the caller's lowercase `pair`) -- CCY_LEGS's keys
    // are uppercase ('EURUSD') and currencyLegs() does a direct, case-
    // sensitive lookup with no normalization. Tagging lowercase here silently
    // sent every pair through the `?? [pair]` single-currency fallback,
    // meaning the gate could never see two pairs sharing a real leg (e.g.
    // EURUSD and EURAUD both carrying EUR exposure).
    perPairKept[pair] = adjusted.map(t => ({ ...t, pair: pair.toUpperCase() }));
  }

  let finalByPair = perPairKept;
  if (ccyLossGate) {
    const merged = Object.values(perPairKept).flat();
    const gated = applyCurrencyLossGate(merged, { maxDailyLossPct });
    const byPair = {};
    for (const t of gated.kept) (byPair[t.pair.toLowerCase()] ??= []).push(t);
    finalByPair = byPair;
  }

  let total = 0;
  const byPair = {};
  const allCandidates = [];
  for (const pair of pairs) {
    const trades = finalByPair[pair] ?? [];
    const dayTrades = trades.filter(t => t.date === date);
    byPair[pair] = { candidates: dayTrades.length };
    total += dayTrades.length;
    // Kept minimal (pair/side/rung/margin/decision/time) -- enough for a
    // caller to cross-reference against auditVoteAtlasDrift's own
    // `matchedTime` field (find candidates no real trade ever consumed) and
    // to show a human what was missed, without carrying every stat field.
    for (const t of dayTrades) allCandidates.push({ pair, side: t.side, rung: t.rung, margin: t.margin, decision: t.decision, time: t.time });
  }
  for (const { pair, reason } of missing) byPair[pair] = { candidates: 0, note: reason };
  return { total, byPair, allCandidates };
}

// The actual "why" step, 2026-09-25 — a missed candidate or an unmatched
// real trade is only a SYMPTOM; the bot's own decision log (already built,
// js/serviceFlags.js-adjacent Python bots write it directly) is the
// authoritative record of what the live engine actually did at that moment.
// This cross-references by pair + time rather than trying to re-derive
// portfolio/risk state independently — re-simulating risk_guard/stack_guard
// here would just be a second implementation of logic that already lives,
// correctly, in the Python bot (js/serviceFlags.js's "one copy" principle).
//
// Matching rule: the MOST RECENT log event strictly before the candidate/
// trade's own time, among events that actually APPLY to it: same pair (or
// a wildcard "*" pair meaning "every pair on this ladder"), and — for
// engines with a ladder dimension (Fib Atlas: a pair can fire on Asia AND
// Monday independently the same day) — same ladder, or a wildcard "*"
// ladder meaning "applies regardless of ladder". Vote Atlas/Motif items
// carry no `.ladder` at all, so this degrades to pure pair matching for
// them, unchanged from the original behaviour.
//
// "entered"/"closed" don't count as a blocking explanation (the pair was
// actively trading, not blocked). Where the reason carries its own expiry
// ("Cooldown — 3.9m remaining"), that's checked precisely; otherwise a
// bounded lookback window (default 4h) caps how far back a plausible-but-
// unverifiable explanation can reach — beyond that, honestly reported as
// "no log evidence" rather than guessed.
export function explainGapsFromDecisionLog(items, dayEvents, { maxLookbackSec = 4 * 3600 } = {}) {
  const applies = (event, pair, ladder) => {
    const ePair = String(event.pair || '').toLowerCase();
    if (ePair !== pair && ePair !== '*') return false;
    if (ladder == null) return true; // item has no ladder concept -- pair match is enough
    const eLadder = event.ladder == null ? null : String(event.ladder).toLowerCase();
    return eLadder === ladder || eLadder === '*' || eLadder == null;
  };
  const sorted = [...(dayEvents || [])].sort((a, b) => a.t - b.t);

  return items.map(item => {
    const itemTime = item.time ?? item.time_open;
    if (!itemTime) return { ...item, explainedBy: null, explainReason: 'no timestamp to cross-reference' };
    const pair = String(item.pair || '').toLowerCase();
    const ladder = item.ladder != null ? String(item.ladder).toLowerCase() : null;
    const events = sorted.filter(e => applies(e, pair, ladder));
    let best = null;
    for (const e of events) {
      if (e.t > itemTime) break; // sorted ascending
      best = e;
    }
    if (!best) return { ...item, explainedBy: null, explainReason: 'no log entry found for this pair before this time' };
    if (best.status === 'entered' || best.status === 'closed') {
      return { ...item, explainedBy: null, explainReason: `nearest log entry was "${best.status}", not a block — no blocking event found` };
    }
    const m = /—\s*([\d.]+)m remaining/.exec(best.reason || '');
    if (m) {
      const expiresAt = best.t + parseFloat(m[1]) * 60;
      if (itemTime > expiresAt) {
        return { ...item, explainedBy: null, explainReason: `nearest block ("${best.reason}") had already expired by this time` };
      }
    } else if (itemTime - best.t > maxLookbackSec) {
      return { ...item, explainedBy: null, explainReason: `nearest log entry ("${best.reason || best.status}") is over ${(maxLookbackSec / 3600).toFixed(1)}h earlier — too old to attribute confidently` };
    }
    return { ...item, explainedBy: { t: best.t, status: best.status, reason: best.reason }, explainReason: null };
  });
}
