// js/cogLiquidityGate.js — Gate 1: Liquidity Engine
//
// Never touches Nasdaq price (see cogConfig.js header). Reads Fed/ECB/BOJ/
// PBOC balance sheets, RRP, TGA, NFCI, credit spreads, the US curve and DXY
// — pure macro/cross-asset liquidity backdrop — and reduces them to a single
// LiquidityScore in [-5, +5] plus a VALID/INVALID classification.
//
// "No black boxes": computeLiquidityGate returns, for every bar, the raw
// value, the normalized [-1,1] sub-signal and the final weighted
// contribution of every input — never just the composite number.
//
// Per-input normalization (computeInputContribution below): blend a
// multi-horizon ROC z-score (responsiveness — "is this accelerating in a
// favorable direction?") with a rolling level-percentile signal (regime
// placement — "is the raw level itself high or low historically?"), each
// scaled onto [-1,+1], then average the two before applying `sign`/`weight`.

import { roc, rollingZScore, rollingPercentile, clip } from './nasdaqTransforms.js';
import { COG_LIQUIDITY_INPUTS, COG_LIQUIDITY_SCORE } from './cogConfig.js';

const TRADING_DAYS_PER_CALENDAR_DAY = 5 / 7; // weekday-only series approximation

function tradingDayHorizon(calendarDays) {
  return Math.max(1, Math.round(calendarDays * TRADING_DAYS_PER_CALENDAR_DAY));
}

// Human-readable phrasing for Gate 1's reasons text, keyed by input id:
// [supportivePhrase, opposingPhrase]. Read when the input's *signed*
// normalized value (after `sign` is applied) is positive vs. negative —
// i.e. always phrased in terms of "good for risk assets" vs. "bad for risk
// assets", independent of whether a rising or falling raw value caused it.
const PHRASES = {
  walcl:  ['Fed balance sheet expanding', 'Fed balance sheet contracting'],
  rrp:    ['RRP draining (liquidity returning to system)', 'RRP building (liquidity parked at Fed)'],
  tga:    ['TGA drawing down (liquidity injected)', 'TGA rebuilding (liquidity drained)'],
  ecb:    ['ECB balance sheet expanding', 'ECB balance sheet contracting'],
  boj:    ['BOJ balance sheet expanding', 'BOJ balance sheet contracting'],
  pboc:   ['China FX reserves rising', 'China FX reserves falling'],
  curve:  ['Yield curve steepening', 'Yield curve flattening/inverting'],
  dxy:    ['DXY weakening', 'DXY strengthening'],
  credit: ['HY credit spreads tightening', 'HY credit spreads widening'],
  nfci:   ['Financial conditions loosening', 'Financial conditions tightening'],
  hygLqd: ['HYG/LQD ratio rising (risk appetite up)', 'HYG/LQD ratio falling (risk appetite down)'],
  vix:    ['VIX falling', 'VIX rising'],
  vix3m:  ['VIX3M falling', 'VIX3M rising'],
  vvix:   ['VVIX falling', 'VVIX rising'],
};
function phraseFor(id, signedValue) {
  const pair = PHRASES[id] || [`${id} supportive`, `${id} unsupportive`];
  return signedValue >= 0 ? pair[0] : pair[1];
}

// Precomputes this input's normalized [-1,1] signal for every bar in one
// pass (each underlying roc/rollingZScore/rollingPercentile call is O(n) or
// O(n*period) over the WHOLE series) — never recomputed per-bar, since doing
// that inside the bar loop would make the gate O(n^2).
function precomputeInputSignal(seriesAligned) {
  const { rocHorizonsDays, zWindowDays, percentileWindowDays, zClip } = COG_LIQUIDITY_SCORE;
  const n = seriesAligned.length;

  const rocZArrays = rocHorizonsDays.map(calDays => {
    const period = tradingDayHorizon(calDays);
    return rollingZScore(roc(seriesAligned, period), zWindowDays, zClip);
  });
  const pctArray = rollingPercentile(seriesAligned, percentileWindowDays);

  const normalized = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    let rocSum = 0, rocCount = 0;
    for (const arr of rocZArrays) {
      const z = arr[i];
      if (Number.isFinite(z)) { rocSum += z / zClip; rocCount++; }
    }
    const rocSignal = rocCount > 0 ? clip(rocSum / rocCount, -1, 1) : null;
    const pct = pctArray[i];
    const pctSignal = Number.isFinite(pct) ? clip((pct - 50) / 50, -1, 1) : null;
    const parts = [rocSignal, pctSignal].filter(v => v != null);
    normalized[i] = parts.length ? clip(parts.reduce((a, b) => a + b, 0) / parts.length, -1, 1) : null;
  }
  return normalized;
}

function buildContribution(input, rawValue, normalized) {
  if (!Number.isFinite(rawValue) || normalized == null) {
    return { id: input.id, label: input.label, weight: input.weight, rawValue: Number.isFinite(rawValue) ? rawValue : null, normalized: null, signedValue: null, contribution: null };
  }
  const signedValue = input.sign * normalized;
  const contribution = input.weight * signedValue;
  return { id: input.id, label: input.label, weight: input.weight, rawValue, normalized, signedValue, contribution };
}

// Computes the full Gate 1 time series from a map of input id -> aligned raw
// value array (already publication-lag-shifted + forward-filled by the
// caller onto the dataset's common `dates` axis — see cogBacktestEngine.js).
// Returns one entry per bar: { dataValid, state, score, coverage, marginal,
// contributions[], reasons[] }.
export function computeLiquidityGate(seriesById, n) {
  const { range, bullishThreshold, bearishThreshold, minCoverage, marginalMargin } = COG_LIQUIDITY_SCORE;
  const totalWeight = COG_LIQUIDITY_INPUTS.reduce((a, inp) => a + inp.weight, 0);
  const out = new Array(n);

  // One pass per input (not per bar) to build its normalized-signal array.
  const normalizedByInput = {};
  for (const input of COG_LIQUIDITY_INPUTS) {
    const series = seriesById[input.id];
    normalizedByInput[input.id] = series ? precomputeInputSignal(series) : null;
  }

  for (let i = 0; i < n; i++) {
    const contributions = [];
    let weightedSum = 0, weightPresent = 0;
    for (const input of COG_LIQUIDITY_INPUTS) {
      const series = seriesById[input.id];
      const normArr = normalizedByInput[input.id];
      const c = series ? buildContribution(input, series[i], normArr[i]) : { id: input.id, label: input.label, weight: input.weight, rawValue: null, normalized: null, signedValue: null, contribution: null };
      contributions.push(c);
      if (c.contribution != null) { weightedSum += c.contribution; weightPresent += input.weight; }
    }
    const coverage = totalWeight > 0 ? weightPresent / totalWeight : 0;
    const dataValid = coverage >= minCoverage;
    // Weight-present average vote in [-1,1], rescaled onto the configured
    // [-5,+5] LiquidityScore range.
    const avgVote = weightPresent > 0 ? weightedSum / weightPresent : null;
    const score = dataValid && avgVote != null ? clip(avgVote * range[1], range[0], range[1]) : null;

    let state = 'INVALID';
    if (dataValid && score != null) {
      if (score > bullishThreshold) state = 'BULLISH';
      else if (score < bearishThreshold) state = 'BEARISH';
      else state = 'NEUTRAL';
    }
    const marginal = dataValid && score != null && (
      Math.abs(score - bullishThreshold) <= marginalMargin || Math.abs(score - bearishThreshold) <= marginalMargin
    );

    // Reasons text: top-3 contributions by |contribution|, phrased via PHRASES.
    const ranked = contributions
      .filter(c => c.contribution != null)
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 3);
    const reasons = ranked.map(c => `${phraseFor(c.id, c.signedValue)} (${c.contribution >= 0 ? '+' : ''}${c.contribution.toFixed(2)})`);

    out[i] = { dataValid, state, score, coverage, marginal, contributions, reasons };
  }
  return out;
}
