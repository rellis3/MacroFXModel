// js/cogEventBacktestEngine.js — event-driven INTRADAY backtest engine.
//
// Replaces cogBacktestEngine.js's one-evaluation-per-daily-bar loop with the
// actual observed COG workflow: a single decision cycle per trading day,
// sequenced through Threshold 1's morning window, Gate2's midday window and
// Gate3's narrow afternoon window — in that order — before any entry is even
// considered. Once a trade is open, the Exit Engine re-evaluates repeatedly
// through the rest of that day (and subsequent days, if still open) at
// COG_EXIT_SCORE's configured cadence, rather than once per daily bar.
//
// cogBacktestEngine.js (the daily engine) is left completely untouched and
// still backs the existing daily Backtest Lab path — this is a new sibling
// engine, not a replacement, so neither can break the other.
//
// Gate2/Gate3 are still fundamentally DAILY-resolution signals in this
// system (vol percentiles, cross-asset daily closes — see cogConfig.js
// header): this engine computes each ONCE per calendar day and treats that
// value as frozen across the day's intraday bars, then checks/logs it
// within its assigned window — it does not invent intraday updates those
// gates' own underlying data doesn't support.
//
// Threshold 1 (cogThreshold1Gate.js) replaces the old Gate1A+Gate1B hard
// conjunction (combinedGate1 required BOTH sublayers to independently agree
// BULLISH/BEARISH before Gate2/Gate3 were even consulted — a 4-way
// conjunction that produced zero trades over a 2-year synthetic backtest).
// It is a single blended score combining the same slow daily macro panel
// (frozen per day, like Gate1A) with the same fast intraday flow panel
// (genuinely updates every bar, like Gate1B) — see that file's header for
// the full rationale. Its output already satisfies decideAction()'s gate1
// contract directly, so no merge step is needed here anymore.
//
// Event timeline: every window check, decision and exit re-evaluation is
// appended to `events[]` as a flat, human-readable audit trail — Backtest
// Lab can render this directly as a per-day log (no black boxes).
//
// One trade open at a time, same as cogBacktestEngine.js: if a trade is
// already open when a new trading day begins, that day's gate windows are
// still evaluated and logged for transparency, but the entry decision step
// is skipped — this system flattens before considering a new signal.

import { computeThreshold1 } from './cogThreshold1Gate.js';
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

const INVALID_THRESHOLD1 = { dataValid: false, state: 'INVALID', score: null, coverage: 0, contributions: [], reasons: [] };

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

  // Gate2/Gate3 computed on the TRUE daily axis (one entry per calendar day,
  // `daily.dates.length` long) — never re-expanded onto the intraday bar
  // axis above. Their rolling-window config (e.g. a 252-day percentile
  // lookback, GARCH's expanding-window refit) is defined in TRADING DAYS;
  // feeding them an intraday-bar array would silently corrupt those window
  // lengths and blow up GARCH's refit cost (see cogDataSources.js). Indexed
  // below by trading-day ordinal position, not by intraday bar index.
  const numDays = daily.dates.length;
  const dailyOhlc = {
    open: daily.ohlc.map(b => b.open),
    high: daily.ohlc.map(b => b.high),
    low: daily.ohlc.map(b => b.low),
    close: daily.ohlc.map(b => b.close),
  };
  const gate2Series = computeRiskGate(toSeriesById(daily.riskSeries), dailyOhlc, dailyOhlc.close, numDays);
  const gate3Series = computeDirectionGate(toSeriesById(daily.directionSeries), numDays);

  const tradingDays = buildTradingDays(dates, minuteOfDay);
  // Maps each intraday bar to its calendar day's ordinal position — lets
  // Threshold 1's slow leg freeze at that day's value for every bar within
  // it while the fast leg still updates every bar (see cogThreshold1Gate.js).
  const dayIndexForBar = new Array(n);
  for (let dayIdx = 0; dayIdx < tradingDays.length; dayIdx++) {
    for (const i of tradingDays[dayIdx].bars) dayIndexForBar[i] = dayIdx;
  }
  const threshold1Series = computeThreshold1(toSeriesById(daily.liquiditySeries), toSeriesById(gate1bSeries), numDays, n, dayIndexForBar);

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
  // exactly the right index into the day-resolution gate2Series/gate3Series
  // arrays above (NOT an intraday bar index — Gate2/3 are frozen for the
  // whole day, so there is no "which bar within the day" question for them
  // the way there is for Threshold 1's fast leg).
  for (let dayIdx = 0; dayIdx < tradingDays.length; dayIdx++) {
    const day = tradingDays[dayIdx];
    if (!day.bars.length) continue;

    // ── Morning: Threshold 1 window — check/log the reading at the END of
    // the window (the latest, most-informed read available before Gate2's
    // window opens). ──────────────────────────────────────────────────────
    const threshold1AtWindowEnd = day.gate1bBars.length ? threshold1Series[day.gate1bBars[day.gate1bBars.length - 1]] : INVALID_THRESHOLD1;
    logEvent(day, 'THRESHOLD1_WINDOW', `Threshold 1 ${threshold1AtWindowEnd.state}${threshold1AtWindowEnd.score != null ? ` (score ${threshold1AtWindowEnd.score.toFixed(1)})` : ''}`, { threshold1: threshold1AtWindowEnd });

    // ── Midday: Gate 2 risk-engine check window — Gate2 is daily-resolution
    // (see header); this just checks/logs that day's already-computed value. ──
    const gate2AtWindow = gate2Series[dayIdx];
    logEvent(day, 'GATE2_WINDOW', `Gate2 ${gate2AtWindow.valid ? 'VALID' : 'NOT VALID'}${gate2AtWindow.score != null ? ` (score ${gate2AtWindow.score.toFixed(1)})` : ''}`, { gate2: gate2AtWindow });

    // ── Afternoon: Gate 3 direction-confirmation window — also daily-
    // resolution, checked/logged once per day. ───────────────────────────
    const gate3AtWindow = gate3Series[dayIdx];
    logEvent(day, 'GATE3_WINDOW', `Gate3 ${gate3AtWindow.state}${gate3AtWindow.score != null ? ` (score ${gate3AtWindow.score.toFixed(1)})` : ''}`, { gate3: gate3AtWindow });

    // ── Decision: Threshold 1's own { dataValid, state, score } shape
    // already satisfies decideAction()'s gate1 contract directly — no merge
    // step needed (skipped if a trade from a prior cycle is still open —
    // flatten before re-entry). ───────────────────────────────────────────
    let pendingEntry = null;
    if (openTrade) {
      logEvent(day, 'DECISION', 'Skipped — trade already open (flattens before considering a new signal)');
    } else {
      const { action, reasons } = decideAction(threshold1AtWindowEnd, gate2AtWindow, gate3AtWindow);
      logEvent(day, 'DECISION', `Action: ${action}`, { reasons });
      if (action !== 'NO_TRADE') {
        if (day.entryBar == null) {
          logEvent(day, 'ENTRY', 'No entry: no intraday bar remains after Gate3 window closes (series end)');
        } else {
          const fillOpen = ohlc.open[day.entryBar];
          const plan = buildEntryPlan({ action, gate2Entry: gate2AtWindow, fillOpen, instrument, stopModelId, requestedTier, accountEquity });
          if (plan.error) logEvent(day, 'ENTRY', `No entry: ${plan.error}`);
          else pendingEntry = { action, plan, gate1Entry: threshold1AtWindowEnd, gate2Entry: gate2AtWindow, gate3Entry: gate3AtWindow };
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
        // Gate2/3 snapshots are looked up by DAY index (entryDayIdx / dayIdx)
        // — those gates are frozen per-day. Threshold 1 is genuinely
        // intraday (its fast leg updates every bar), so it stays indexed by
        // bar (entryIndex / i) — passed as BOTH the gate1 and gate1B
        // snapshot fields so cogExitEngine.js's alignExitFeatures (which
        // still reads separate gate1/gate1B fields, e.g. preferring gate1B's
        // contributions for vix/vvix) resolves correctly unmodified.
        const exitResult = ((i - openTrade.entryIndex) % cadenceBars === 0)
          ? computeExitScore(
              { gate1: threshold1Series[openTrade.entryIndex], gate1B: threshold1Series[openTrade.entryIndex], gate2: gate2Series[openTrade.entryDayIdx], gate3: gate3Series[openTrade.entryDayIdx] },
              { gate1: threshold1Series[i], gate1B: threshold1Series[i], gate2: gate2Series[dayIdx], gate3: gate3Series[dayIdx] },
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
    threshold1: threshold1Series, gate2: gate2Series, gate3: gate3Series,
    tradingDays,
  };
}
