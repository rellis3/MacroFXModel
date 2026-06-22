// js/nasdaqSizing.js
//
// Volatility regime model, stop distance, and final position sizing. Final
// sizing folds in three independent reads — Gate 2's recommended risk tier,
// how convincingly Gate 1's LiquidityScore cleared its threshold, and the
// current volatility regime — and only ever sizes DOWN from what Gate 2
// alone would recommend, never up. That asymmetry is deliberate: extra
// gates can make a trade smaller or veto it, none of them can make it bigger
// than the trend-strength tier alone justifies.
//
// Self-contained: does not import from, or share logic with, any other
// gate/backtest system already in this repository.

import { VOLATILITY_REGIME, POSITION_SIZING, LIQUIDITY_SCORE } from './nasdaqConfig.js';
import { rollingPercentile, std, garch11 } from './nasdaqTransforms.js';

// Builds the five percentile-rank series (ATR, realized vol, GARCH forecast
// vol, VIX, VVIX) used by classifyVolatilityRegime. All series are causal —
// percentile rank at i only looks at the trailing window ending at i.
export function computeVolatilityFeatureSeries({ closes, atrSeries, vixSeries, vvixSeries }) {
  const n = closes.length;
  const returns = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    if (Number.isFinite(closes[i]) && Number.isFinite(closes[i - 1]) && closes[i - 1] !== 0) {
      returns[i] = (closes[i] - closes[i - 1]) / closes[i - 1];
    }
  }

  const realizedVol = new Array(n).fill(NaN);
  const w = VOLATILITY_REGIME.realizedVolWindowDays;
  for (let i = w; i < n; i++) {
    const window = returns.slice(i - w + 1, i + 1);
    if (window.every(Number.isFinite)) realizedVol[i] = std(window);
  }

  // GARCH forecast vol re-estimated on each trailing realizedVolWindowDays*5
  // block is too expensive to run per-bar over a multi-year daily history;
  // instead we refit periodically (every realizedVolWindowDays bars) and
  // forward-fill the forecast between refits — still strictly causal.
  const garchVol = new Array(n).fill(NaN);
  const garchWindow = Math.max(250, w * 5);
  let lastGarchFit = -Infinity;
  let lastForecast = NaN;
  for (let i = garchWindow; i < n; i++) {
    if (i - lastGarchFit >= w) {
      const window = returns.slice(i - garchWindow + 1, i + 1).filter(Number.isFinite);
      const fit = window.length >= garchWindow * 0.9 ? garch11(window) : null;
      if (fit) { lastForecast = fit.forecastVol; lastGarchFit = i; }
    }
    garchVol[i] = lastForecast;
  }

  const lookback = VOLATILITY_REGIME.percentileLookbackDays;
  return {
    atrPercentile: rollingPercentile(atrSeries, lookback),
    realizedVolPercentile: rollingPercentile(realizedVol, lookback),
    garchVolPercentile: rollingPercentile(garchVol, lookback),
    vixPercentile: rollingPercentile(vixSeries, lookback),
    vvixPercentile: rollingPercentile(vvixSeries, lookback),
  };
}

export function classifyVolatilityRegime(percentilesAtI) {
  const vals = Object.values(percentilesAtI).filter(Number.isFinite);
  if (!vals.length) return { regime: 'NORMAL', avgPercentile: null, coverage: 0 };
  const avgPercentile = vals.reduce((a, b) => a + b, 0) / vals.length;
  const regime = avgPercentile < VOLATILITY_REGIME.lowPercentile ? 'LOW'
    : avgPercentile > VOLATILITY_REGIME.highPercentile ? 'HIGH'
    : 'NORMAL';
  return { regime, avgPercentile, coverage: vals.length / Object.keys(percentilesAtI).length };
}

export function computeStopDistance(atrValue, regime) {
  return Number.isFinite(atrValue) ? atrValue * VOLATILITY_REGIME.stopAtrMultiplier[regime] : null;
}

const TIER_ORDER = ['LOW', 'MEDIUM', 'HIGH'];

// trendTier: Gate 2's recommended tier ('LOW'|'MEDIUM'|'HIGH', from TREND_RISK_TIERS).
// liquidityScore: Gate 1's signed LiquidityScore for this trade's direction.
// volRegime: 'LOW'|'NORMAL'|'HIGH' from classifyVolatilityRegime.
export function determineConfidenceTier({ trendTier, liquidityScore, volRegime }) {
  let idx = TIER_ORDER.indexOf(trendTier);
  if (idx < 0) idx = 0;

  const margin = Math.abs(liquidityScore) - LIQUIDITY_SCORE.bullishThreshold;
  const downgrades = [];
  if (margin < LIQUIDITY_SCORE.marginalMargin) { idx = Math.max(0, idx - 1); downgrades.push('marginal liquidity conviction'); }
  if (volRegime === 'HIGH') { idx = Math.max(0, idx - 1); downgrades.push('high volatility regime'); }

  const tier = TIER_ORDER[idx];
  return { tier, riskPct: POSITION_SIZING[tier].riskPct, downgrades };
}
