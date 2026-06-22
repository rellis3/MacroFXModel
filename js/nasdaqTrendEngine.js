// js/nasdaqTrendEngine.js
//
// Gate 2 — Trend Expression Engine. Produces one TrendScore (0-100) per bar
// from a resolution-agnostic set of raw features (ADX, Hurst, ATR
// percentile, directional momentum, breadth trend, VWAP conviction, VIX
// term structure). The same scoring function runs in two contexts:
//   - Daily mode: fed daily OHLC + daily breadth/VIX series, for the
//     2014-present long-run backtest (the only resolution with that much
//     history). "Session" features (e.g. VWAP) are explicit daily-bar
//     proxies — see comments below — not literal Asia/London session data.
//   - Intraday mode: fed real 30m/60m bars sliced to the London session via
//     nasdaqSessions.js, for live trading / recent-window validation.
// Every raw feature and its sub-score is returned alongside the composite,
// so a TrendScore can always be decomposed back into its inputs.
//
// Self-contained: does not import from, or share logic with, any other
// gate/backtest system already in this repository.

import { TREND_SCORE, TREND_RISK_TIERS } from './nasdaqConfig.js';
import {
  atr, adx, hurstExponent, rollingPercentile, rollingZScore, roc,
  sessionVWAP, compositeRampScore, clip,
} from './nasdaqTransforms.js';

// bars: ascending [{high, low, close}]. Returns the full causal (no-lookahead)
// indicator series aligned 1:1 with bars — every value at index i depends
// only on bars[0..i].
export function computeIndicatorSeries(bars) {
  const high = bars.map(b => b.high);
  const low = bars.map(b => b.low);
  const close = bars.map(b => b.close);
  const atrSeries = atr(high, low, close, TREND_SCORE.atrPeriod);
  const adxSeries = adx(high, low, close, TREND_SCORE.adxPeriod).adx;
  const atrPercentile = rollingPercentile(atrSeries, TREND_SCORE.atrPercentileLookback);

  const returns = new Array(bars.length).fill(NaN);
  for (let i = 1; i < bars.length; i++) {
    if (close[i - 1] !== 0 && Number.isFinite(close[i]) && Number.isFinite(close[i - 1])) {
      returns[i] = (close[i] - close[i - 1]) / close[i - 1];
    }
  }
  const hurstSeries = new Array(bars.length).fill(NaN);
  for (let i = TREND_SCORE.hurstLookbackBars; i < bars.length; i++) {
    const window = returns.slice(i - TREND_SCORE.hurstLookbackBars + 1, i + 1);
    if (window.every(Number.isFinite)) hurstSeries[i] = hurstExponent(window);
  }

  const momentum = new Array(bars.length).fill(NaN);
  for (let i = 1; i < bars.length; i++) {
    if (Number.isFinite(atrSeries[i]) && atrSeries[i] > 0) {
      momentum[i] = (close[i] - close[i - 1]) / atrSeries[i];
    }
  }

  // Trailing-window "session" VWAP proxy at daily resolution (see header) —
  // at intraday resolution callers should instead pass bars already sliced
  // to a real session by nasdaqSessions.sliceSession.
  const vwapDist = new Array(bars.length).fill(NaN);
  for (let i = TREND_SCORE.vwapLookbackBars - 1; i < bars.length; i++) {
    const window = bars.slice(i - TREND_SCORE.vwapLookbackBars + 1, i + 1);
    const vwapSeries = sessionVWAP(window);
    const vwap = vwapSeries[vwapSeries.length - 1];
    if (Number.isFinite(vwap) && Number.isFinite(atrSeries[i]) && atrSeries[i] > 0) {
      vwapDist[i] = Math.abs(close[i] - vwap) / atrSeries[i];
    }
  }

  return { atr: atrSeries, adx: adxSeries, atrPercentile, hurst: hurstSeries, momentum, vwapDist };
}

// breadthRatio: equal-weight/cap-weight ETF close ratio, aligned to bars.
// vix/vix3m: aligned daily levels (or NaN where unavailable).
export function computeBreadthAndVixFeatures(breadthRatio, vix, vix3m) {
  const breadthRocSeries = roc(breadthRatio, TREND_SCORE.breadthRocDays);
  const breadthZ = rollingZScore(breadthRocSeries, TREND_SCORE.breadthZWindow);
  const vixTermStructure = vix.map((v, i) => (Number.isFinite(v) && v > 0 && Number.isFinite(vix3m[i])) ? vix3m[i] / v : NaN);
  return { breadthZ, vixTermStructure };
}

// Scores one bar index given the already-computed indicator series.
export function scoreTrendAt(indicators, breadthZ, vixTermStructure, i) {
  const rawValues = {
    adx: indicators.adx[i],
    hurst: indicators.hurst[i],
    atrPercentile: indicators.atrPercentile[i],
    momentum: Number.isFinite(indicators.momentum[i]) ? Math.abs(indicators.momentum[i]) : NaN,
    breadth: breadthZ[i],
    vwapDist: indicators.vwapDist[i],
    vixTermStructure: vixTermStructure[i],
  };

  const { score, coverage, breakdown } = compositeRampScore(rawValues, TREND_SCORE.components);

  // Exhaustion override: outside the healthy participation band, the ATR
  // percentile sub-score is penalized rather than read as "more is better".
  const atrPctRaw = rawValues.atrPercentile;
  let adjustedScore = score;
  if (score != null && Number.isFinite(atrPctRaw) &&
      (atrPctRaw < TREND_SCORE.atrPercentileBand[0] || atrPctRaw > TREND_SCORE.atrPercentileBand[1])) {
    const atrComponent = breakdown.find(b => b.id === 'atrPercentile');
    const totalWeight = TREND_SCORE.components.reduce((a, c) => a + c.weight, 0);
    const penalty = atrComponent?.subScore != null
      ? (atrComponent.subScore * (1 - TREND_SCORE.exhaustionPenalty) * atrComponent.weight) / totalWeight
      : 0;
    adjustedScore = clip(score - penalty, TREND_SCORE.range[0], TREND_SCORE.range[1]);
  }

  const valid = adjustedScore != null && adjustedScore > TREND_SCORE.validThreshold;
  const tier = valid
    ? TREND_RISK_TIERS.slice().sort((a, b) => b.minScore - a.minScore).find(t => adjustedScore >= t.minScore) || null
    : null;

  return { score: adjustedScore, coverage, valid, tier: tier?.label || null, riskPct: tier?.riskPct ?? null, breakdown };
}

// Full time-series run: one TrendScore record per bar, causal/no-lookahead.
export function runTrendEngine(bars, breadthRatio, vix, vix3m) {
  const indicators = computeIndicatorSeries(bars);
  const { breadthZ, vixTermStructure } = computeBreadthAndVixFeatures(breadthRatio, vix, vix3m);
  return bars.map((b, i) => ({ date: b.date ?? null, ...scoreTrendAt(indicators, breadthZ, vixTermStructure, i) }));
}
