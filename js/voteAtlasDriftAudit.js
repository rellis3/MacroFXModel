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
import { voteDecision, betDirection } from './levelAtlasVoteReview.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { costForPair as _voteAuditCostForPair } from './perLineStrategy.js';
import { DEFAULT_REARM } from './levelAtlasRoutes.js';

export const KEY_TO_PAIR = { rut: 'us2000', spx: 'spx', de40: 'de30', ftse: 'uk100', gold: 'gold', nq: 'nq', dow: 'dow' };

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
    try { packed = await loadM1ForPairFn(pair); } catch (e) {
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
      results.push({ ...trade, pair, side, rung, instance, myDecision: vd.decision, myMargin: vd.margin, myDir, actualDir, dirMatch: myDir === actualDir });
    }
  }

  const withVote = results.filter(r => r.dirMatch !== undefined);
  const mismatches = withVote.filter(r => !r.dirMatch);
  const noVoteOrThin = results.filter(r => r.dirMatch === undefined);
  return {
    generatedAt: new Date().toISOString(),
    totalTrades: tradeLogEntries.length,
    checkedWithVote: withVote.length,
    directionMatches: withVote.length - mismatches.length,
    directionMismatches: mismatches.length,
    matchRate: withVote.length ? +((withVote.length - mismatches.length) / withVote.length * 100).toFixed(1) : null,
    thinMarginOrNoVote: noVoteOrThin.length,
    mismatchDetail: mismatches,
    results,
  };
}
