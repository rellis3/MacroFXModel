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
import { applyConcurrencyCap, applyCurrencyLossGate, VOTE_TRADES_SCHEMA } from './levelAtlasVoteReview.js';
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
    out.push({ key: pair, zone_id: m[1], date: t.date, direction: t.direction, profit: t.profit });
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
  ccyLossGate = false, maxDailyLossPct = 1,
} = {}) {
  const perPairKept = {};
  const missing = [];
  for (const pair of pairs) {
    const { trades: stored, reason } = await loadStoredVoteTrades(pair);
    if (!stored) { missing.push({ pair, reason }); continue; }
    const filtered = stored.filter(t => t.margin >= minMargin);
    const capped = applyConcurrencyCap(filtered, { maxConcurrent, perDirection });
    // Tagged UPPERCASE (not the caller's lowercase `pair`) -- CCY_LEGS's keys
    // are uppercase ('EURUSD') and currencyLegs() does a direct, case-
    // sensitive lookup with no normalization. Tagging lowercase here silently
    // sent every pair through the `?? [pair]` single-currency fallback,
    // meaning the gate could never see two pairs sharing a real leg (e.g.
    // EURUSD and EURAUD both carrying EUR exposure) -- confirmed live
    // 2026-09-25 as a real bug: it was why the currency loss gate barely ever
    // fired, leaving the candidate count far above the real backtest's own.
    perPairKept[pair] = (capped?.kept ?? []).map(t => ({ ...t, pair: pair.toUpperCase() }));
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
  for (const pair of pairs) {
    const trades = finalByPair[pair] ?? [];
    const dayTrades = trades.filter(t => t.date === date);
    byPair[pair] = { candidates: dayTrades.length };
    total += dayTrades.length;
  }
  for (const { pair, reason } of missing) byPair[pair] = { candidates: 0, note: reason };
  return { total, byPair };
}
