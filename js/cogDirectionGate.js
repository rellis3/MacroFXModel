// js/cogDirectionGate.js — Gate 3: Direction Engine
//
// Cross-asset macro only (see cogConfig.js header) — DXY, USDJPY, EURUSD,
// yields, credit, Gold/Copper/Oil, ES/RTY futures. Never reads NQ/QQQ.
// Reduces COG_DIRECTION_INPUTS to a single DirectionScore in [0,100] plus a
// LONG/SHORT/NEUTRAL/INVALID classification.
//
// Normalization mirrors Gate 1 (cogLiquidityGate.js) but with a single
// `rocWindowDays` per input (cross-asset inputs move on different natural
// horizons — short for FX/rates, longer for commodities) rather than Gate
// 1's fixed 3-horizon blend, and rescales the weight-present average vote
// from [-1,1] onto [0,100] (50 = neutral) instead of Gate 1's [-5,5].

import { roc, rollingZScore, clip } from './nasdaqTransforms.js';
import { COG_DIRECTION_INPUTS, COG_DIRECTION_SCORE } from './cogConfig.js';

// [LONG-supportive phrase, SHORT-supportive phrase] per input id, read off
// the input's *signed* normalized value (after `sign` is applied) — always
// phrased as "bullish for Nasdaq" vs "bearish for Nasdaq", independent of
// whether a rising or falling raw value caused it.
const PHRASES = {
  dxy:           ['DXY weakening', 'DXY strengthening'],
  usdjpy:        ['USDJPY rising (risk-on carry flow)', 'USDJPY falling (risk-off carry unwind)'],
  eurusd:        ['EURUSD rising', 'EURUSD falling'],
  us2y:          ['Short-end yields falling (easing)', 'Short-end yields rising (tightening)'],
  us10y:         ['Long yields falling (growth-multiple tailwind)', 'Long yields rising (growth-multiple headwind)'],
  hygLqd:        ['HYG/LQD rising (credit risk appetite up)', 'HYG/LQD falling (credit risk appetite down)'],
  creditImpulse: ['HY spreads stable/tightening', 'HY spreads widening fast (credit stress impulse)'],
  gold:          ['Gold weak (risk-on)', 'Gold strong (safety bid)'],
  copper:        ['Copper strong (growth optimism)', 'Copper weak (growth pessimism)'],
  oil:           ['Oil contained', 'Oil spiking (inflation/input-cost shock)'],
  es:            ['ES futures firm (broad risk-on)', 'ES futures soft (broad risk-off)'],
  rty:           ['RTY firm (breadth healthy)', 'RTY soft (breadth weak)'],
};
function phraseFor(id, signedValue) {
  const pair = PHRASES[id] || [`${id} supportive`, `${id} unsupportive`];
  return signedValue >= 0 ? pair[0] : pair[1];
}

// Precomputes this input's normalized [-1,1] signal for every bar in one
// pass — same O(n) discipline as Gate 1, never recomputed per-bar.
function precomputeInputSignal(seriesAligned, rocWindowDays) {
  const { zWindowDays, zClip } = COG_DIRECTION_SCORE;
  const z = rollingZScore(roc(seriesAligned, rocWindowDays), zWindowDays, zClip);
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

// Computes the full Gate 3 time series from a map of input id -> aligned raw
// value array (same-day cross-asset closes/yields, no publication lag).
// Returns one entry per bar: { dataValid, state, score, coverage,
// contributions[], reasons[] }.
export function computeDirectionGate(seriesById, n) {
  const { range, longThreshold, shortThreshold, minCoverage } = COG_DIRECTION_SCORE;
  const totalWeight = COG_DIRECTION_INPUTS.reduce((a, inp) => a + inp.weight, 0);
  const out = new Array(n);

  const normalizedByInput = {};
  for (const input of COG_DIRECTION_INPUTS) {
    const series = seriesById[input.id];
    normalizedByInput[input.id] = series ? precomputeInputSignal(series, input.rocWindowDays) : null;
  }

  for (let i = 0; i < n; i++) {
    const contributions = [];
    let weightedSum = 0, weightPresent = 0;
    for (const input of COG_DIRECTION_INPUTS) {
      const series = seriesById[input.id];
      const normArr = normalizedByInput[input.id];
      const c = series ? buildContribution(input, series[i], normArr[i]) : { id: input.id, label: input.label, weight: input.weight, rawValue: null, normalized: null, signedValue: null, contribution: null };
      contributions.push(c);
      if (c.contribution != null) { weightedSum += c.contribution; weightPresent += input.weight; }
    }
    const coverage = totalWeight > 0 ? weightPresent / totalWeight : 0;
    const dataValid = coverage >= minCoverage;
    const avgVote = weightPresent > 0 ? weightedSum / weightPresent : null;
    // Rescale [-1,1] vote onto the configured [0,100] DirectionScore range
    // (50 = neutral midpoint).
    const mid = (range[0] + range[1]) / 2;
    const score = dataValid && avgVote != null ? clip(mid + avgVote * mid, range[0], range[1]) : null;

    let state = 'INVALID';
    if (dataValid && score != null) {
      if (score > longThreshold) state = 'LONG';
      else if (score < shortThreshold) state = 'SHORT';
      else state = 'NEUTRAL';
    }

    const ranked = contributions
      .filter(c => c.contribution != null)
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 3);
    const reasons = ranked.map(c => `${phraseFor(c.id, c.signedValue)} (${c.contribution >= 0 ? '+' : ''}${c.contribution.toFixed(2)})`);

    out[i] = { dataValid, state, score, coverage, contributions, reasons };
  }
  return out;
}
