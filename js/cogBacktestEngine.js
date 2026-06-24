// js/cogBacktestEngine.js — Backtest Lab's core: runs Gates 1-4 + the Exit
// Engine over a dataset (synthetic in Phase 1, real OHLC/macro series in
// later phases) and produces a Trade Journal + equity curve in the exact
// shape nasdaqPerformance.js's computePerformanceReport expects.
//
// One trade open at a time — this system flattens before considering a new
// signal rather than pyramiding. Position sizing is fixed to the run's
// STARTING accountEquity for every trade (no equity compounding in Phase 1):
// Gate 4's entry plans are computed once, vectorized over the whole series,
// against that one fixed equity figure, so compounding sizing off the
// then-current equity would require re-running Gate 4 per-trade — disclosed
// simplification, not hidden, revisit once Phase 4 paper-trades real equity.
//
// Live re-evaluation cadence is 5/15/30 minutes (COG_EXIT_SCORE); this daily
// backtest can only re-evaluate the Exit Engine once per daily bar — a
// disclosed resolution gap versus live trading, not a bug.
//
// REDUCE accounting: a REDUCE signal cuts the trade to REDUCE_SIZE_FRACTION
// of its original size exactly once per trade (matches the Exit Engine's
// three-zone model — stay-in -> reduce -> close — not a partial-cut ladder).
// The audit trail of WHEN/WHY lives on the trade via recordReduceEvent;
// this file owns the actual $ /R accounting, scaling the trade's final pnl
// by whatever size fraction remained open at close.

import { computeLiquidityGate } from './cogLiquidityGate.js';
import { computeRiskGate } from './cogRiskGate.js';
import { computeDirectionGate } from './cogDirectionGate.js';
import { computeExecutionSignals } from './cogExecutionEngine.js';
import { computeExitScore } from './cogExitEngine.js';
import { openTradeRecord, closeTradeRecord, recordReduceEvent, resetTradeIdCounter } from './cogTradeJournal.js';

const REDUCE_SIZE_FRACTION = 0.5;

function toSeriesById(seriesMap) {
  const out = {};
  for (const key of Object.keys(seriesMap)) out[key] = seriesMap[key].map(p => p.value);
  return out;
}

// `dataset` = { dates, ohlc: {open,high,low,close}[], liquiditySeries,
// riskSeries, directionSeries } — generateSyntheticCogDataset's shape (or any
// real-data loader matching it). `options` forwards straight to
// computeExecutionSignals (instrumentKey/stopModelId/requestedTier/
// accountEquity) so the Backtest Lab UI can sweep them per run.
export function runBacktest(dataset, options = {}) {
  resetTradeIdCounter();
  const { dates, ohlc: ohlcBars, liquiditySeries, riskSeries, directionSeries } = dataset;
  const n = dates.length;
  const ohlc = {
    open: ohlcBars.map(b => b.open),
    high: ohlcBars.map(b => b.high),
    low: ohlcBars.map(b => b.low),
    close: ohlcBars.map(b => b.close),
  };

  const gate1 = computeLiquidityGate(toSeriesById(liquiditySeries), n);
  const gate2 = computeRiskGate(toSeriesById(riskSeries), ohlc, ohlc.close, n);
  const gate3 = computeDirectionGate(toSeriesById(directionSeries), n);
  const { accountEquity = 100000, instrumentKey, stopModelId, requestedTier } = options;
  const gate4 = computeExecutionSignals(gate1, gate2, gate3, ohlc, n, { accountEquity, instrumentKey, stopModelId, requestedTier });

  // nasdaqPerformance.js hardcodes startEquity = 1 (computePerformanceReport
  // assumes a REBASED equity curve, i.e. "multiple of starting capital", not
  // raw dollars) — equity here tracks that same convention; equityCurveDollars
  // is the $-denominated convenience view for the UI's equity-curve chart.
  const trades = [];
  const equityCurve = new Array(n);
  let equity = 1;
  let openTrade = null;
  let openSizeFraction = 1;

  for (let i = 0; i < n; i++) {
    if (openTrade) {
      const exitResult = computeExitScore(
        { gate1: gate1[openTrade.entryIndex], gate2: gate2[openTrade.entryIndex], gate3: gate3[openTrade.entryIndex] },
        { gate1: gate1[i], gate2: gate2[i], gate3: gate3[i] },
        openTrade.direction
      );
      const stopHit = openTrade.direction === 'LONG'
        ? ohlc.low[i] <= openTrade.stopStandardPrice
        : ohlc.high[i] >= openTrade.stopStandardPrice;

      let closeReason = null, closePrice = null;
      if (stopHit) {
        closeReason = 'STOP_HIT';
        closePrice = openTrade.stopStandardPrice;
      } else if (exitResult.action === 'CLOSE') {
        closeReason = 'EXIT_ENGINE_CLOSE';
        closePrice = ohlc.close[i];
      } else if (exitResult.action === 'REDUCE' && openSizeFraction > REDUCE_SIZE_FRACTION) {
        recordReduceEvent(openTrade, { index: i, date: dates[i], exitScoreResult: exitResult });
        openSizeFraction = REDUCE_SIZE_FRACTION;
      }

      if (closeReason) {
        closeTradeRecord(openTrade, { exitIndex: i, exitDate: dates[i], exitPrice: closePrice, reason: closeReason, exitScoreResult: exitResult });
        openTrade.sizeFractionAtClose = openSizeFraction;
        openTrade.pnlDollars *= openSizeFraction;
        openTrade.pnlR *= openSizeFraction;
        equity += openTrade.pnlDollars / accountEquity;
        trades.push(openTrade);
        openTrade = null;
      }
    }

    if (!openTrade && gate4[i].action !== 'NO_TRADE' && gate4[i].entryPlan) {
      openTrade = openTradeRecord({
        entryIndex: i + 1,
        entryDate: dates[i + 1],
        action: gate4[i].action,
        entryPlan: gate4[i].entryPlan,
        accountEquity,
        gate1Entry: gate1[i],
        gate2Entry: gate2[i],
        gate3Entry: gate3[i],
      });
      openSizeFraction = 1;
    }

    equityCurve[i] = equity;
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
  return { dates, equityCurve, equityCurveDollars, trades, accountEquity, gate1, gate2, gate3, gate4 };
}
