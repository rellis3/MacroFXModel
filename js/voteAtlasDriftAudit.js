/**
 * Vote Atlas drift audit — shared core, 2026-09-13.
 *
 * Extracted from analysis/vote_atlas_live_trade_validation.mjs (the manual
 * 150-trade audit run 2026-09-12) so BOTH a one-off analysis script and
 * server.js's own scheduled weekly job call the SAME logic, not two
 * implementations of the same check (see CLAUDE.md's "Live-vs-backtest
 * parity" rule, added the same night, about exactly this failure mode).
 *
 * For each closed trade: reconstruct the exact touch from real M1
 * (atlasWalk), build the book from ONLY touches dated STRICTLY BEFORE the
 * trade's own date (the honest, as-of-that-day book -- not today's book,
 * which has data no live bot could have had on that day), independently
 * compute voteDecision, and compare the resulting direction against what
 * was ACTUALLY traded. A trade whose honest margin is <3 isn't a
 * "mismatch" -- it's its own category (thin-margin), same discipline the
 * manual audit already established.
 */
import { atlasWalk } from './levelAtlasEngine.js';
import { buildAtlasBook } from './levelAtlasReport.js';
import { voteDecision, betDirection, priceBarrierTrade } from './levelAtlasVoteReview.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { costForPair as _voteAuditCostForPair } from './perLineStrategy.js';
import { DEFAULT_REARM } from './levelAtlasRoutes.js';
import { resolveKey } from './instrumentRegistry.js';

export const KEY_TO_PAIR = { rut: 'us2000', spx: 'spx', de40: 'de30', ftse: 'uk100', gold: 'gold', nq: 'nq', dow: 'dow' };

// A stuck (not merely slow) loadM1ForPair call on ONE pair must not hang an
// entire multi-pair candidate count forever — confirmed live 2026-09-25:
// countVoteAtlasCandidates's per-pair try/catch only catches a REJECTION,
// not a promise that simply never resolves, and a sequential for-loop means
// one stuck pair blocks every pair after it too. 45s is generous next to
// this repo's own measured cost for a single pair's full-history fetch.
function _withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${label}`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// REVERTED 2026-09-25: a concurrency-limited _mapLimit briefly lived here.
// It caused a real production outage (server-wide 502s for over an hour) --
// loadM1ForPair's parquet decode is CPU-bound and js/volBacktestM1Engine.js
// already documents that it degrades badly under concurrent load (a prior
// incident: one decode sat for 20+ minutes competing with other bots' own
// polling). Node is single-threaded, so running several pairs "concurrently"
// doesn't parallelize that decode work -- it just piles up competing
// synchronous blocks that each starve the event loop when they run, which
// starved every other live bot's KV/R2 reads too. Do not reintroduce
// concurrency here without first fixing the decode path itself (e.g. yielding
// between chunks, or moving decode off the main thread) and load-testing in
// isolation, not against production.
async function _mapLimit(items, fn) {
  const results = new Array(items.length);
  for (let i = 0; i < items.length; i++) results[i] = await fn(items[i], i);
  return results;
}

// Adapts GET /api/trade-history's raw MT5 records into the {key, zone_id,
// date, direction, profit} shape auditVoteAtlasDrift expects, by parsing the
// zone tag each bot's own comment carries -- "VA[downp50_1]" (v2),
// "VA3[downp50_1]" (v3). Built 2026-09-25 so v2 and v3 can share this ONE
// audit function via a normalizer instead of v3 needing its own copy just
// because it lacks the older volatility_bot_v2_trade_log KV shape v2 has.
// `tagPrefix` must match exactly (not a substring) -- "VA[" would also match
// inside "VA3[..." otherwise.
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

// `loadM1ForPairFn` is injected (not imported directly) so this module has
// no hard dependency on volBacktestM1Engine.js's own import chain -- keeps
// this a pure decision-logic brick, same discipline the rest of this
// project's Lego bricks follow.
export async function auditVoteAtlasDrift(tradeLogEntries, loadM1ForPairFn, { minMargin = 3 } = {}) {
  const byPair = {};
  for (const t of tradeLogEntries) {
    const pair = KEY_TO_PAIR[t.key] ?? t.key;
    (byPair[pair] ??= []).push(t);
  }

  const results = [];
  for (const [pair, pairTrades] of Object.entries(byPair)) {
    let packed;
    try { packed = await _withTimeout(loadM1ForPairFn(pair), 45_000, `loadM1ForPair(${pair})`); } catch (e) {
      for (const trade of pairTrades) results.push({ ...trade, pair, note: `M1 load failed: ${e.message}` });
      continue;
    }
    if (!packed?.n) {
      for (const trade of pairTrades) results.push({ ...trade, pair, note: 'no M1 data for this pair' });
      continue;
    }
    const assetClass = assetClassFor(pair);
    const cost = _voteAuditCostForPair(pair, assetClass);
    const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
    const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);

    for (const trade of pairTrades) {
      const m = (trade.zone_id || '').match(/^(up|down)(p50|p75|p90)_(\d+)$/);
      if (!m) { results.push({ ...trade, pair, note: 'unparseable zone_id' }); continue; }
      const [, side, rung, instanceStr] = m;
      const instance = +instanceStr;
      const sameDay = atRearm.filter(t => t.date === trade.date && t.side === side && t.rung === rung).sort((a, b) => a.time - b.time);
      const touch = sameDay[instance - 1];
      if (!touch) { results.push({ ...trade, pair, side, rung, instance, note: `no matching touch found (${sameDay.length} on that day)` }); continue; }

      const isOnly = atRearm.filter(t => t.date < trade.date);
      const book = isOnly.length ? buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM }) : null;
      const vd = book ? voteDecision(book, touch) : null;

      if (!vd || vd.margin < minMargin) {
        results.push({ ...trade, pair, side, rung, instance, note: vd ? `margin ${vd.margin} < ${minMargin}, should not have traded` : 'no vote (insufficient book)', myDecision: vd?.decision ?? null, myMargin: vd?.margin ?? null });
        continue;
      }
      const myDir = betDirection({ decision: vd.decision, side });
      const actualDir = trade.direction === 'BUY' ? 'long' : 'short';

      // Win/loss verdict + expected P&L (2026-09-25 extension) — the OTHER
      // half of "does live match the backtest": a right-direction trade can
      // still win or lose differently than the backtest's own clean path
      // simulation, and a day of correct decisions can still land on a
      // materially different P&L than the backtest's own expectation for
      // the same trades. `touch.outcome === 'neither'` (session ended before
      // resolving) is reported separately, never folded into a mismatch —
      // the backtest genuinely never reached a verdict for that zone.
      let winLossMatch, myWinLoss, priced;
      if (touch.outcome !== 'neither') {
        const won = (vd.decision === 'fade' && touch.outcome === 'back') || (vd.decision === 'follow' && touch.outcome === 'out');
        myWinLoss = won ? 'WIN' : 'LOSS';
        const realProfit = typeof trade.profit === 'number' ? trade.profit : (typeof trade.pnl === 'number' ? trade.pnl : null);
        if (realProfit != null) winLossMatch = (realProfit > 0) === won;
      }
      try { priced = priceBarrierTrade(touch, vd.decision, cost); } catch { priced = null; }

      results.push({
        ...trade, pair, side, rung, instance, myDecision: vd.decision, myMargin: vd.margin, myDir, actualDir, dirMatch: myDir === actualDir,
        btOutcome: touch.outcome, myWinLoss, winLossMatch, expectedPnlPct: priced?.pnlPct ?? null,
      });
    }
  }

  const withVote = results.filter(r => r.dirMatch !== undefined);
  const mismatches = withVote.filter(r => !r.dirMatch);
  const noVoteOrThin = results.filter(r => r.dirMatch === undefined);
  const winLossChecked = results.filter(r => r.winLossMatch !== undefined);
  const winLossMismatches = winLossChecked.filter(r => !r.winLossMatch);
  const unresolved = results.filter(r => r.btOutcome === 'neither');
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
    // Win/loss + expected-P&L rollup — undefined (not zero) when nothing was
    // resolvable, so a caller can tell "checked, 100% agree" apart from
    // "nothing to check" rather than reading both as a clean pass.
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
// result it looks like. This counts, across the bot's OWN enabled_pairs
// universe for one date, how many zones the honest as-of-that-day backtest
// would have voted margin >= minMargin on — the number to compare the
// bot's real trade count against.
export async function countVoteAtlasCandidates(pairs, date, loadM1ForPairFn, { minMargin = 3 } = {}) {
  let total = 0;
  const byPair = {};
  await _mapLimit(pairs, async (pair) => {
    try {
      const packed = await _withTimeout(loadM1ForPairFn(pair), 45_000, `loadM1ForPair(${pair})`);
      if (!packed?.n) { byPair[pair] = { candidates: 0, note: 'no M1 data' }; return; }
      const assetClass = assetClassFor(pair);
      const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
      const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM && t.rung !== 'p90');
      const dayTouches = atRearm.filter(t => t.date === date);
      const isOnly = atRearm.filter(t => t.date < date);
      const book = isOnly.length ? buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM }) : null;
      let n = 0;
      if (book) for (const t of dayTouches) { const vd = voteDecision(book, t); if (vd && vd.margin >= minMargin) n++; }
      byPair[pair] = { candidates: n };
      total += n;
    } catch (e) { byPair[pair] = { candidates: 0, note: e.message }; }
  });
  return { total, byPair };
}
