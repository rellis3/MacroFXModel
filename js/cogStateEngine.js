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
import { COG_V2_ENTRY_DEADLINE_MINUTE, COG_V2_NY_OPEN_MINUTE, COG_V2_SETUP_HYSTERESIS, COG_V2_SLOW_SMOOTH, COG_V2_CONFIDENCE, COG_V2_MIN_SETUP_PERSIST_BARS } from './cogV2Config.js';

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

// Rolling arithmetic mean over `window` bars — used to pre-smooth slow FRED
// series (walcl/rrp/tga/ecb/boj) so their weekly/monthly print cadence doesn't
// produce day-of-publication spikes in the ROC z-score sub-signals. Preserves
// array length: early bars (< window) average whatever is available.
function rollingMean(arr, window) {
  const out = new Array(arr.length);
  let sum = 0, count = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v != null && Number.isFinite(v)) { sum += v; count++; }
    if (i >= window) {
      const old = arr[i - window];
      if (old != null && Number.isFinite(old)) { sum -= old; count--; }
    }
    out[i] = count > 0 ? sum / count : null;
  }
  return out;
}

// Applies hysteresis to a raw Threshold1 score, returning the V2 gate state.
// `prevHysState` is the hysteresis state from the PREVIOUS bar (the V2 layer's
// own memory, not Threshold1's binary output). This prevents re-entry at the
// bare threshold: once BULLISH, we stay BULLISH until the score drops below the
// narrow stayThreshold — a much wider band than cogThreshold1Gate.js's own
// enter/stay conflation (it uses bullishThreshold=35 for both directions).
function applySetupHysteresis(score, prevHysState) {
  const { enterThreshold, stayThreshold } = COG_V2_SETUP_HYSTERESIS;
  if (score == null) return 'INVALID';
  if (score > enterThreshold) return 'BULLISH';
  if (score < -enterThreshold) return 'BEARISH';
  if (prevHysState === 'BULLISH' && score > stayThreshold) return 'BULLISH';
  if (prevHysState === 'BEARISH' && score < -stayThreshold) return 'BEARISH';
  return 'INVALID';
}

// Weighted confidence blend on a true 0–100 scale. All three inputs are
// normalized to [0, 100] before blending so the combined score is interpretable
// as "% of maximum possible signal strength" and the threshold has stable
// meaning regardless of changes to individual signal ranges:
//   setup_norm   = clamp((|score| - stayFloor) / (100 - stayFloor), 0, 1) × 100
//   risk_norm    = risk_score                    (already 0–100)
//   trigger_norm = trigger_impulse               (already 0–100)
// combined = 0 when all gates are at their minimum valid level
// combined = 100 when all gates are at absolute maximum
// Direction must still agree separately — the confidence only replaces the
// boolean strength test, not the directional requirement.
export function normalizeSetupConf(rawConf) {
  const { setupNormFloor, setupNormCeiling } = COG_V2_CONFIDENCE;
  return Math.max(0, Math.min(100, (rawConf - setupNormFloor) / (setupNormCeiling - setupNormFloor) * 100));
}

function combinedConfidence(setupConf, riskConf, triggerConf) {
  const { setupWeight, riskWeight, triggerWeight } = COG_V2_CONFIDENCE;
  return setupWeight * normalizeSetupConf(setupConf) + riskWeight * riskConf + triggerWeight * triggerConf;
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

  // Pre-smooth slow FRED series before passing to computeThreshold1 so that
  // weekly-updating series (WALCL, RRP) don't generate publication-day spikes
  // in the 1d/7d ROC z-score sub-signals. The IDs to smooth come from
  // COG_V2_SLOW_SMOOTH.ids; credit (daily, genuinely meaningful) is excluded.
  const rawSlowById = toSeriesById(daily.liquiditySeries);
  const slowSeriesById = { ...rawSlowById };
  for (const id of COG_V2_SLOW_SMOOTH.ids) {
    if (rawSlowById[id]) slowSeriesById[id] = rollingMean(rawSlowById[id], COG_V2_SLOW_SMOOTH.windowDays);
  }

  const threshold1Series = computeThreshold1(slowSeriesById, toSeriesById(gate1bSeries), numDays, n, dayIndexForBar);
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
  // V2 hysteresis state: the setup gate's own memory layer, separate from
  // Threshold1's bar-by-bar binary output (which uses its own 35/-35 thresholds
  // and has no persistence). Initialized to INVALID at run start.
  let prevHysState = 'INVALID';
  // Streak counter for COG_V2_MIN_SETUP_PERSIST_BARS (currently 0 = disabled).
  let setupValidStreakBars = 0;

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

    // Apply V2 hysteresis over Threshold1's raw output: the T1 score is the
    // continuous signal; applySetupHysteresis() decides the hysteresis state
    // using enter/stay thresholds wider than T1's own 35/-35 classification.
    const hysState = deadlinePassedToday ? 'INVALID' : applySetupHysteresis(t1.score, prevHysState);
    // Build the augmented evaluation object that downstream logic and the UI
    // consume. `state` is the HYSTERESIS state (not raw T1 state), `t1State`
    // preserves the raw T1 classification for diagnostics.
    const setupEval = {
      ...t1,
      state: hysState,
      t1State: t1.state,
      overridden: deadlinePassedToday && t1.state !== 'INVALID',
      overrideReason: deadlinePassedToday && t1.state !== 'INVALID'
        ? 'Time invalidation: no entry within 5 min of NY open'
        : null,
    };
    prevHysState = hysState;

    // Streak tracking for MIN_SETUP_PERSIST_BARS guard (disabled when 0).
    const setupIsValid = setupEval.dataValid && setupEval.state !== 'INVALID';
    setupValidStreakBars = setupIsValid ? setupValidStreakBars + 1 : 0;
    const persistOk = COG_V2_MIN_SETUP_PERSIST_BARS === 0 || setupValidStreakBars >= COG_V2_MIN_SETUP_PERSIST_BARS;

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
    // setup_conf is the absolute score (0–100): how far the score is from zero.
    // A score of ±100 = maximum conviction; ±45 (enter threshold) = entry-level.
    // This is the signal the confidence model's setupWeight multiplies.
    const setupConf = setupEval.score != null ? Math.abs(setupEval.score) : 0;
    setupSnapshots[i] = {
      valid: setupIsValid && persistOk,
      direction: setupDir,
      score: setupEval.score,
      t1State: setupEval.t1State,
      hysState,
      validSince: setupState.validSince,
      confidence: setupConf,
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
    // risk_conf: Risk Gate's own continuous 0–100 composite score (the same score
    // cogRiskGate.js's compositeRampScore() produced). Falls back to 0 when
    // the Risk Gate has no score (invalid data), not null — so the confidence
    // blend degrades gracefully rather than throwing on a null multiply.
    const riskConf = g2.score != null ? g2.score : 0;
    riskSnapshots[i] = {
      valid: g2.valid,
      stopPct,
      riskPct: riskPctVal,
      tier: eligibleTier,
      score: g2.score,
      confidence: riskConf,
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

    // trigger_conf: Trigger Gate's own 0–100 impulse score. The armThreshold
    // check (inWindow + impulseScore > 60) is now subsumed by the confidence
    // blend — a fully armed trigger naturally exceeds its threshold, which
    // pushes triggerConf high; a barely-armed trigger contributes its partial
    // score proportionally. Direction must still agree separately.
    const triggerConf = trig.armed ? (trig.impulseScore ?? 0) : 0;
    triggerSnapshots[i] = {
      armed: trig.armed,
      direction: (trig.direction === 'LONG' || trig.direction === 'SHORT') ? trig.direction : null,
      impulseScore: trig.impulseScore,
      confidence: triggerConf,
      validSince: triggerState.validSince,
      reasons: factorReasonsFromBreakdown(trig.breakdown, { worstFirst: false }),
    };

    // ── Entry: direction-agreeing, combined confidence > minScore ─────────
    // Replaces the binary "all three boolean gates simultaneously valid"
    // conjunction with a weighted continuous confidence model. The directional
    // requirement (setup direction matches trigger direction) is kept as a hard
    // constraint — it's a DIRECTION guard, not a STRENGTH guard. Risk gate
    // validity is now a contributor to the confidence score rather than an
    // independent veto. Trigger window membership (trig.armed) is the
    // remaining structural gate: confidence scoring is only active inside the
    // trigger window; outside it, triggerConf = 0, which naturally suppresses
    // the blend below the threshold (20% weight at 0 is a meaningful penalty).
    if (!openTrade && !pendingEntry) {
      const setupSnap = setupSnapshots[i], riskSnap = riskSnapshots[i], trigSnap = triggerSnapshots[i];
      const directionsAgree = setupSnap.valid && trigSnap.armed && setupSnap.direction === trigSnap.direction;
      const confScore = combinedConfidence(setupSnap.confidence, riskSnap.confidence, trigSnap.confidence);
      const confPasses = confScore >= COG_V2_CONFIDENCE.minScore;
      if (directionsAgree && confPasses) {
        const action = trigSnap.direction;
        if (i + 1 >= n) {
          logJournal(i, 'ENTRY', 'No entry: no next bar available for fill (series end)');
        } else {
          const fillOpen = ohlc.open[i + 1];
          const plan = buildEntryPlan({ action, gate2Entry: g2, fillOpen, instrument, stopModelId, requestedTier, accountEquity });
          if (plan.error) {
            logJournal(i, 'ENTRY', `No entry: ${plan.error}`);
          } else {
            logJournal(i, 'ENTRY', `Signal: conf=${confScore.toFixed(1)} (setup=${setupSnap.confidence.toFixed(0)}, risk=${riskSnap.confidence.toFixed(0)}, trig=${trigSnap.confidence.toFixed(0)}) → ${action}`, { confScore });
            pendingEntry = { action, plan, gate1Entry: setupEval, gate2Entry: g2, gate3Entry: gate3Series[dayIdx], entryDayIdx: dayIdx, confScore };
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

  // ── Direction agreement diagnostics ────────────────────────────────────
  // Post-loop pass: for every bar where the trigger was armed, check whether
  // setup direction matched trigger direction. Reports overall rate plus
  // breakdowns by setup direction and by setup age when trigger fires.
  // Purpose: understand WHERE the 4.6% synthetic agreement rate comes from
  // so real-data performance can be compared against the right baseline.
  const BAR_MINUTES = COG_INTRADAY_SCHEDULE.barIntervalMinutes ?? 5;
  const dirAg = {
    totalTriggerArmedBars: 0,
    totalDirAgreeBars: 0,
    bySetupDir: {
      LONG:    { armed: 0, agree: 0 },
      SHORT:   { armed: 0, agree: 0 },
      INVALID: { armed: 0, agree: 0 },
    },
    bySetupAge: {
      fresh:   { label: '<30min',   armed: 0, agree: 0 },
      medium:  { label: '30-180min', armed: 0, agree: 0 },
      mature:  { label: '>180min',  armed: 0, agree: 0 },
    },
    // Trigger session at arming: all triggers are in the 14:20-14:35 UK window;
    // split at NY open (14:30 UK = COG_V2_NY_OPEN_MINUTE) to see whether
    // pre-NY (London close / setup window) or NY-open bars agree more.
    byTriggerSession: {
      preNY: { label: 'pre-NY (14:20-14:29 UK)', armed: 0, agree: 0 },
      nyOpen: { label: 'NY open (14:30-14:35 UK)', armed: 0, agree: 0 },
    },
  };
  for (let i = 0; i < n; i++) {
    const ts = triggerSnapshots[i];
    if (!ts?.armed) continue;
    dirAg.totalTriggerArmedBars++;
    const ss = setupSnapshots[i];
    const setupDir = ss?.direction ?? null;  // 'LONG', 'SHORT', or null
    const trigDir  = ts.direction;
    const agree    = !!setupDir && setupDir === trigDir;
    if (agree) dirAg.totalDirAgreeBars++;

    // By setup direction
    const dirKey = setupDir === 'LONG' ? 'LONG' : setupDir === 'SHORT' ? 'SHORT' : 'INVALID';
    dirAg.bySetupDir[dirKey].armed++;
    if (agree) dirAg.bySetupDir[dirKey].agree++;

    // By setup age at trigger time
    const validSinceIdx = ss?.validSince?.index ?? null;
    const ageMins = validSinceIdx != null ? (i - validSinceIdx) * BAR_MINUTES : null;
    if (ageMins != null) {
      const ageKey = ageMins < 30 ? 'fresh' : ageMins <= 180 ? 'medium' : 'mature';
      dirAg.bySetupAge[ageKey].armed++;
      if (agree) dirAg.bySetupAge[ageKey].agree++;
    }

    // By trigger session
    const min = minuteOfDay[i];
    const sessKey = min < COG_V2_NY_OPEN_MINUTE ? 'preNY' : 'nyOpen';
    dirAg.byTriggerSession[sessKey].armed++;
    if (agree) dirAg.byTriggerSession[sessKey].agree++;
  }
  // Compute rates
  dirAg.rateOverall = dirAg.totalTriggerArmedBars > 0
    ? dirAg.totalDirAgreeBars / dirAg.totalTriggerArmedBars
    : 0;
  for (const v of Object.values(dirAg.bySetupDir))
    v.rate = v.armed > 0 ? v.agree / v.armed : 0;
  for (const v of Object.values(dirAg.bySetupAge))
    v.rate = v.armed > 0 ? v.agree / v.armed : 0;
  for (const v of Object.values(dirAg.byTriggerSession))
    v.rate = v.armed > 0 ? v.agree / v.armed : 0;

  return {
    dates, minuteOfDay, equityCurve, equityCurveDollars, trades, accountEquity, journal,
    setupSnapshots, riskSnapshots, triggerSnapshots,
    setupState, riskState, triggerState,
    tradingDays,
    dirAgreement: dirAg,
    // Exposed so callers (server.js's live route) can recompute a fresh exit
    // score for a currently-open trade on demand, the same gate1/gate1B/gate2/
    // gate3 call shape used by this loop's own cadence-gated re-evaluation.
    threshold1Series, gate2Series, gate3Series, dayIndexForBar,
  };
}
