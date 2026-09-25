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

// Same fix as js/voteAtlasDriftAudit.js's own _withTimeout, ported not
// shared — a stuck (not merely slow) loadM1ForPairFn call on one pair must
// not hang the whole sequential candidate count forever. Confirmed live
// 2026-09-25 as a real production hang, not a guess.
function _withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${label}`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// REVERTED 2026-09-25: same incident as js/voteAtlasDriftAudit.js's own
// _mapLimit -- see the comment there. Concurrency caused a real production
// outage; this stays strictly sequential.
async function _mapLimit(items, fn) {
  const results = new Array(items.length);
  for (let i = 0; i < items.length; i++) results[i] = await fn(items[i], i);
  return results;
}

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
    // offset.md) -- the backtest touch times this gets matched against
    // (asiaFibAtlasWalk/mondayFibAtlasWalk's own `.time`) are true UTC.
    // Vote Atlas's own audit module never hit this: it matches trades to
    // touches by an ORDINAL parsed out of the comment tag ("downp50_1"),
    // never comparing raw timestamps at all. Fib Atlas's tag carries no
    // ordinal (this file's own header doc), so matching falls back to
    // "nearest touch by time_open" -- and un-corrected, that's nearest by a
    // clock running ~3h ahead, which doesn't just mis-rank candidates, it
    // reliably picks the WRONG touch outright on any day with more than one
    // real touch a few hours apart (confirmed live 2026-09-25, cross-checked
    // against a manual reconciliation done independently earlier the same
    // session: this bug alone was 100% of that day's reported "mismatches").
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

// `loadM1ForPairFn` injected, same discipline as auditVoteAtlasDrift — no
// hard dependency on a specific M1 source module.
export async function auditFibAtlasDrift(tradeEntries, loadM1ForPairFn, { minMargin = 1 } = {}) {
  const byKey = {};
  for (const t of tradeEntries) (byKey[`${t.pair}|${t.ladder}`] ??= []).push(t);

  const results = [];
  for (const [key, trades] of Object.entries(byKey)) {
    const [pair, ladder] = key.split('|');
    let packed;
    try { packed = await _withTimeout(loadM1ForPairFn(pair), 45_000, `loadM1ForPair(${pair})`); } catch (e) {
      for (const trade of trades) results.push({ ...trade, note: `M1 load failed: ${e.message}` });
      continue;
    }
    if (!packed?.n) { for (const trade of trades) results.push({ ...trade, note: 'no M1 data for this pair' }); continue; }

    const assetClass = assetClassFor(pair);
    const cost = _fibAuditCostForPair(pair, assetClass);
    const walkFn = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
    const { touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
    const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);

    // Fib Atlas's book has ~38 rung cells per side (every fib extension level)
    // vs Vote Atlas's fixed 3 (p50/p75/p90) -- buildAsiaFibAtlasBook is real
    // work per call. A caller auditing ONE calendar date at a time (this
    // feature's own daily reconciliation, not necessarily every caller) has
    // every trade on a pair share the identical `trade.date`, so memoize by
    // date rather than rebuild per trade -- confirmed live 2026-09-25 this
    // was the actual cause of a multi-minute stall, not the M1 walk itself.
    const bookCache = new Map(); // date -> book|null
    const bookFor = (date) => {
      if (bookCache.has(date)) return bookCache.get(date);
      const isOnly = atRearm.filter(t => t.date < date);
      const book = isOnly.length ? buildAsiaFibAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM }) : null;
      bookCache.set(date, book);
      return book;
    };

    for (const trade of trades) {
      const sameDaySideLevel = atRearm.filter(t => t.date === trade.date && t.side === trade.side && t.level === trade.level);
      if (!sameDaySideLevel.length) { results.push({ ...trade, note: 'no matching touch found' }); continue; }
      let touch = sameDaySideLevel[0], bestDt = Math.abs((touch.time || 0) - (trade.time_open || 0));
      for (const t of sameDaySideLevel) {
        const dt = Math.abs((t.time || 0) - (trade.time_open || 0));
        if (dt < bestDt) { touch = t; bestDt = dt; }
      }

      const book = bookFor(trade.date);
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

// Population, not just output — same reasoning and same shape as Vote
// Atlas's countVoteAtlasCandidates, ported here rather than shared, since
// Fib Atlas's candidate count is per-pair-per-LADDER (a pair can generate
// candidates on Asia AND Monday independently the same day).
export async function countFibAtlasCandidates(pairs, date, loadM1ForPairFn, { minMargin = 1, ladders = ['asia', 'monday'] } = {}) {
  let total = 0;
  const byPair = {};
  await _mapLimit(pairs, async (pair) => {
    try {
      const packed = await _withTimeout(loadM1ForPairFn(pair), 45_000, `loadM1ForPair(${pair})`);
      if (!packed?.n) { byPair[pair] = { candidates: 0, note: 'no M1 data' }; return; }
      const assetClass = assetClassFor(pair);
      let n = 0;
      for (const ladder of ladders) {
        const walkFn = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
        const { touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
        const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);
        const dayTouches = atRearm.filter(t => t.date === date);
        const isOnly = atRearm.filter(t => t.date < date);
        const book = isOnly.length ? buildAsiaFibAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM }) : null;
        if (!book) continue;
        for (const t of dayTouches) { const vd = voteDecision(book, t); if (vd && vd.margin >= minMargin) n++; }
      }
      byPair[pair] = { candidates: n };
      total += n;
    } catch (e) { byPair[pair] = { candidates: 0, note: e.message }; }
  });
  return { total, byPair };
}
