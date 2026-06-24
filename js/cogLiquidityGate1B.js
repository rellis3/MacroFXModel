// js/cogLiquidityGate1B.js — Gate 1B: Fast Intraday Flow Threshold
//
// Composite FlowScore = weighted sum of normalized intraday z-scores of each
// COG_LIQUIDITY_1B_INPUTS entry's own short-horizon ROC, rescaled onto
// [-100, +100]. Unlike Gate1A's BULLISH/BEARISH/NEUTRAL three-way split,
// this gate's spec is binary-with-a-dead-zone: score > +35 = BULLISH
// (valid), score < -35 = BEARISH (valid), anything else — including the
// dead zone and insufficient coverage — is INVALID. There is no separate
// NEUTRAL state here.
//
// Operates at INTRADAY bar resolution (5-min bars by default — see
// COG_INTRADAY_SCHEDULE), not Gate1A's daily resolution. Never touches
// Nasdaq price (same constraint as every other gate — cogConfig.js header).
//
// "No black boxes": computeLiquidityGate1B returns, for every bar, the raw
// value, the normalized [-1,1] sub-signal and the final weighted
// contribution of every input — never just the composite FlowScore.

import { roc, rollingZScore, clip } from './nasdaqTransforms.js';
import { COG_LIQUIDITY_1B_INPUTS, COG_LIQUIDITY_1B_SCORE } from './cogConfig.js';

// [supportivePhrase, opposingPhrase] per input id, read off the input's
// *signed* normalized value (after `sign` is applied) — phrased "bullish for
// Nasdaq" vs "bearish for Nasdaq", independent of which raw direction caused it.
const PHRASES = {
  dxy:     ['DXY falling fast (dollar flow supportive)', 'DXY rising fast (dollar flow headwind)'],
  us10y:   ['US10Y yields falling fast', 'US10Y yields rising fast'],
  us2y:    ['US2Y yields falling fast', 'US2Y yields rising fast'],
  hygLqd:  ['HYG/LQD rising fast (credit risk appetite up)', 'HYG/LQD falling fast (credit risk appetite down)'],
  breadth: ['SPY/ES breadth firming', 'SPY/ES breadth weakening'],
  vix:     ['VIX falling fast (vol flow calm)', 'VIX rising fast (vol flow stress)'],
  vvix:    ['VVIX falling fast', 'VVIX rising fast'],
};
function phraseFor(id, signedValue) {
  const pair = PHRASES[id] || [`${id} supportive`, `${id} unsupportive`];
  return signedValue >= 0 ? pair[0] : pair[1];
}

// Precomputes this input's normalized [-1,1] signal for every bar in one
// pass — same O(n) discipline as Gate1A/Gate3, never recomputed per-bar.
// `rocBars` is INTRADAY bars back (e.g. 3 bars = 15min at a 5min cadence),
// not a daily horizon.
function precomputeInputSignal(seriesAligned, rocBars) {
  const { zWindowBars, zClip } = COG_LIQUIDITY_1B_SCORE;
  const z = rollingZScore(roc(seriesAligned, rocBars), zWindowBars, zClip);
  return z.map(v => Number.isFinite(v) ? clip(v / zClip, -1, 1) : null);
}

function buildContribution(input, rawValue, normalized) {
  if (!Number.isFinite(rawValue) || normalized == null) {
    return { id: input.id, label: input.label, weight: input.weight, rawValue: Number.isFinite(rawValue) ? rawValue : null, normalized: null, signedValue: null, contribution: null };
  }
  const signedValue = input.sign * normalized;
  const contribution = input.weight * signedValue;
  return { id: input.id, label: input.label, weight: input.weight, rawValue, normalized, signedValue, contribution };
}

// Computes the full Gate1B time series from a map of input id -> aligned
// INTRADAY raw value array (same bar axis as the dataset's intraday OHLC —
// no publication lag, these are live intraday market reads). Returns one
// entry per bar: { dataValid, state, valid, score, coverage, contributions[], reasons[] }.
export function computeLiquidityGate1B(seriesById, n) {
  const { range, bullishThreshold, bearishThreshold, minCoverage } = COG_LIQUIDITY_1B_SCORE;
  const totalWeight = COG_LIQUIDITY_1B_INPUTS.reduce((a, inp) => a + inp.weight, 0);
  const out = new Array(n);

  const normalizedByInput = {};
  for (const input of COG_LIQUIDITY_1B_INPUTS) {
    const series = seriesById[input.id];
    normalizedByInput[input.id] = series ? precomputeInputSignal(series, input.rocBars) : null;
  }

  for (let i = 0; i < n; i++) {
    const contributions = [];
    let weightedSum = 0, weightPresent = 0;
    for (const input of COG_LIQUIDITY_1B_INPUTS) {
      const series = seriesById[input.id];
      const normArr = normalizedByInput[input.id];
      const c = series ? buildContribution(input, series[i], normArr[i]) : { id: input.id, label: input.label, weight: input.weight, rawValue: null, normalized: null, signedValue: null, contribution: null };
      contributions.push(c);
      if (c.contribution != null) { weightedSum += c.contribution; weightPresent += input.weight; }
    }
    const coverage = totalWeight > 0 ? weightPresent / totalWeight : 0;
    const dataValid = coverage >= minCoverage;
    const avgVote = weightPresent > 0 ? weightedSum / weightPresent : null;
    const score = dataValid && avgVote != null ? clip(avgVote * range[1], range[0], range[1]) : null;

    let state = 'INVALID';
    if (dataValid && score != null) {
      if (score > bullishThreshold) state = 'BULLISH';
      else if (score < bearishThreshold) state = 'BEARISH';
      // Dead zone between the two thresholds stays INVALID per spec — Gate1B has no NEUTRAL state.
    }
    const valid = state === 'BULLISH' || state === 'BEARISH';

    const ranked = contributions
      .filter(c => c.contribution != null)
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 3);
    const reasons = ranked.map(c => `${phraseFor(c.id, c.signedValue)} (${c.contribution >= 0 ? '+' : ''}${c.contribution.toFixed(2)})`);

    out[i] = { dataValid, state, valid, score, coverage, contributions, reasons };
  }
  return out;
}
