/**
 * Fib Atlas drift audit — the js/voteAtlasDriftAudit.js pattern, ported for
 * Fib Atlas's own engine shape (2026-09-25).
 *
 * Structural differences from Vote Atlas, confirmed by direct investigation
 * before writing this (not guessed):
 *  - Two separate walk engines share ONE vote/pricing module: asiaFibAtlasWalk
 *    and mondayFibAtlasWalk both feed straight into asiaFibAtlasVoteReview.js's
 *    voteDecision/priceBarrierTrade and asiaFibAtlasReport.js's
 *    buildAsiaFibAtlasBook — no separate "mondayFibAtlasVoteReview.js" exists,
 *    because Monday's touch records deliberately reuse Asia's field names.
 *  - "rung" is a fib EXTENSION MULTIPLIER (e.g. 1.25, -2.5), not a p50/p75/p90
 *    label, keyed on the touch record as `level`; `side` is 'above'/'below',
 *    not 'up'/'down'.
 *  - The comment tag (`FA[a_a1.25]` v1, `FA2[m_b-2.5]` v2) carries the ladder
 *    (a=asia, m=monday) and side+level, but — unlike Vote Atlas's own
 *    "downp50_1" — NO trailing instance-ordinal. Re-touches of the same rung
 *    reuse the identical tag; the live bot disambiguates via its own
 *    in-memory RearmTracker state, which isn't recoverable from a closed
 *    trade record after the fact. So a real trade is matched to the NEAREST
 *    same-day/side/level touch by time_open, not an ordinal lookup — the
 *    best available signal given what the tag actually carries, not a
 *    downgrade from Vote Atlas's method.
 */
import { asiaFibAtlasWalk } from './asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from './mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from './asiaFibAtlasReport.js';
import { voteDecision, priceBarrierTrade } from './asiaFibAtlasVoteReview.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { costForPair as _fibAuditCostForPair } from './perLineStrategy.js';
import { resolveKey } from './instrumentRegistry.js';

const _SYMBOL_OVERRIDE = { DE40: 'de30', US2000: 'us2000', US30: 'dow', US500: 'spx', US100: 'nq', UK100: 'uk100' };
const DEFAULT_REARM = 0.3;

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
    out.push({
      pair, ladder: ladderCode === 'a' ? 'asia' : 'monday',
      side: sideCode === 'a' ? 'above' : 'below',
      level: parseFloat(levelStr),
      date: t.date, direction: t.direction, profit: t.profit, time_open: t.time_open,
    });
  }
  return out;
}

// `loadM1ForPairFn` injected, same discipline as auditVoteAtlasDrift — no
// hard dependency on a specific M1 source module.
export async function auditFibAtlasDrift(tradeEntries, loadM1ForPairFn, { minMargin = 1 } = {}) {
  const byKey = {};
  for (const t of tradeEntries) (byKey[`${t.pair}|${t.ladder}`] ??= []).push(t);

  const results = [];
  for (const [key, trades] of Object.entries(byKey)) {
    const [pair, ladder] = key.split('|');
    let packed;
    try { packed = await loadM1ForPairFn(pair); } catch (e) {
      for (const trade of trades) results.push({ ...trade, note: `M1 load failed: ${e.message}` });
      continue;
    }
    if (!packed?.n) { for (const trade of trades) results.push({ ...trade, note: 'no M1 data for this pair' }); continue; }

    const assetClass = assetClassFor(pair);
    const cost = _fibAuditCostForPair(pair, assetClass);
    const walkFn = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
    const { touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
    const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);

    for (const trade of trades) {
      const sameDaySideLevel = atRearm.filter(t => t.date === trade.date && t.side === trade.side && t.level === trade.level);
      if (!sameDaySideLevel.length) { results.push({ ...trade, note: 'no matching touch found' }); continue; }
      let touch = sameDaySideLevel[0], bestDt = Math.abs((touch.time || 0) - (trade.time_open || 0));
      for (const t of sameDaySideLevel) {
        const dt = Math.abs((t.time || 0) - (trade.time_open || 0));
        if (dt < bestDt) { touch = t; bestDt = dt; }
      }

      const isOnly = atRearm.filter(t => t.date < trade.date);
      const book = isOnly.length ? buildAsiaFibAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM }) : null;
      const vd = book ? voteDecision(book, touch) : null;

      if (!vd || vd.margin < minMargin) {
        results.push({ ...trade, note: vd ? `margin ${vd.margin} < ${minMargin}, should not have traded` : 'no vote (insufficient book)', myDecision: vd?.decision ?? null, myMargin: vd?.margin ?? null });
        continue;
      }
      const myDir = fibBetDirection(vd.decision, trade.side);
      const actualDir = trade.direction === 'BUY' ? 'long' : 'short';

      let winLossMatch, myWinLoss, priced;
      if (touch.outcome !== 'neither') {
        const won = (vd.decision === 'fade' && touch.outcome === 'back') || (vd.decision === 'follow' && touch.outcome === 'out');
        myWinLoss = won ? 'WIN' : 'LOSS';
        if (typeof trade.profit === 'number') winLossMatch = (trade.profit > 0) === won;
      }
      try { priced = priceBarrierTrade(touch, vd.decision, cost); } catch { priced = null; }

      results.push({
        ...trade, myDecision: vd.decision, myMargin: vd.margin, myDir, actualDir, dirMatch: myDir === actualDir,
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
