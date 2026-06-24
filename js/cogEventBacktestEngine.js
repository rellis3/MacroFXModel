// js/cogEventBacktestEngine.js — event-driven INTRADAY backtest engine.
//
// Replaces cogBacktestEngine.js's one-evaluation-per-daily-bar loop with the
// actual observed COG workflow: a single decision cycle per trading day,
// sequenced through Gate1B's morning window, Gate2's midday window and
// Gate3's narrow afternoon window — in that order — before any entry is even
// considered. Once a trade is open, the Exit Engine re-evaluates repeatedly
// through the rest of that day (and subsequent days, if still open) at
// COG_EXIT_SCORE's configured cadence, rather than once per daily bar.
//
// cogBacktestEngine.js (the daily engine) is left completely untouched and
// still backs the existing daily Backtest Lab path — this is a new sibling
// engine, not a replacement, so neither can break the other.
//
// Gate1A/Gate2/Gate3 are still fundamentally DAILY-resolution signals in
// this system (macro prints, vol percentiles, cross-asset daily closes —
// see cogConfig.js header): this engine computes each ONCE per calendar day
// and treats that value as frozen across the day's intraday bars, then
// checks/logs it within its assigned window — it does not invent intraday
// updates those gates' own underlying data doesn't support. Gate1B is the
// one gate that genuinely updates intraday, computed every bar.
//
// Gate1A+Gate1B combined hard veto: reuses cogExecutionEngine.js's existing
// decideAction() completely unchanged, by building a single pseudo-gate1
// object whose `state` is BULLISH only when BOTH Gate1A's daily regime AND
// Gate1B's window-end flow reading agree BULLISH (symmetric for BEARISH) —
// any disagreement, or either side INVALID, falls through to decideAction's
// existing NEUTRAL/INVALID veto paths with no veto logic duplicated here.
//
// Event timeline: every window check, decision and exit re-evaluation is
// appended to `events[]` as a flat, human-readable audit trail — Backtest
// Lab can render this directly as a per-day log (no black boxes).
//
// One trade open at a time, same as cogBacktestEngine.js: if a trade is
// already open when a new trading day begins, that day's gate windows are
// still evaluated and logged for transparency, but the entry decision step
// is skipped — this system flattens before considering a new signal.

import { computeLiquidityGate1A } from './cogLiquidityGate.js';
import { computeLiquidityGate1B } from './cogLiquidityGate1B.js';
import { computeRiskGate } from './cogRiskGate.js';
import { computeDirectionGate } from './cogDirectionGate.js';
import { decideAction, buildEntryPlan } from './cogExecutionEngine.js';
import { computeExitScore } from './cogExitEngine.js';
import { openTradeRecord, closeTradeRecord, recordReduceEvent, resetTradeIdCounter } from './cogTradeJournal.js';
import { buildTradingDays } from './cogTradingDay.js';
import { COG_EXIT_SCORE, COG_EXECUTION, COG_INTRADAY_SCHEDULE } from './cogConfig.js';

const REDUCE_SIZE_FRACTION = 0.5;

function toSeriesById(seriesMap) {
  const out = {};
  for (const key of Object.keys(seriesMap)) out[key] = seriesMap[key].map(p => p.value);
  return out;
}

// Merges Gate1A's daily regime and Gate1B's window-end flow reading into the
// single { dataValid, state, score } shape decideAction() already expects
// for "gate1" — BULLISH/BEARISH require BOTH sublayers to agree, anything
// else (disagreement, either INVALID) reads as NEUTRAL/INVALID, which
// decideAction already treats as a veto. `score` stays Gate1A's own
// RegimeScore (Gate1B's FlowScore lives on a different [-100,100] scale and
// is reported alongside, not blended into a single number).
function combinedGate1(gate1A, gate1B) {
  const dataValid = gate1A.dataValid && gate1B.dataValid;
  let state = 'NEUTRAL';
  if (gate1A.state === 'BULLISH' && gate1B.state === 'BULLISH') state = 'BULLISH';
  else if (gate1A.state === 'BEARISH' && gate1B.state === 'BEARISH') state = 'BEARISH';
  if (!dataValid) state = 'INVALID';
  return { dataValid, state, score: gate1A.score, reasons: [...(gate1A.reasons || []), ...(gate1B.reasons || [])], gate1A, gate1B };
}

const INVALID_GATE1B = { dataValid: false, state: 'INVALID', valid: false, score: null, coverage: 0, contributions: [], reasons: [] };

// `dataset` = generateSyntheticIntradayCogDataset's shape (or any real
// intraday loader matching it): { dates, minuteOfDay, ohlc, liquiditySeries,
// riskSeries, directionSeries, gate1bSeries } — every array sharing the same
// intraday bar axis. `options` forwards to entry-plan pricing exactly like
// cogBacktestEngine.js's runBacktest (accountEquity/instrumentKey/
// stopModelId/requestedTier).
export function runEventBacktest(dataset, options = {}) {
  resetTradeIdCounter();
  const { dates, minuteOfDay, ohlc: ohlcBars, gate1bSeries, daily } = dataset;
  const n = dates.length;
  const ohlc = {
    open: ohlcBars.map(b => b.open),
    high: ohlcBars.map(b => b.high),
    low: ohlcBars.map(b => b.low),
    close: ohlcBars.map(b => b.close),
  };
  const { accountEquity = 100000, instrumentKey = 'primary', stopModelId = COG_EXECUTION.defaultStopModel, requestedTier = COG_EXECUTION.defaultTier } = options;
  const instrument = COG_EXECUTION.instruments[instrumentKey];

  // Gate1A/Gate2/Gate3 computed on the TRUE daily axis (one entry per
  // calendar day, `daily.dates.length` long) — never re-expanded onto the
  // intraday bar axis above. Their rolling-window config (e.g. a 252-day
  // percentile lookback, GARCH's expanding-window refit) is defined in
  // TRADING DAYS; feeding them an intraday-bar array would silently corrupt
  // those window lengths and blow up GARCH's refit cost (see cogDataSources.js).
  // Indexed below by trading-day ordinal position, not by intraday bar index.
  const numDays = daily.dates.length;
  const dailyOhlc = {
    open: daily.ohlc.map(b => b.open),
    high: daily.ohlc.map(b => b.high),
    low: daily.ohlc.map(b => b.low),
    close: daily.ohlc.map(b => b.close),
  };
  const gate1ASeries = computeLiquidityGate1A(toSeriesById(daily.liquiditySeries), numDays);
  const gate2Series = computeRiskGate(toSeriesById(daily.riskSeries), dailyOhlc, dailyOhlc.close, numDays);
  const gate3Series = computeDirectionGate(toSeriesById(daily.directionSeries), numDays);
  // Gate1B IS genuinely intraday-resolution by design — computed every bar.
  const gate1BSeries = computeLiquidityGate1B(toSeriesById(gate1bSeries), n);

  const tradingDays = buildTradingDays(dates, minuteOfDay);
  const cadenceBars = Math.max(1, Math.round(COG_EXIT_SCORE.defaultReevaluateMinutes / COG_INTRADAY_SCHEDULE.barIntervalMinutes));

  const events = [];
  const logEvent = (day, window, summary, detail = {}) => { events.push({ date: day.date, window, summary, ...detail }); };

  const trades = [];
  const equityCurve = new Array(n);
  let equity = 1;
  let openTrade = null;
  let openSizeFraction = 1;

  // `dayIdx` is this trading day's ordinal position — `tradingDays` is built
  // from the same per-day iteration order as `daily.dates`, so dayIdx is
  // exactly the right index into the day-resolution gate1ASeries/gate2Series/
  // gate3Series arrays above (NOT an intraday bar index — Gate1A/2/3 are
  // frozen for the whole day, so there is no "which bar within the day"
  // question for them the way there is for Gate1B).
  for (let dayIdx = 0; dayIdx < tradingDays.length; dayIdx++) {
    const day = tradingDays[dayIdx];
    if (!day.bars.length) continue;

    // ── Morning: Gate1B flow-threshold window — check/log the reading at
    // the END of the window (the latest, most-informed read available
    // before Gate2's window opens). ──────────────────────────────────────
    const gate1BAtWindowEnd = day.gate1bBars.length ? gate1BSeries[day.gate1bBars[day.gate1bBars.length - 1]] : INVALID_GATE1B;
    logEvent(day, 'GATE1B_WINDOW', `Gate1B ${gate1BAtWindowEnd.state}${gate1BAtWindowEnd.score != null ? ` (FlowScore ${gate1BAtWindowEnd.score.toFixed(1)})` : ''}`, { gate1B: gate1BAtWindowEnd });

    // ── Midday: Gate 2 risk-engine check window — Gate2 is daily-resolution
    // (see header); this just checks/logs that day's already-computed value. ──
    const gate2AtWindow = gate2Series[dayIdx];
    logEvent(day, 'GATE2_WINDOW', `Gate2 ${gate2AtWindow.valid ? 'VALID' : 'NOT VALID'}${gate2AtWindow.score != null ? ` (score ${gate2AtWindow.score.toFixed(1)})` : ''}`, { gate2: gate2AtWindow });

    // ── Afternoon: Gate 3 direction-confirmation window — also daily-
    // resolution, checked/logged once per day. ───────────────────────────
    const gate3AtWindow = gate3Series[dayIdx];
    logEvent(day, 'GATE3_WINDOW', `Gate3 ${gate3AtWindow.state}${gate3AtWindow.score != null ? ` (score ${gate3AtWindow.score.toFixed(1)})` : ''}`, { gate3: gate3AtWindow });

    const gate1AAtWindow = gate1ASeries[dayIdx];
    const merged1 = combinedGate1(gate1AAtWindow, gate1BAtWindowEnd);

    // ── Decision: combine Gate1A+Gate1B veto with Gate2/Gate3 (skipped if
    // a trade from a prior cycle is still open — flatten before re-entry). ──
    let pendingEntry = null;
    if (openTrade) {
      logEvent(day, 'DECISION', 'Skipped — trade already open (flattens before considering a new signal)');
    } else {
      const { action, reasons } = decideAction(merged1, gate2AtWindow, gate3AtWindow);
      logEvent(day, 'DECISION', `Action: ${action}`, { reasons });
      if (action !== 'NO_TRADE') {
        if (day.entryBar == null) {
          logEvent(day, 'ENTRY', 'No entry: no intraday bar remains after Gate3 window closes (series end)');
        } else {
          const fillOpen = ohlc.open[day.entryBar];
          const plan = buildEntryPlan({ action, gate2Entry: gate2AtWindow, fillOpen, instrument, stopModelId, requestedTier, accountEquity });
          if (plan.error) logEvent(day, 'ENTRY', `No entry: ${plan.error}`);
          else pendingEntry = { action, plan, gate1Entry: merged1, gate2Entry: gate2AtWindow, gate3Entry: gate3AtWindow };
        }
      }
    }

    // ── Single bar walk: opens the pending entry at day.entryBar, and on
    // every bar at/after an open trade's entry, checks for a stop hit (every
    // bar — a resting stop can trigger anytime) and re-evaluates the Exit
    // Engine's ContinuationScore at the configured cadence (every
    // `cadenceBars` bars, mirroring live's 5/15/30-min re-evaluation). ─────
    for (const i of day.bars) {
      if (openTrade && i > openTrade.entryIndex) {
        // Gate1A/2/3 snapshots are looked up by DAY index (entryDayIdx /
        // dayIdx), never by the intraday bar index `i` — those gates are
        // frozen per-day. Gate1B alone is genuinely intraday, so it stays
        // indexed by bar (entryIndex / i).
        const exitResult = ((i - openTrade.entryIndex) % cadenceBars === 0)
          ? computeExitScore(
              { gate1: gate1ASeries[openTrade.entryDayIdx], gate1B: gate1BSeries[openTrade.entryIndex], gate2: gate2Series[openTrade.entryDayIdx], gate3: gate3Series[openTrade.entryDayIdx] },
              { gate1: gate1ASeries[dayIdx], gate1B: gate1BSeries[i], gate2: gate2Series[dayIdx], gate3: gate3Series[dayIdx] },
              openTrade.direction
            )
          : null;
        if (exitResult) logEvent(day, 'EXIT_REEVALUATION', `Trade #${openTrade.id} ContinuationScore ${exitResult.score != null ? exitResult.score.toFixed(1) : 'n/a'} -> ${exitResult.action}`, { tradeId: openTrade.id, exitResult });

        const stopHit = openTrade.direction === 'LONG'
          ? ohlc.low[i] <= openTrade.stopStandardPrice
          : ohlc.high[i] >= openTrade.stopStandardPrice;

        let closeReason = null, closePrice = null;
        if (stopHit) {
          closeReason = 'STOP_HIT';
          closePrice = openTrade.stopStandardPrice;
        } else if (exitResult?.action === 'CLOSE') {
          closeReason = 'EXIT_ENGINE_CLOSE';
          closePrice = ohlc.close[i];
        } else if (exitResult?.action === 'REDUCE' && openSizeFraction > REDUCE_SIZE_FRACTION) {
          recordReduceEvent(openTrade, { index: i, date: dates[i], exitScoreResult: exitResult });
          openSizeFraction = REDUCE_SIZE_FRACTION;
        }

        if (closeReason) {
          closeTradeRecord(openTrade, { exitIndex: i, exitDate: dates[i], exitPrice: closePrice, reason: closeReason, exitScoreResult: exitResult });
          openTrade.sizeFractionAtClose = openSizeFraction;
          openTrade.pnlDollars *= openSizeFraction;
          openTrade.pnlR *= openSizeFraction;
          equity += openTrade.pnlDollars / accountEquity;
          logEvent(day, 'EXIT', `Closed trade #${openTrade.id}: ${closeReason} (${openTrade.pnlR != null ? openTrade.pnlR.toFixed(2) : 'n/a'}R)`, { tradeId: openTrade.id });
          trades.push(openTrade);
          openTrade = null;
        }
      }

      if (!openTrade && pendingEntry && i === day.entryBar) {
        openTrade = openTradeRecord({
          entryIndex: i, entryDayIdx: dayIdx, entryDate: dates[i], action: pendingEntry.action, entryPlan: pendingEntry.plan, accountEquity,
          gate1Entry: pendingEntry.gate1Entry, gate2Entry: pendingEntry.gate2Entry, gate3Entry: pendingEntry.gate3Entry,
        });
        openSizeFraction = 1;
        logEvent(day, 'ENTRY', `Opened ${pendingEntry.action} trade #${openTrade.id} @ ${pendingEntry.plan.entryPrice.toFixed(2)}`, { tradeId: openTrade.id });
        pendingEntry = null;
      }

      equityCurve[i] = equity;
    }
  }

  if (openTrade) {
    const lastIndex = n - 1;
    closeTradeRecord(openTrade, { exitIndex: lastIndex, exitDate: dates[lastIndex], exitPrice: ohlc.close[lastIndex], reason: 'END_OF_HISTORY_OPEN', exitScoreResult: null });
    openTrade.sizeFractionAtClose = openSizeFraction;
    openTrade.pnlDollars *= openSizeFraction;
    openTrade.pnlR *= openSizeFraction;
    trades.push(openTrade);
  }

  const equityCurveDollars = equityCurve.map(e => e * accountEquity);
  return {
    dates, minuteOfDay, equityCurve, equityCurveDollars, trades, accountEquity, events,
    gate1A: gate1ASeries, gate1B: gate1BSeries, gate2: gate2Series, gate3: gate3Series,
    tradingDays,
  };
}
