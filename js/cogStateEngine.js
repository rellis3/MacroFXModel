// js/cogStateEngine.js — V2: persistent asynchronous state machine.
//
// V1's cogEventBacktestEngine.js is a WINDOW-DRIVEN engine: Threshold1
// window -> Gate2 window -> Gate3 window -> one decision per day at a fixed
// entryBar. Real COG behavior (per direct observation) is a PERSISTENT
// ASYNCHRONOUS STATE MACHINE — gate validation timings vary day to day (Gate
// 1 can validate at 23:30 the previous night OR 11:30am), entry is not a
// fixed candle, and if no entry has happened ~5 minutes after the NY
// cash-equity open the setup is usually dead for the day. This file is that
// state machine: every gate's underlying math is reused UNCHANGED
// (Threshold1/Gate2/Gate3 imported directly from their V1 files, never
// copied — see cogV2Config.js header) but wrapped in a continuous per-bar
// evaluator that PERSISTS a VALID state until explicitly invalidated,
// instead of snapshotting once at a window's end.
//
// Gate mapping (full rationale in cogV2Config.js):
//   Setup  = computeThreshold1() (already per-bar in V1) + a deadline
//            override: once NY-open+5min passes with no open trade/pending
//            entry that day, the Setup Gate is forced INVALID for the rest
//            of the calendar day, regardless of what the underlying math
//            says — modeling the observed "dead for the day" behavior.
//   Risk   = computeRiskGate(), frozen per calendar day (genuinely
//            daily-resolution inputs) but visible/tracked from the start of
//            the trading day rather than gated to V1's midday window.
//   Trigger = NEW — cogExecutionTrigger.js's NQ impulse score combined with
//            Gate3's frozen daily direction, armed only inside
//            COG_V2_TRIGGER_WINDOW.
// Entry: setupGate.valid && riskGate.valid && triggerGate.armed && their
// directions agree && no trade/pending entry already in flight. Fill
// follows the same next-bar-open discipline as every other gate in this
// system (COG_EXECUTION.fillRule) — the signal bar's snapshot prices the
// trade, but the open trade record itself is created one bar later, when
// that priced fill is actually known to have happened.
//
// Deliberately NOT done: an "already entered today" cap. The deadline
// override is what naturally prevents re-entry after the cutoff; capping
// entries to one per calendar day on top of that would be an invented
// restriction with no basis in the gates' own logic, and would also block
// the legitimate case of a trade opened, closed, and a fresh signal arming
// again before the deadline.
//
// Disclosed limitations (not faked):
//   - The synthetic backtest dataset's intraday bars only span
//     COG_INTRADAY_SCHEDULE's session window (08:00-16:00 UK) — a Setup Gate
//     validation at 23:30 the previous night (the architecture fully
//     supports persisting validity across the overnight gap) cannot
//     literally be reproduced against this dataset; it can only be observed
//     once a real round-the-clock intraday feed is wired in.
//   - The Risk Gate's "continuous" tracking is "always visible from day
//     start", not genuine intraday churn — its own inputs (vol percentiles,
//     cross-asset daily closes) are daily-resolution in this system, same
//     disclosed gap as cogRiskGate.js's own header.

import { computeThreshold1 } from './cogThreshold1Gate.js';
import { computeRiskGate } from './cogRiskGate.js';
import { computeDirectionGate } from './cogDirectionGate.js';
import { computeTriggerGate } from './cogExecutionTrigger.js';
import { buildEntryPlan, selectTier } from './cogExecutionEngine.js';
import { computeExitScore } from './cogExitEngine.js';
import { openTradeRecord, closeTradeRecord, recordReduceEvent, markEndOfHistoryOpen, resetTradeIdCounter } from './cogTradeJournal.js';
import { buildTradingDays } from './cogTradingDay.js';
import { createGateState, updateGateState } from './cogStateStore.js';
import { factorReasonsFromContributions, factorReasonsFromBreakdown, describeContributionTransition, describeBreakdownTransition, fmtTime } from './cogExplainability.js';
import { COG_EXECUTION, COG_RISK_TIERS, COG_EXIT_SCORE, COG_INTRADAY_SCHEDULE } from './cogConfig.js';
import { COG_V2_ENTRY_DEADLINE_MINUTE } from './cogV2Config.js';

// Same constant cogEventBacktestEngine.js uses — it is a private local
// there (not exported), so redefined here rather than reaching into a V1
// file's internals.
const REDUCE_SIZE_FRACTION = 0.5;

// Private local in cogEventBacktestEngine.js too — pure {date,value}[] ->
// {id: value[]} plumbing, not gate logic, so reimplementing it here doesn't
// touch any of the "never copy V1 math" discipline this rebuild follows.
function toSeriesById(seriesMap) {
  const out = {};
  for (const key of Object.keys(seriesMap)) out[key] = seriesMap[key].map(p => p.value);
  return out;
}

// Threshold1's BULLISH/BEARISH vocabulary -> the LONG/SHORT vocabulary the
// Trigger Gate and entry logic use.
function setupDirection(state) {
  if (state === 'BULLISH') return 'LONG';
  if (state === 'BEARISH') return 'SHORT';
  return null;
}

// `dataset` = generateSyntheticIntradayCogDataset's shape (same shape
// cogEventBacktestEngine.js consumes, with the addition of `ohlc[].volume`
// for the Trigger Gate). `options` forwards to entry-plan pricing exactly
// like runEventBacktest.
export function runV2Backtest(dataset, options = {}) {
  resetTradeIdCounter();
  const { dates, minuteOfDay, ohlc: ohlcBars, gate1bSeries, daily } = dataset;
  const n = dates.length;
  const ohlc = {
    open: ohlcBars.map(b => b.open),
    high: ohlcBars.map(b => b.high),
    low: ohlcBars.map(b => b.low),
    close: ohlcBars.map(b => b.close),
    volume: ohlcBars.map(b => b.volume),
  };
  const { accountEquity = 100000, instrumentKey = 'primary', stopModelId = COG_EXECUTION.defaultStopModel, requestedTier = COG_EXECUTION.defaultTier } = options;
  const instrument = COG_EXECUTION.instruments[instrumentKey];

  // Gate2/Gate3 stay on the TRUE daily axis — same no-corruption-of-rolling-
  // windows rationale as cogEventBacktestEngine.js's own header.
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
  const dayIndexForBar = new Array(n);
  for (let dayIdx = 0; dayIdx < tradingDays.length; dayIdx++) {
    for (const i of tradingDays[dayIdx].bars) dayIndexForBar[i] = dayIdx;
  }
  const threshold1Series = computeThreshold1(toSeriesById(daily.liquiditySeries), toSeriesById(gate1bSeries), numDays, n, dayIndexForBar);
  const triggerSeries = computeTriggerGate({ ohlc, n, minuteOfDay, tradingDays, dayIndexForBar, gate3Series });

  const cadenceBars = Math.max(1, Math.round(COG_EXIT_SCORE.defaultReevaluateMinutes / COG_INTRADAY_SCHEDULE.barIntervalMinutes));

  const journal = [];
  const logJournal = (i, type, message, detail = {}) => {
    journal.push({ index: i, date: dates[i], minuteOfDay: minuteOfDay[i], time: fmtTime(minuteOfDay[i]), type, message, ...detail });
  };

  const setupState = createGateState('setup');
  const riskState = createGateState('risk');
  const triggerState = createGateState('trigger');

  const setupSnapshots = new Array(n);
  const riskSnapshots = new Array(n);
  const triggerSnapshots = new Array(n);

  const trades = [];
  const equityCurve = new Array(n);
  let equity = 1;
  let openTrade = null;
  let openSizeFraction = 1;
  let pendingEntry = null;
  let currentDayIdx = -1;
  let deadlinePassedToday = false;

  for (let i = 0; i < n; i++) {
    const dayIdx = dayIndexForBar[i];
    const bar = { index: i, date: dates[i], minuteOfDay: minuteOfDay[i] };

    if (dayIdx !== currentDayIdx) {
      currentDayIdx = dayIdx;
      deadlinePassedToday = false;
    }

    // ── Setup Gate ──────────────────────────────────────────────────────
    const t1 = threshold1Series[i];
    if (!openTrade && !pendingEntry && !deadlinePassedToday && minuteOfDay[i] > COG_V2_ENTRY_DEADLINE_MINUTE) {
      deadlinePassedToday = true;
    }
    const setupEval = (deadlinePassedToday && t1.state !== 'INVALID')
      ? { ...t1, state: 'INVALID', overridden: true, overrideReason: 'Time invalidation: no entry within 5 min of NY open' }
      : t1;

    const setupTransition = updateGateState(setupState, setupEval, bar, {
      isValidFn: e => e.dataValid && e.state !== 'INVALID',
      labelFn: e => e.dataValid ? e.state : 'INVALID',
      reasonFn: (next, prev) => next.overridden ? next.overrideReason : describeContributionTransition(prev, next),
    });
    if (setupTransition.transitioned) {
      const { to, reason } = setupTransition.transition;
      logJournal(i, 'SETUP', `Setup Gate ${to}${reason ? ` — ${reason}` : ''}`, { transition: setupTransition.transition });
    }

    const setupDir = setupDirection(setupEval.state);
    setupSnapshots[i] = {
      valid: setupEval.dataValid && setupEval.state !== 'INVALID',
      direction: setupDir,
      score: setupEval.score,
      validSince: setupState.validSince,
      confidence: Math.round((setupEval.coverage || 0) * 100),
      reasons: factorReasonsFromContributions(setupEval.contributions, setupEval.reasons),
    };

    // ── Risk Gate ───────────────────────────────────────────────────────
    const g2 = gate2Series[dayIdx];
    const riskTransition = updateGateState(riskState, g2, bar, {
      isValidFn: e => e.valid,
      labelFn: e => e.valid ? 'VALID' : 'INVALID',
      reasonFn: describeBreakdownTransition,
    });
    if (riskTransition.transitioned) {
      const { to, reason } = riskTransition.transition;
      logJournal(i, 'RISK', `Risk Gate ${to}${reason ? ` — ${reason}` : ''}`, { transition: riskTransition.transition });
    }

    const eligibleTier = selectTier(g2.eligibleTiers, requestedTier);
    const stopModel = g2.stopModels?.[stopModelId];
    const liveClose = ohlc.close[i];
    const stopPct = (stopModel && Number.isFinite(stopModel.standard) && eligibleTier && liveClose > 0)
      ? (stopModel.standard / liveClose) * 100
      : null;
    const riskPctVal = eligibleTier ? COG_RISK_TIERS[eligibleTier].riskPct * COG_EXECUTION.baseRiskPctOfEquity * 100 : null;
    riskSnapshots[i] = {
      valid: g2.valid,
      stopPct,
      riskPct: riskPctVal,
      tier: eligibleTier,
      score: g2.score,
      validSince: riskState.validSince,
      reasons: factorReasonsFromBreakdown(g2.breakdown),
    };

    // ── Trigger Gate ────────────────────────────────────────────────────
    const trig = triggerSeries[i];
    const triggerTransition = updateGateState(triggerState, trig, bar, {
      isValidFn: e => e.armed,
      labelFn: e => e.armed ? `ARMED_${e.direction}` : 'NOT_ARMED',
      reasonFn: describeBreakdownTransition,
    });
    if (triggerTransition.transitioned && trig.armed) {
      logJournal(i, 'TRIGGER', `Trigger ARMED ${trig.direction}`, { transition: triggerTransition.transition });
    }

    triggerSnapshots[i] = {
      armed: trig.armed,
      direction: (trig.direction === 'LONG' || trig.direction === 'SHORT') ? trig.direction : null,
      impulseScore: trig.impulseScore,
      validSince: triggerState.validSince,
      reasons: factorReasonsFromBreakdown(trig.breakdown, { worstFirst: false }),
    };

    // ── Entry: Setup ∩ Risk ∩ Trigger, direction-agreeing, one at a time ──
    if (!openTrade && !pendingEntry) {
      const setupSnap = setupSnapshots[i], riskSnap = riskSnapshots[i], trigSnap = triggerSnapshots[i];
      const directionsAgree = setupSnap.valid && trigSnap.armed && setupSnap.direction === trigSnap.direction;
      if (directionsAgree && riskSnap.valid) {
        const action = trigSnap.direction;
        if (i + 1 >= n) {
          logJournal(i, 'ENTRY', 'No entry: no next bar available for fill (series end)');
        } else {
          const fillOpen = ohlc.open[i + 1];
          const plan = buildEntryPlan({ action, gate2Entry: g2, fillOpen, instrument, stopModelId, requestedTier, accountEquity });
          if (plan.error) {
            logJournal(i, 'ENTRY', `No entry: ${plan.error}`);
          } else {
            pendingEntry = { action, plan, gate1Entry: setupEval, gate2Entry: g2, gate3Entry: gate3Series[dayIdx], entryDayIdx: dayIdx };
          }
        }
      }
    } else if (!openTrade && pendingEntry) {
      // One bar after the signal — `pendingEntry.plan` was already priced
      // off THIS bar's open (passed as fillOpen when the plan was built),
      // so opening here, not at the signal bar, is what makes the fill
      // genuinely next-bar-open rather than lookahead.
      openTrade = openTradeRecord({
        entryIndex: i, entryDayIdx: pendingEntry.entryDayIdx, entryDate: dates[i],
        action: pendingEntry.action, entryPlan: pendingEntry.plan, accountEquity,
        gate1Entry: pendingEntry.gate1Entry, gate2Entry: pendingEntry.gate2Entry, gate3Entry: pendingEntry.gate3Entry,
      });
      openSizeFraction = 1;
      logJournal(i, 'ENTRY', `ORDER FILLED ${pendingEntry.action} trade #${openTrade.id} @ ${pendingEntry.plan.entryPrice.toFixed(2)}`, { tradeId: openTrade.id });
      pendingEntry = null;
    }

    // ── Exit: stop hit checked every bar; ContinuationScore re-evaluated
    // at COG_EXIT_SCORE's configured cadence — same two-speed discipline as
    // cogEventBacktestEngine.js. Threshold1 stays indexed by BAR (genuinely
    // intraday), Gate2/Gate3 stay indexed by DAY (frozen), passed as both
    // gate1 and gate1B so alignExitFeatures' vix/vvix lookup resolves the
    // same way it does for the event-driven engine. ─────────────────────
    if (openTrade && i > openTrade.entryIndex) {
      const exitResult = ((i - openTrade.entryIndex) % cadenceBars === 0)
        ? computeExitScore(
            { gate1: threshold1Series[openTrade.entryIndex], gate1B: threshold1Series[openTrade.entryIndex], gate2: gate2Series[openTrade.entryDayIdx], gate3: gate3Series[openTrade.entryDayIdx] },
            { gate1: threshold1Series[i], gate1B: threshold1Series[i], gate2: gate2Series[dayIdx], gate3: gate3Series[dayIdx] },
            openTrade.direction
          )
        : null;

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
        logJournal(i, 'REDUCE', `Trade #${openTrade.id} reduced to ${(REDUCE_SIZE_FRACTION * 100).toFixed(0)}% size`, { tradeId: openTrade.id });
      }

      if (closeReason) {
        closeTradeRecord(openTrade, { exitIndex: i, exitDate: dates[i], exitPrice: closePrice, reason: closeReason, exitScoreResult: exitResult });
        openTrade.sizeFractionAtClose = openSizeFraction;
        openTrade.pnlDollars *= openSizeFraction;
        openTrade.pnlR *= openSizeFraction;
        equity += openTrade.pnlDollars / accountEquity;
        logJournal(i, 'CLOSE', `CLOSE ${closeReason} ${openTrade.pnlR >= 0 ? '+' : ''}${openTrade.pnlR.toFixed(2)}R`, { tradeId: openTrade.id });
        trades.push(openTrade);
        openTrade = null;
      }
    }

    equityCurve[i] = equity;
  }

  if (openTrade) {
    const lastIndex = n - 1;
    markEndOfHistoryOpen(openTrade, { lastIndex, lastDate: dates[lastIndex], lastPrice: ohlc.close[lastIndex] });
    openTrade.sizeFractionAtClose = openSizeFraction;
    openTrade.pnlDollars *= openSizeFraction;
    openTrade.pnlR *= openSizeFraction;
    trades.push(openTrade);
  }

  const equityCurveDollars = equityCurve.map(e => e * accountEquity);
  return {
    dates, minuteOfDay, equityCurve, equityCurveDollars, trades, accountEquity, journal,
    setupSnapshots, riskSnapshots, triggerSnapshots,
    setupState, riskState, triggerState,
    tradingDays,
    // Exposed so callers (server.js's live route) can recompute a fresh exit
    // score for a currently-open trade on demand, the same gate1/gate1B/gate2/
    // gate3 call shape used by this loop's own cadence-gated re-evaluation.
    threshold1Series, gate2Series, gate3Series, dayIndexForBar,
  };
}
