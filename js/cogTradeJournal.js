// js/cogTradeJournal.js — trade record construction + the Trade Journal's
// query/filter layer.
//
// Trade objects produced here satisfy nasdaqPerformance.js's exact expected
// shape (.reason, .pnlR, .barsHeld, .riskPct, .entryIndex — riskPct is a
// PERCENT of account equity, e.g. 1.0 = 1%, matching that file's
// monteCarloBootstrap usage of `(t.riskPct / 100) * t.pnlR`) PLUS this
// system's own "no black boxes" audit trail: every gate's state/reasons at
// entry, the full entry plan, and the full exit breakdown — so the Trade
// Journal UI can show exactly why a trade was taken and why it was closed,
// not just its PnL.

let nextTradeId = 1;
export function resetTradeIdCounter() { nextTradeId = 1; } // test/backtest-rerun hygiene only

// Opens a trade record from cogExecutionEngine.js's decideAction/entryPlan
// output at bar `entryIndex`. `accountEquity` is the same value passed into
// computeExecutionSignals — riskPct is derived from it directly (riskAmount
// / accountEquity) rather than re-deriving the tier/base-risk multiplier
// chain, so this file never has to know COG_EXECUTION's internals.
//
// `entryDayIdx` is optional: the daily engine's `entryIndex` already IS a
// day index (one bar per calendar day), so it never passes this. The
// event-driven intraday engine's `entryIndex` is an INTRADAY bar index
// instead, so it separately threads `entryDayIdx` — the day-resolution
// Gate1A/Gate2/Gate3 array position this trade's entry snapshot came from —
// for the Exit Engine's re-evaluation lookups to use later.
export function openTradeRecord({ entryIndex, entryDate, action, entryPlan, accountEquity, gate1Entry, gate2Entry, gate3Entry, entryDayIdx = null }) {
  return {
    id: nextTradeId++,
    entryIndex,
    entryDayIdx,
    entryDate,
    direction: action,
    instrument: entryPlan.instrument,
    tier: entryPlan.tier,
    stopModelId: entryPlan.stopModelId,
    entryPrice: entryPlan.entryPrice,
    stopStandardPrice: entryPlan.stopStandard.price,
    stopConservativePrice: entryPlan.stopConservative.price,
    positionSize: entryPlan.positionSize,
    riskAmount: entryPlan.riskAmount,
    riskPct: accountEquity > 0 ? (entryPlan.riskAmount / accountEquity) * 100 : NaN,
    costs: entryPlan.costs,
    entryReasons: { gate1: gate1Entry.reasons, gate2: gate2Entry.breakdown, gate3: gate3Entry.reasons },
    // Filled in by closeTradeRecord:
    exitIndex: null, exitDate: null, exitPrice: null, reason: null,
    barsHeld: null, pnlR: null, pnlDollars: null, exitReasons: null,
    sizeReducedAt: [],
  };
}

// Records a mid-trade REDUCE event without closing the trade — actual
// position-size reduction accounting is the backtest loop's job; this only
// keeps the audit trail of WHEN/WHY the Exit Engine flagged it.
export function recordReduceEvent(trade, { index, date, exitScoreResult }) {
  trade.sizeReducedAt.push({ index, date, score: exitScoreResult.score, reasons: exitScoreResult.reasons });
}

// Closes a trade, computing PnL in both $ and R-multiples (R = risk-amount
// units, so -1R means "lost exactly the planned risk", independent of
// position size, and is what every nasdaqPerformance.js stat keys off).
// `exitPrice` must already reflect whatever fill rule was used to leave the
// trade (e.g. next-bar-open on a CLOSE signal) — this function only does
// the PnL arithmetic, never sources the price itself.
export function closeTradeRecord(trade, { exitIndex, exitDate, exitPrice, reason, exitScoreResult }) {
  const sideSign = trade.direction === 'LONG' ? 1 : -1;
  const pnlPerUnit = sideSign * (exitPrice - trade.entryPrice);
  const pnlDollars = pnlPerUnit * trade.positionSize - trade.costs.estTotalCost;
  const pnlR = trade.riskAmount > 0 ? pnlDollars / trade.riskAmount : NaN;

  trade.exitIndex = exitIndex;
  trade.exitDate = exitDate;
  trade.exitPrice = exitPrice;
  trade.reason = reason;
  trade.barsHeld = exitIndex - trade.entryIndex;
  trade.pnlDollars = pnlDollars;
  trade.pnlR = pnlR;
  trade.exitReasons = exitScoreResult ? { score: exitScoreResult.score, breakdown: exitScoreResult.breakdown, reasons: exitScoreResult.reasons } : null;
  return trade;
}

// Marks a still-open trade at the end of the backtest history with the
// END_OF_HISTORY_OPEN sentinel nasdaqPerformance.js's completedOnly()
// recognizes and excludes from every trade-level stat.
export function markEndOfHistoryOpen(trade, { lastIndex, lastDate, lastPrice }) {
  return closeTradeRecord(trade, { exitIndex: lastIndex, exitDate: lastDate, exitPrice: lastPrice, reason: 'END_OF_HISTORY_OPEN', exitScoreResult: null });
}

// ── Trade Journal query/filter layer (Backtest Lab UI) ─────────────────────

export function filterTrades(trades, filters = {}) {
  const { direction, tier, stopModelId, reason, dateFrom, dateTo, minPnlR, maxPnlR, outcome } = filters;
  return trades.filter(t => {
    if (direction && t.direction !== direction) return false;
    if (tier && t.tier !== tier) return false;
    if (stopModelId && t.stopModelId !== stopModelId) return false;
    if (reason && t.reason !== reason) return false;
    if (dateFrom && t.entryDate < dateFrom) return false;
    if (dateTo && t.entryDate > dateTo) return false;
    if (minPnlR != null && !(t.pnlR >= minPnlR)) return false;
    if (maxPnlR != null && !(t.pnlR <= maxPnlR)) return false;
    if (outcome === 'win' && !(t.pnlR > 0)) return false;
    if (outcome === 'loss' && !(t.pnlR <= 0)) return false;
    return true;
  });
}

export function sortTrades(trades, { by = 'entryIndex', dir = 'asc' } = {}) {
  const sorted = trades.slice().sort((a, b) => {
    const av = a[by], bv = b[by];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  if (dir === 'desc') sorted.reverse();
  return sorted;
}

// Exit-reason histogram (e.g. how many trades closed via the Exit Engine's
// CLOSE rule vs. a stop hit) for the Backtest Lab's gate-hit-rate view.
export function reasonFrequency(trades) {
  const counts = new Map();
  for (const t of trades) {
    if (t.reason === 'END_OF_HISTORY_OPEN') continue;
    counts.set(t.reason, (counts.get(t.reason) || 0) + 1);
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}
