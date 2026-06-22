// js/nasdaqBacktest.js
//
// Orchestrates all four gates into one daily-resolution backtest loop. This
// is the long-run (2014-present) test of the core thesis — daily OHLC is the
// only resolution with that much free history, so Gate 3's session-specific
// inputs (true NYSE TICK/A-D/TRIN) that have no daily proxy are left as NaN
// and simply abstain from the weighted vote (see computeDailyGate3RawMoves)
// rather than being faked. This is disclosed, not hidden.
//
// No-lookahead discipline: every gate score at bar i depends only on data
// through bar i's close. A trading decision made at bar i's close always
// fills at bar i+1's open (EXECUTION.fillRule), EXCEPT a standing stop-loss
// order, which can fill intrabar on the bar that triggers it (it was placed
// before that bar opened, so checking it intrabar is not lookahead).
//
// Self-contained: does not import from, or share logic with, any other
// gate/backtest system already in this repository.

import {
  LIQUIDITY_INPUTS, ENTRY_RULE, EXECUTION, INSTRUMENTS, DATA_DEFAULTS,
  TREND_RISK_TIERS,
} from './nasdaqConfig.js';
import {
  fetchYahooDaily, fetchFredSeries, fetchLiquidityInputRaw, generateSyntheticDailyDataset,
} from './nasdaqDataSources.js';
import { runLiquidityEngine } from './nasdaqLiquidityEngine.js';
import { computeIndicatorSeries, computeBreadthAndVixFeatures, scoreTrendAt } from './nasdaqTrendEngine.js';
import { computeNyConfirmation } from './nasdaqNyConfirmationEngine.js';
import { alignContinuationFeatures, scoreContinuation, simulateSecondaryExit, SECONDARY_EXIT_MODEL_IDS } from './nasdaqExitEngine.js';
import { computeVolatilityFeatureSeries, classifyVolatilityRegime, computeStopDistance, determineConfidenceTier } from './nasdaqSizing.js';
import { sessionVWAP } from './nasdaqTransforms.js';

// ── Dataset loading + alignment ─────────────────────────────────────────────

function dailyReturn(prev, cur) {
  return (Number.isFinite(prev) && prev !== 0 && Number.isFinite(cur)) ? (cur - prev) / Math.abs(prev) : NaN;
}

export async function loadDailyDataset({ start = DATA_DEFAULTS.backtestStart, end, synthetic = false } = {}) {
  if (synthetic) {
    const synth = generateSyntheticDailyDataset({ start, end });
    const flat = (v) => synth.dates.map(() => v);
    return {
      synthetic: true,
      dates: synth.dates,
      ohlc: {
        open: synth.ohlc.map(b => b.open), high: synth.ohlc.map(b => b.high),
        low: synth.ohlc.map(b => b.low), close: synth.ohlc.map(b => b.close), volume: synth.ohlc.map(b => b.volume),
      },
      liquidityRawByInputId: synth.liquiditySeries,
      breadthRatio: flat(100),
      vix: flat(20), vix3m: flat(21), vvix: flat(90),
      dxy: flat(100), us10y: flat(4),
      proxyMomentum: { es: synth.ohlc.map(b => b.close), rty: synth.ohlc.map(b => b.close) },
    };
  }

  const primary = await fetchYahooDaily(INSTRUMENTS.primary.ticker, { start }).catch(() => []);
  const bars = primary.length ? primary : await fetchYahooDaily(INSTRUMENTS.secondary[0].ticker, { start });
  if (!bars.length) throw new Error('No primary instrument data available');
  const dates = bars.map(b => new Date(b.t).toISOString().slice(0, 10));

  const [liquidityRaw, breadthEqBars, breadthCapBars, vixBars, vix3mBars, vvixBars, dxyBars, us10yRaw, esBars, rtyBars] = await Promise.all([
    Promise.all(LIQUIDITY_INPUTS.map(inp => fetchLiquidityInputRaw(inp).catch(() => []))),
    fetchYahooDaily(INSTRUMENTS.breadthProxy.nasdaq.equalWeight, { start }).catch(() => []),
    fetchYahooDaily(INSTRUMENTS.breadthProxy.nasdaq.capWeight, { start }).catch(() => []),
    fetchYahooDaily('^VIX', { start }).catch(() => []),
    fetchYahooDaily('^VIX3M', { start }).catch(() => []),
    fetchYahooDaily('^VVIX', { start }).catch(() => []),
    fetchYahooDaily(INSTRUMENTS.dxy.ticker, { start }).catch(() => []),
    fetchFredSeries(INSTRUMENTS.us10y.fredSeriesId, { start }).catch(() => []),
    fetchYahooDaily(INSTRUMENTS.nyFuturesProxy[1].ticker, { start }).catch(() => []),
    fetchYahooDaily(INSTRUMENTS.nyFuturesProxy[2].ticker, { start }).catch(() => []),
  ]);

  const liquidityRawByInputId = {};
  LIQUIDITY_INPUTS.forEach((inp, idx) => { liquidityRawByInputId[inp.id] = liquidityRaw[idx]; });

  const toMap = (arr) => new Map(arr.map(b => [new Date(b.t).toISOString().slice(0, 10), b.close]));
  const alignByDate = (map) => dates.map(d => map.has(d) ? map.get(d) : NaN);

  const breadthEqMap = toMap(breadthEqBars);
  const breadthCapMap = toMap(breadthCapBars);
  const us10yMap = new Map(us10yRaw.map(o => [o.date, o.value]));

  return {
    synthetic: false,
    dates,
    ohlc: { open: bars.map(b => b.open), high: bars.map(b => b.high), low: bars.map(b => b.low), close: bars.map(b => b.close), volume: bars.map(b => b.volume) },
    liquidityRawByInputId,
    breadthRatio: dates.map(d => {
      const eq = breadthEqMap.get(d), cap = breadthCapMap.get(d);
      return (Number.isFinite(eq) && Number.isFinite(cap) && cap !== 0) ? eq / cap : NaN;
    }),
    vix: alignByDate(toMap(vixBars)),
    vix3m: alignByDate(toMap(vix3mBars)),
    vvix: alignByDate(toMap(vvixBars)),
    dxy: alignByDate(toMap(dxyBars)),
    us10y: dates.map(d => us10yMap.has(d) ? us10yMap.get(d) : NaN),
    proxyMomentum: { es: alignByDate(toMap(esBars)), rty: alignByDate(toMap(rtyBars)) },
  };
}

// Daily-bar proxy for Gate 3's NY-window inputs (see header note on tick/add/trin).
function computeDailyGate3RawMoves(i, dataset, vwapAtrSeries) {
  const c = dataset.ohlc.close;
  return {
    nq: dailyReturn(c[i - 1], c[i]),
    es: dailyReturn(dataset.proxyMomentum.es[i - 1], dataset.proxyMomentum.es[i]),
    rty: dailyReturn(dataset.proxyMomentum.rty[i - 1], dataset.proxyMomentum.rty[i]),
    dxy: dailyReturn(dataset.dxy[i - 1], dataset.dxy[i]),
    us10y: (Number.isFinite(dataset.us10y[i]) && Number.isFinite(dataset.us10y[i - 1])) ? dataset.us10y[i] - dataset.us10y[i - 1] : NaN,
    vwap: vwapAtrSeries[i],
    breadth: dailyReturn(dataset.breadthRatio[i - 1], dataset.breadthRatio[i]),
    tick: NaN, add: NaN, trin: NaN, // no independent daily-bar proxy — abstain via Gate 3's weight-present coverage policy
  };
}

function transactionCostFraction(notionalToEquityRatio) {
  return Math.max(0, notionalToEquityRatio) * (EXECUTION.commissionBps + EXECUTION.slippageBps) / 10_000;
}

function pickTrendTier(score) {
  return TREND_RISK_TIERS.slice().sort((a, b) => b.minScore - a.minScore).find(t => score >= t.minScore) || null;
}

// ── Full simulation ──────────────────────────────────────────────────────────

export function runFullBacktest(dataset) {
  const { dates, ohlc } = dataset;
  const n = dates.length;
  const bars = dates.map((date, i) => ({ date, open: ohlc.open[i], high: ohlc.high[i], low: ohlc.low[i], close: ohlc.close[i], volume: ohlc.volume[i] }));

  const gate1 = runLiquidityEngine(dataset.liquidityRawByInputId, dates);
  const indicators = computeIndicatorSeries(bars);
  const { breadthZ, vixTermStructure } = computeBreadthAndVixFeatures(dataset.breadthRatio, dataset.vix, dataset.vix3m);
  const gate2 = bars.map((_, i) => scoreTrendAt(indicators, breadthZ, vixTermStructure, i));
  const volFeatures = computeVolatilityFeatureSeries({ closes: ohlc.close, atrSeries: indicators.atr, vixSeries: dataset.vix, vvixSeries: dataset.vvix });

  // Signed (not absolute) trailing-window VWAP distance, in ATR units — used
  // both as Gate 3's daily "price vs session VWAP" proxy and as Gate 4's
  // directional vwapDist/vwapLoss raw inputs.
  const vwapAtrSeries = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i < 12) continue;
    const window = bars.slice(Math.max(0, i - 12), i + 1);
    const vwap = sessionVWAP(window).at(-1);
    if (Number.isFinite(vwap) && Number.isFinite(indicators.atr[i]) && indicators.atr[i] > 0) {
      vwapAtrSeries[i] = (bars[i].close - vwap) / indicators.atr[i];
    }
  }

  const trades = [];
  const eventLog = [];
  const equityCurve = new Array(n).fill(1);
  let equity = 1;
  let position = null;     // open trade state
  let pendingEntry = null; // { direction, fillIndex, stopDistance, riskPct, tier, liquidityScoreAtEntry, trendScoreAtEntry, signalDate }

  const log = (date, message) => eventLog.push({ date, message });

  function finalizeTrade(exitIndex, exitPrice, reason) {
    const dirSign = position.direction === 'LONG' ? 1 : -1;
    const pnlR = dirSign * (exitPrice - position.entryPrice) / position.initialStopDistance;
    trades.push({
      direction: position.direction, entryIndex: position.entryIndex, entryDate: dates[position.entryIndex], entryPrice: position.entryPrice,
      exitIndex, exitDate: dates[exitIndex], exitPrice, initialStopDistance: position.initialStopDistance,
      riskPct: position.riskPct, tier: position.tier, reduced: position.reduced,
      liquidityScoreAtEntry: position.liquidityScoreAtEntry, trendScoreAtEntry: position.trendScoreAtEntry,
      barsHeld: exitIndex - position.entryIndex, pnlR, reason,
    });
  }

  for (let i = 0; i < n; i++) {
    let dailyReturnR = 0;

    // STEP A — fill scheduled actions from a prior bar's signal.
    if (pendingEntry && pendingEntry.fillIndex === i) {
      const entryPrice = bars[i].open;
      const stopDistance = pendingEntry.stopDistance;
      const stopPrice = pendingEntry.direction === 'LONG' ? entryPrice - stopDistance : entryPrice + stopDistance;
      position = { ...pendingEntry, entryIndex: i, entryPrice, stopPrice, initialStopDistance: stopDistance, sizeFraction: 1, reduced: false, pendingCloseFillIndex: null };
      const notionalRatio = (position.riskPct / 100) * entryPrice / stopDistance;
      equity *= (1 - transactionCostFraction(notionalRatio));
      log(dates[i], `ORDER FILLED ${position.direction} @ ${entryPrice.toFixed(2)} (risk ${position.riskPct}%, stop ${stopDistance.toFixed(2)})`);
      pendingEntry = null;
      const dirSign = position.direction === 'LONG' ? 1 : -1;
      if (Number.isFinite(bars[i].close)) dailyReturnR = dirSign * (bars[i].close - entryPrice) / stopDistance;
    } else if (position && position.pendingCloseFillIndex === i) {
      const exitPrice = bars[i].open;
      const dirSign = position.direction === 'LONG' ? 1 : -1;
      dailyReturnR = dirSign * (exitPrice - bars[i - 1].close) / position.initialStopDistance;
      equity *= (1 + position.sizeFraction * (position.riskPct / 100) * dailyReturnR);
      const notionalRatio = (position.riskPct / 100) * exitPrice / position.initialStopDistance * position.sizeFraction;
      equity *= (1 - transactionCostFraction(notionalRatio));
      finalizeTrade(i, exitPrice, 'CONTINUATION_SCORE_CLOSE');
      log(dates[i], `CLOSE TRADE — order filled @ ${exitPrice.toFixed(2)}`);
      position = null;
      equityCurve[i] = equity;
      continue; // flat for the rest of this bar
    }

    // STEP B — evaluate an open position: stop check, mark-to-market, Gate 4.
    if (position) {
      const dirSign = position.direction === 'LONG' ? 1 : -1;
      const stopHit = position.direction === 'LONG' ? bars[i].low <= position.stopPrice : bars[i].high >= position.stopPrice;
      if (stopHit) {
        const exitPrice = position.stopPrice;
        const refPrice = (i === position.entryIndex) ? position.entryPrice : bars[i - 1].close;
        dailyReturnR = dirSign * (exitPrice - refPrice) / position.initialStopDistance;
        equity *= (1 + position.sizeFraction * (position.riskPct / 100) * dailyReturnR);
        const notionalRatio = (position.riskPct / 100) * exitPrice / position.initialStopDistance * position.sizeFraction;
        equity *= (1 - transactionCostFraction(notionalRatio));
        finalizeTrade(i, exitPrice, 'STOP_LOSS');
        log(dates[i], `STOP LOSS HIT — CLOSE TRADE @ ${exitPrice.toFixed(2)}`);
        position = null;
      } else {
        if (i !== position.entryIndex) {
          dailyReturnR = dirSign * (bars[i].close - bars[i - 1].close) / position.initialStopDistance;
        }
        equity *= (1 + position.sizeFraction * (position.riskPct / 100) * dailyReturnR);

        const rawContinuation = {
          momentum30m: indicators.momentum[i],
          adx: indicators.adx[i],
          adxSlope: indicators.adx[i] - (indicators.adx[i - 1] ?? NaN),
          hurst: indicators.hurst[i],
          vwapDist: Number.isFinite(vwapAtrSeries[i]) ? dirSign * vwapAtrSeries[i] : NaN,
          vwapLoss: Number.isFinite(vwapAtrSeries[i]) ? ((dirSign * vwapAtrSeries[i] < 0) ? 1 : 0) : NaN,
          breadth: breadthZ[i],
          add: NaN, tick: NaN, trin: NaN,
          dxy: dailyReturn(dataset.dxy[i - 1], dataset.dxy[i]),
          yields: (Number.isFinite(dataset.us10y[i]) && Number.isFinite(dataset.us10y[i - 1])) ? dataset.us10y[i] - dataset.us10y[i - 1] : NaN,
          vix: dailyReturn(dataset.vix[i - 1], dataset.vix[i]),
          vvix: dailyReturn(dataset.vvix[i - 1], dataset.vvix[i]),
          realizedVol: volFeatures.realizedVolPercentile[i],
        };
        const aligned = alignContinuationFeatures(position.direction, rawContinuation);
        const cont = scoreContinuation(aligned);
        position.lastContinuation = cont;

        if (cont.action === 'CLOSE') {
          position.pendingCloseFillIndex = i + 1;
          log(dates[i], `Gate 4 ContinuationScore ${cont.score?.toFixed(0) ?? 'n/a'} → CLOSE TRADE (signal, fills next open)`);
        } else if (cont.action === 'REDUCE' && !position.reduced) {
          position.sizeFraction = 0.5;
          position.reduced = true;
          const notionalRatio = (position.riskPct / 100) * bars[i].close / position.initialStopDistance * 0.5;
          equity *= (1 - transactionCostFraction(notionalRatio));
          log(dates[i], `Gate 4 ContinuationScore ${cont.score?.toFixed(0) ?? 'n/a'} → Reduce Position`);
        }
      }
    }

    // STEP D — look for a new entry only when flat with nothing queued.
    if (!position && !pendingEntry && i + 1 < n) {
      const g1 = gate1[i], g2 = gate2[i];
      const bias = (g1.dataValid && g1.state === 'BULLISH') ? 'LONG'
        : (g1.dataValid && g1.state === 'BEARISH') ? 'SHORT' : null;

      if (bias && g2.valid && Number.isFinite(indicators.atr[i]) && indicators.atr[i] > 0) {
        const volRegime = classifyVolatilityRegime({
          atrPercentile: indicators.atrPercentile[i],
          realizedVolPercentile: volFeatures.realizedVolPercentile[i],
          garchVolPercentile: volFeatures.garchVolPercentile[i],
          vixPercentile: volFeatures.vixPercentile[i],
          vvixPercentile: volFeatures.vvixPercentile[i],
        });
        const gate3RawMoves = computeDailyGate3RawMoves(i, dataset, vwapAtrSeries);
        const gate3 = computeNyConfirmation(gate3RawMoves, bias);

        log(dates[i], `Gate 1 ${g1.state} (score ${g1.score?.toFixed(2)}) / Gate 2 VALID (score ${g2.score?.toFixed(0)}, tier ${g2.tier}) / Gate 3 ${gate3.decision}`);

        if (gate3.decision === bias) {
          const tierInfo = determineConfidenceTier({ trendTier: g2.tier, liquidityScore: g1.score, volRegime: volRegime.regime });
          const stopDistance = computeStopDistance(indicators.atr[i], volRegime.regime);
          pendingEntry = {
            direction: bias, fillIndex: i + 1, stopDistance, riskPct: tierInfo.riskPct, tier: tierInfo.tier,
            liquidityScoreAtEntry: g1.score, trendScoreAtEntry: g2.score, signalDate: dates[i],
          };
          log(dates[i], `Risk = ${tierInfo.riskPct}% / Stop = ${stopDistance.toFixed(2)} (${volRegime.regime} vol regime) → ORDER QUEUED ${bias}`);
        }
      }
    }

    equityCurve[i] = equity;
  }

  // If still open at the end of history, mark it closed-at-last-close for reporting (not a real fill).
  if (position) {
    finalizeTrade(n - 1, bars[n - 1].close, 'END_OF_HISTORY_OPEN');
  }

  // Secondary exit model comparison — replay every completed trade's actual
  // bar path against each registered model (research only, see nasdaqExitEngine.js).
  const secondaryExitComparison = compareSecondaryExitModels(trades, bars, indicators, breadthZ, vwapAtrSeries);

  return {
    dates, gate1, gate2, indicators, volFeatures, trades, eventLog, equityCurve,
    secondaryExitComparison, synthetic: !!dataset.synthetic,
  };
}

function compareSecondaryExitModels(trades, bars, indicators, breadthZ, vwapAtrSeries) {
  const results = {};
  for (const modelId of SECONDARY_EXIT_MODEL_IDS) results[modelId] = [];

  for (const trade of trades) {
    if (trade.reason === 'END_OF_HISTORY_OPEN') continue;
    const dirSign = trade.direction === 'LONG' ? 1 : -1;
    const momentumAlignedSeries = indicators.momentum.map(m => Number.isFinite(m) ? dirSign * m : NaN);
    const vwapLossFlagSeries = vwapAtrSeries.map(v => Number.isFinite(v) ? ((dirSign * v < 0) ? 1 : 0) : 0);
    const breadthZAlignedSeries = breadthZ.map(z => Number.isFinite(z) ? dirSign * z : NaN);

    for (const modelId of SECONDARY_EXIT_MODEL_IDS) {
      const sim = simulateSecondaryExit(modelId, {
        direction: trade.direction, entryIndex: trade.entryIndex, entryPrice: trade.entryPrice,
        initialStopDistance: trade.initialStopDistance, bars, atrSeries: indicators.atr,
        momentumAlignedSeries, vwapLossFlagSeries, breadthZAlignedSeries,
      });
      const pnlR = dirSign * (sim.exitPrice - trade.entryPrice) / trade.initialStopDistance;
      results[modelId].push({ entryDate: trade.entryDate, pnlR, barsHeld: sim.barsHeld, reason: sim.reason });
    }
  }
  return results;
}
